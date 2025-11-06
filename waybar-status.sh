#!/bin/bash

# Get the actual script directory, even when called via symlink
SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" 2>/dev/null && pwd || cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

STATUS_FILE="${TMPDIR:-/tmp}/arch-rp-status.json"

if [ -f "$STATUS_FILE" ]; then
    # Parse JSON to get active status
    STATUS=$(grep -o '"active":[^,}]*' "$STATUS_FILE" | grep -o '[^:]*$' | tr -d ' ')
    if [ "$STATUS" = "true" ]; then
        echo '{"text": "🎮", "tooltip": "Discord Rich Presence: Active\nClick to enable Privacy Mode", "class": "enabled"}'
    else
        echo '{"text": "🔒", "tooltip": "Discord Rich Presence: Privacy Mode\nClick to enable", "class": "disabled"}'
    fi
else
    echo '{"text": "⚫", "tooltip": "Discord Rich Presence: Not Running\nStart the service to use", "class": "stopped"}'
fi

