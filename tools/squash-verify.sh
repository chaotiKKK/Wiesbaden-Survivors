#!/usr/bin/env bash
# Reproduce the offscreen still pair, verify it against the live renderer, then
# rebuild the main sheet with the live-verification badge.
set -euo pipefail
cd "$(dirname "$0")/.."
eval "$(bash tools/setup-browser.sh --env)"
PY="${PYTHON:-$HOME/pwenv/bin/python}"
"$PY" tools/_squash-stills.py
"$PY" tools/_squash-live.py
"$PY" tools/_squash-stills.py
