#!/usr/bin/env bash
# Build targets from a machine with Godot 4.4.1 export templates installed.
#
#   GODOT=/path/to/godot ./build.sh windows
#   GODOT=/path/to/godot ./build.sh android
#   GODOT=/path/to/godot ./build.sh all
#
# The Android target is a debug-signed, directly installable APK. It uses the
# debug keystore configured in the Godot editor or in
# GODOT_ANDROID_KEYSTORE_DEBUG_{PATH,USER,PASSWORD}. Also needs JDK 17+ and an
# Android SDK with platform-tools, build-tools and platform 34. See README.md.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
GODOT="${GODOT:-godot}"
TARGET="${1:-all}"
mkdir -p build/windows build/android

build_windows() {
  "$GODOT" --headless --path "$ROOT" --export-release "Windows Desktop" "$ROOT/build/windows/WiesbadenSurvivors.exe"
  # Keep the per-user Windows installer next to the executable. It copies the
  # EXE to %LOCALAPPDATA%\Programs and creates Desktop + Start Menu shortcuts.
  cp -f "$ROOT/tools/Desktop-Verknuepfung-erstellen.cmd" "$ROOT/build/windows/Desktop-Verknuepfung-erstellen.cmd"
  cp -f "$ROOT/tools/desktop-shortcut.ps1" "$ROOT/build/windows/desktop-shortcut.ps1"
  echo "Windows build: build/windows/WiesbadenSurvivors.exe"
  echo "Windows installer: build/windows/Desktop-Verknuepfung-erstellen.cmd"
}

build_android() {
  # Godot's apksigner is a Java launcher; expose the configured JDK even when
  # the caller only exported JAVA_HOME and has no JDK bin on PATH.
  if [[ -n "${JAVA_HOME:-}" ]]; then
    export PATH="$JAVA_HOME/bin:$PATH"
  fi
  "$GODOT" --headless --path "$ROOT" --export-debug "Android" "$ROOT/build/android/WiesbadenSurvivors-debug.apk"
  echo "Android debug build: build/android/WiesbadenSurvivors-debug.apk"
}

case "$TARGET" in
  windows) build_windows ;;
  android) build_android ;;
  all) build_windows; build_android ;;
  *) echo "usage: $0 [windows|android|all]" >&2; exit 2 ;;
esac
