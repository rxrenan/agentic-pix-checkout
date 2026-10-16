#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -d node_modules/tsx ]]; then
  npm install
fi
npm run demo
