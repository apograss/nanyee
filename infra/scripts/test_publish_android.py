import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path


class PublishAndroidTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.repository = self.root / "repository"
        scripts = self.repository / "infra" / "scripts"
        scripts.mkdir(parents=True)
        self.script = scripts / "publish-android.sh"
        shutil.copy2(Path(__file__).with_name("publish-android.sh"), self.script)
        self.apk = self.root / "release.apk"
        self.apk.write_bytes(b"signed APK fixture")
        self.destination = self.root / "downloads"
        self.env = {
            **os.environ,
            "GIT_AUTHOR_NAME": "Publisher Test",
            "GIT_AUTHOR_EMAIL": "test@example.invalid",
            "GIT_COMMITTER_NAME": "Publisher Test",
            "GIT_COMMITTER_EMAIL": "test@example.invalid",
            "NANYEE_DOWNLOAD_DIR": str(self.destination),
            "APK_BADGING": "package: name='de.nanyee.app' versionCode='100' versionName='1.0.0'",
            "APK_CERT": "Signer #1 certificate DN: CN=Nanyee Release",
        }
        for name, variable in (("apksigner", "APK_CERT"), ("aapt2", "APK_BADGING")):
            tool = self.root / name
            tool.write_text(f'#!/bin/sh\nprintf "%s\\n" "${variable}"\n')
            tool.chmod(0o755)
            self.env[name.upper()] = str(tool)
        for args in (
            ("init", "-q"),
            ("add", "--", "infra/scripts/publish-android.sh"),
            ("commit", "-qm", "fixture"),
        ):
            subprocess.run(["git", "-C", str(self.repository), *args], env=self.env, check=True)  # noqa: S603, S607

    def publish(self, code="100", version="1.0.0"):
        return subprocess.run(  # noqa: S603
            ["bash", str(self.script), str(self.apk), code, version, "Release notes"],  # noqa: S607
            env=self.env,
            capture_output=True,
            text=True,
        )

    def test_matching_version_publishes_apk_source_and_manifest(self):
        result = self.publish()
        self.assertEqual(0, result.returncode, result.stderr)
        manifest = json.loads((self.destination / "version.json").read_text())
        self.assertEqual(100, manifest["versionCode"])
        self.assertEqual("1.0.0", manifest["versionName"])
        self.assertEqual(
            self.apk.read_bytes(), (self.destination / "nanyee-1.0.0.apk").read_bytes()
        )
        self.assertTrue((self.destination / "nanyee-1.0.0-source.tar.gz").is_file())

    def test_mismatched_code_or_name_never_creates_destination(self):
        for code, version in (("101", "1.0.0"), ("100", "1.0.1")):
            with self.subTest(code=code, version=version):
                result = self.publish(code, version)
                self.assertNotEqual(0, result.returncode)
                self.assertIn("do not match", result.stderr)
                self.assertFalse(self.destination.exists())

    def test_missing_or_failed_metadata_is_rejected(self):
        for badging in ("", "package: name='de.nanyee.app' versionCode='100'"):
            with self.subTest(badging=badging):
                self.env["APK_BADGING"] = badging
                result = self.publish()
                self.assertIn("APK version metadata missing", result.stderr)
                self.assertFalse(self.destination.exists())
        self.env["AAPT2"] = "/bin/false"
        self.assertIn("APK metadata verification failed", self.publish().stderr)
        self.assertFalse(self.destination.exists())

    def test_debug_certificate_is_rejected_before_metadata(self):
        self.env["APK_CERT"] = "Signer #1 certificate DN: CN=Android Debug, O=Android, C=US"
        self.env["AAPT2"] = "/bin/false"
        self.assertIn("Refusing Android Debug signed APK", self.publish().stderr)
        self.assertFalse(self.destination.exists())

    def test_existing_apk_is_not_overwritten(self):
        self.destination.mkdir()
        target = self.destination / "nanyee-1.0.0.apk"
        target.write_bytes(b"previous release")
        self.assertIn("different APK", self.publish().stderr)
        self.assertEqual(b"previous release", target.read_bytes())
        self.assertFalse((self.destination / "version.json").exists())


if __name__ == "__main__":
    unittest.main()
