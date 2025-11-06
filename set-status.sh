#!/bin/bash

# Get the actual script directory, even when called via symlink
SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
node "$SCRIPT_DIR/src/set-status.js" "$@"

