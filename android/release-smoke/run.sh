#!/usr/bin/env bash
set -euo pipefail
sdk="${ANDROID_HOME:?Set ANDROID_HOME}"
out="${1:?Pass an existing output directory}"
src="$(cd -- "$(dirname -- "$0")" && pwd)"
test -d "$out"
out="$(cd -- "$out" && pwd)"
build="$sdk/build-tools/35.0.0"
jar="$sdk/platforms/android-35/android.jar"
mkdir -p "$out/classes" "$out/dex"
javac --release 8 -cp "$jar" -d "$out/classes" "$src/Smoke.java"
"$build/d8" --lib "$jar" --min-api 26 --output "$out/dex" "$out/classes/de/nanyee/smoke/Smoke.class"
"$build/aapt" package -f -M "$src/AndroidManifest.xml" -I "$jar" -F "$out/smoke-unsigned.apk"
(cd "$out/dex" && "$build/aapt" add "$out/smoke-unsigned.apk" classes.dex)
"$build/zipalign" -f 4 "$out/smoke-unsigned.apk" "$out/smoke-aligned.apk"
"$build/apksigner" sign --ks "$HOME/.android/debug.keystore" --ks-key-alias androiddebugkey --ks-pass pass:android --key-pass pass:android --out "$out/smoke.apk" "$out/smoke-aligned.apk"
"$sdk/platform-tools/adb" install -r "$out/smoke.apk"
result="$("$sdk/platform-tools/adb" shell am instrument -w de.nanyee.smoke/.Smoke)"
printf '%s\n' "$result"
[[ "$result" == *"PASS: release ONNX JNI/model inference [1,4,10]; MainActivity launched"* ]]
