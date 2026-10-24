#!/bin/sh
# Rebuild the content from tools/cases/*.js: check every item, draw the icons, build the Word documents and seed/seed.json.
set -e
cd "$(dirname "$0")/.."
export NODE_PATH="${NODE_PATH:-$(npm root -g)}"
node tools/build-content.js
node tools/build-icons.js
python3 tools/build-icon-png.py
node tools/build-docs.js
node tools/build-seed.js
node tools/build-guides.js
