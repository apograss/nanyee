#!/usr/bin/env bash
set -euo pipefail
python3 - "$@" <<'PY'
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sys
import tempfile

if len(sys.argv) != 5:
    sys.exit("Usage: publish-android.sh <apk> <versionCode> <versionName> <notes>")
source, code, version, notes = sys.argv[1:]
if not code.isdecimal() or int(code) < 1 or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", version):
    sys.exit("Invalid version")
source = Path(source)
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
                size=source.stat().st_size, notes=notes,
                publishedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())
for filename, binary in ((name, True), ("version.json", False)):
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=destination, delete=False) as output:
            temporary = Path(output.name)
            if binary:
                with source.open("rb") as apk:
                    shutil.copyfileobj(apk, output)
            else:
                output.write((json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode())
            output.flush()
            os.fsync(output.fileno())
        temporary.chmod(0o644)
        temporary.replace(destination / filename)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
print(f"Published {name} ({manifest['size']} bytes), then version.json")
PY
