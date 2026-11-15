#!/bin/bash
set -u
cd "$(dirname "$0")" || exit 1
if [ -x runtime/node ]; then
  sam_node="$PWD/runtime/node"
elif command -v node >/dev/null 2>&1; then
  sam_node=$(command -v node)
else
  echo 'Node.js 24 is required when running from source.'
  read -r -p 'Press Enter to close.'
  exit 1
fi
"$sam_node" scripts/desktop.mjs "$@"
status=$?
if [ "$status" -ne 0 ] && [ -t 0 ]; then read -r -p 'Press Enter to close.'; fi
exit "$status"
