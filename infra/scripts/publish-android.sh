#!/usr/bin/env bash
set -euo pipefail
repository=$(git -C "$(dirname "$0")/../.." rev-parse --show-toplevel)
python3 - "$repository" "$@" <<'PY'
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

if len(sys.argv) not in (6, 7):
    sys.exit("Usage: publish-android.sh <apk> <versionCode> <versionName> <notes> [commit/tag]")
repository, source, code, version, notes = sys.argv[1:6]
reference = sys.argv[6] if len(sys.argv) == 7 else "HEAD"
if not code.isdecimal() or int(code) < 1 or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", version):
    sys.exit("Invalid version")
source = Path(source)
apksigner = os.environ.get("APKSIGNER", "apksigner")
try:
    certificate = subprocess.run([apksigner, "verify", "--print-certs", str(source)], check=True, capture_output=True, text=True).stdout
except (OSError, subprocess.CalledProcessError):
    sys.exit("APK signature verification failed; set APKSIGNER to the Android SDK build-tools executable")
if not re.search(r"Signer #\d+ certificate DN:", certificate):
    sys.exit("APK signer certificate missing")
if re.search(r"\bCN\s*=\s*Android Debug\s*(?:,|$)", certificate, re.IGNORECASE | re.MULTILINE):
    sys.exit("Refusing Android Debug signed APK")
def git(*args):
    return subprocess.check_output(["git", "-C", repository, *args]).decode().strip()

if git("status", "--porcelain", "--untracked-files=normal"):
    sys.exit("Publish from a clean checkout of the exact APK build commit")
commit = git("rev-parse", "--verify", reference + "^{commit}")
if commit != git("rev-parse", "HEAD"):
    sys.exit("Check out the exact APK build commit before publishing")
destination = Path(os.environ.get("NANYEE_DOWNLOAD_DIR", "/srv/nanyee/downloads/android"))
destination.mkdir(parents=True, exist_ok=True)
name = f"nanyee-{version}.apk"
def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()

digest = sha256(source)
target = destination / name
if target.exists() and sha256(target) != digest:
    sys.exit("Version filename already contains a different APK")
manifest = dict(versionCode=int(code), versionName=version,
                url=f"https://nanyee.de/downloads/android/{name}", sha256=digest,
                sourceUrl=f"https://nanyee.de/downloads/android/nanyee-{version}-source.tar.gz", sourceRef=commit,
                size=source.stat().st_size, notes=notes,
                publishedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())
for filename, kind in ((name, "apk"), (f"nanyee-{version}-source.tar.gz", "source"), ("version.json", "json")):
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=destination, delete=False) as output:
            temporary = Path(output.name)
            if kind == "apk":
                with source.open("rb") as apk:
                    shutil.copyfileobj(apk, output)
            elif kind == "source":
                subprocess.run(["git", "-C", repository, "archive", "--format=tar.gz", f"--prefix=nanyee-{version}/", commit], stdout=output, check=True)
            else:
                output.write((json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode())
            output.flush()
            os.fsync(output.fileno())
        temporary.chmod(0o644)
        if kind == "apk" and sha256(temporary) != digest:
            sys.exit("APK changed while publishing")
        temporary.replace(destination / filename)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
print(f"Published {name} ({manifest['size']} bytes) and matching source, then version.json")
PY
