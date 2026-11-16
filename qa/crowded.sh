#!/usr/bin/env bash
# The crowded day, photographed (Q-03): the built client served by one API on
# a scratch database, the demo team on it with forty late pieces and long
# titles (scripts/demo-data.mjs --crowded), every screen of every kind of
# person captured into design-overview/ (qa/capture.mjs). The crowded-screens
# workflow runs this on a pull request that touches client/ and uploads the
# board for its reviewers. Nothing here fails on pixels.
#
#   bash qa/crowded.sh                       (Playwright's Chromium)
#   PW_CHANNEL=chrome bash qa/crowded.sh     (the Chrome you have)
#
# CROWDED_PORT picks the port (4097); CAPTURE_LANG the language (en).
set -euo pipefail
cd "$(dirname "$0")/.."
export DASHB_ROOT="${DASHB_ROOT:-$PWD}"
PORT="${CROWDED_PORT:-4097}"
TMP="${RUNNER_TEMP:-$(mktemp -d)}"
export DATA_DIR="$TMP/data-crowded"
rm -rf "$DATA_DIR"
mkdir -p "$DATA_DIR"

npm run build
node server/seed.js
PORT=$PORT node server/index.js > "$TMP/crowded-api.log" 2>&1 &
api=$!
trap 'code=$?; kill $api 2>/dev/null || true; [ $code -eq 0 ] || { echo "--- API log ---"; tail -100 "$TMP/crowded-api.log"; }' EXIT
for _ in $(seq 1 60); do curl -sf "http://localhost:$PORT/api/health" >/dev/null && break; sleep 0.5; done
curl -sf "http://localhost:$PORT/api/health" >/dev/null || { cat "$TMP/crowded-api.log"; exit 1; }

DEMO_API="http://localhost:$PORT" node scripts/demo-data.mjs --crowded
DEMO_WEB="http://localhost:$PORT" node qa/capture.mjs
