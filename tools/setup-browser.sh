#!/usr/bin/env bash
# setup-browser.sh — user-space shared libraries + fonts for the Playwright
# Chromium binaries on a machine without root and without a usable apt index.
#
# Why this exists: the cloud workspace is Ubuntu 24.04 with no root, an empty
# apt package index and Chromium binaries that die on load with
# "libnspr4.so: cannot open shared object file". `playwright install-deps`
# needs root. So: resolve the exact .deb URLs from the distro's own Packages
# index, extract them with dpkg-deb into $HOME/sysroot and put that prefix on
# LD_LIBRARY_PATH. Nothing is installed system-wide.
#
# 2026-10-29: the FONT stack is part of the recipe, not an optional extra.
# Without libfreetype/libfontconfig/libharfbuzz + real .ttf files, Chromium
# starts and paints the canvas normally but lays out EVERY text node at height
# 0 — the HUD looks "empty" and inner_text returns "". That produced a false
# "missing wave label" defect report. With the font packages below, a probe div
# measures 30px for a 26px font and inner_text is correct.
#
# Usage:
#   tools/setup-browser.sh                 # fetch + extract + verify (idempotent)
#   tools/setup-browser.sh --check         # only verify the current sysroot
#   tools/setup-browser.sh --env           # print the exports to eval
#   tools/setup-browser.sh --add PKG [PKG…]  # add packages, then verify
#
# Then:
#   eval "$(tools/setup-browser.sh --env)"
#   python tools/pw_polish_audit.py
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SYSROOT="${SYSROOT:-$HOME/sysroot}"
CACHE="${CACHE:-$HOME/.cache/wbns-debs}"
ARCH="$(dpkg --print-architecture 2>/dev/null || echo amd64)"
CODENAME="$(. /etc/os-release && echo "${VERSION_CODENAME:-noble}")"

# Everything the chromium binaries link against, PLUS the font stack and font
# files (see the header note). Extra packages can be passed with --add; the
# loader names anything still missing.
PKGS=(
  libnspr4 libnss3
  libatk1.0-0t64 libatk-bridge2.0-0t64 libatspi2.0-0t64
  libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libxrender1
  libasound2t64 libxkbcommon0 libcups2t64
  libpango-1.0-0 libcairo2 libdatrie1 libthai0 libxcb-render0
  libpixman-1-0 libpng16-16t64 libgraphite2-3
  libfreetype6 libfontconfig1 libharfbuzz0b
  libavahi-client3 libavahi-common3
  fonts-dejavu-core fonts-liberation
)

MODE="setup"
EXTRA=()
while [ $# -gt 0 ]; do
  case "$1" in
    --check) MODE="check"; shift ;;
    --env)   MODE="env"; shift ;;
    --add)   shift
             # accept a list: every following non-flag argument
             while [ $# -gt 0 ] && [ "${1#--}" = "$1" ]; do EXTRA+=("$1"); shift; done ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

LIBS="$SYSROOT/usr/lib/x86_64-linux-gnu:$SYSROOT/lib/x86_64-linux-gnu"
FONTCONF="$SYSROOT/etc/fonts/fonts.conf"
SHELL_BIN="$(ls -d "$HOME"/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell 2>/dev/null | head -1 || true)"
FULL_BIN="$(ls -d "$HOME"/.cache/ms-playwright/chromium-*/chrome-linux64/chrome 2>/dev/null | head -1 || true)"

missing_of() {  # missing_of <binary>
  [ -n "$1" ] || { echo "binary not found" >&2; return 1; }
  LD_LIBRARY_PATH="$LIBS" ldd "$1" 2>/dev/null | awk '/not found/ {print $1}' | sort -u
}

env_lines() {
  echo "export LD_LIBRARY_PATH=\"$LIBS\${LD_LIBRARY_PATH:+:\$LD_LIBRARY_PATH}\""
  [ -f "$FONTCONF" ] && echo "export FONTCONFIG_FILE=\"$FONTCONF\""
}

write_fontconfig() {
  [ -d "$SYSROOT/usr/share/fonts" ] || return 0
  mkdir -p "$SYSROOT/etc/fonts"
  cat > "$FONTCONF" <<EOF
<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig>
  <dir>$SYSROOT/usr/share/fonts</dir>
  <cachedir>$HOME/.cache/fontconfig</cachedir>
  <match target="pattern"><test name="family"><string>monospace</string></test>
    <edit name="family" mode="assign" binding="strong"><string>DejaVu Sans Mono</string></edit></match>
</fontconfig>
EOF
}

if [ "$MODE" = "env" ]; then env_lines; exit 0; fi

if [ "$MODE" = "check" ]; then
  rc=0
  for b in "$SHELL_BIN" "$FULL_BIN"; do
    [ -n "$b" ] || continue
    m="$(missing_of "$b" || true)"
    if [ -z "$m" ]; then echo "OK: $(basename "$b") loads"; else echo "MISSING in $(basename "$b"):"; echo "$m"; rc=1; fi
  done
  # fonts present? (a loadable binary with no font files still lays out no text)
  if [ -d "$SYSROOT/usr/share/fonts" ] && [ -n "$(find "$SYSROOT/usr/share/fonts" -name '*.ttf' -print -quit 2>/dev/null)" ]; then
    echo "OK: font files present"
  else
    echo "MISSING: no .ttf under $SYSROOT/usr/share/fonts — text will not lay out"; rc=1
  fi
  exit $rc
fi

mkdir -p "$SYSROOT" "$CACHE"
IDX="$CACHE/Packages.txt"

# ---- 1. package index (exact Filename per package) --------------------------
if [ ! -s "$IDX" ]; then
  echo "== fetching $CODENAME package index"
  : > "$IDX.part"
  for suite in "$CODENAME" "$CODENAME-updates" "$CODENAME-security"; do
    for comp in main universe; do
      url="http://archive.ubuntu.com/ubuntu/dists/$suite/$comp/binary-$ARCH/Packages.xz"
      if curl -fsS -m 180 -o "$CACHE/pkg.xz" "$url"; then xz -dc "$CACHE/pkg.xz" >> "$IDX.part" || true; fi
    done
  done
  mv "$IDX.part" "$IDX"
fi
echo "== index: $(wc -l < "$IDX") lines"

# ---- 2. download + extract ---------------------------------------------------
python3 - "$IDX" "$CACHE" "$SYSROOT" "${PKGS[@]}" "${EXTRA[@]}" <<'PY'
import io, os, re, subprocess, sys

idx, cache, sysroot, names = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4:]

files = {}
cur = {}
def flush():
    if 'Package' in cur and 'Filename' in cur:
        files[cur['Package']] = cur['Filename']   # last wins = newest suite
for line in io.open(idx, encoding='utf-8', errors='replace'):
    line = line.rstrip('\n')
    if not line.strip():
        flush(); cur = {}; continue
    m = re.match(r'^([A-Za-z-]+):\s*(.*)$', line)
    if m:
        cur[m.group(1)] = m.group(2)
flush()

got, missing = [], []
for n in dict.fromkeys(names):          # de-dupe, keep order
    fn = files.get(n)
    if not fn:
        missing.append(n); continue
    deb = os.path.join(cache, os.path.basename(fn))
    if not os.path.exists(deb):
        subprocess.run(['curl', '-fsS', '-m', '240', '-o', deb,
                        'http://archive.ubuntu.com/ubuntu/' + fn], check=False)
    if not os.path.exists(deb):
        missing.append(n); continue
    r = subprocess.run(['dpkg-deb', '-x', deb, sysroot])
    if r.returncode == 0:
        got.append(n)
    else:
        missing.append(n)

print('extracted %d package(s): %s' % (len(got), ' '.join(got)))
if missing:
    print('NOT INSTALLED: ' + ' '.join(missing))
PY

write_fontconfig

# ---- 3. verify the loader is satisfied --------------------------------------
echo "== ldd check"
rc=0
for b in "$SHELL_BIN" "$FULL_BIN"; do
  [ -n "$b" ] || continue
  m="$(missing_of "$b" || true)"
  if [ -n "$m" ]; then echo "STILL MISSING in $(basename "$b"):"; echo "$m"; rc=1; fi
done
if [ ! -f "$FONTCONF" ]; then echo "WARN: no fontconfig at $FONTCONF (text may not lay out)"; fi
[ $rc -eq 0 ] && echo "OK: chromium binaries load; run with:" && env_lines
exit $rc
