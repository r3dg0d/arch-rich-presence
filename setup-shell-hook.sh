#!/bin/bash
# Setup script to add shell hooks for real-time command tracking
# This will write commands to a temp file immediately when executed

HOOK_FILE="/tmp/arch-rp-last-command.txt"
SHELL_RC=""

# Detect shell and determine rc file
if [ -n "$ZSH_VERSION" ]; then
    SHELL_RC="$HOME/.zshrc"
    HOOK='# Arch Rich Presence - Command Tracking Hook
arch_rp_hook() {
    local cmd=$(history 1 | sed "s/^[ ]*[0-9]*[ ]*//")
    echo "$cmd" > /tmp/arch-rp-last-command.txt 2>/dev/null
}
precmd_functions+=(arch_rp_hook)'
elif [ -n "$BASH_VERSION" ]; then
    SHELL_RC="$HOME/.bashrc"
    HOOK='# Arch Rich Presence - Command Tracking Hook
arch_rp_hook() {
    local cmd=$(history 1 | sed "s/^[ ]*[0-9]*[ ]*//")
    echo "$cmd" > /tmp/arch-rp-last-command.txt 2>/dev/null
}
PROMPT_COMMAND="arch_rp_hook;$PROMPT_COMMAND"'
else
    echo "Unsupported shell. Currently supports bash and zsh."
    exit 1
fi

# Check if hook already exists
if grep -q "Arch Rich Presence - Command Tracking Hook" "$SHELL_RC" 2>/dev/null; then
    echo "Shell hook already exists in $SHELL_RC"
    echo "To remove it, manually delete the 'Arch Rich Presence - Command Tracking Hook' section"
else
    echo "Adding shell hook to $SHELL_RC..."
    echo "" >> "$SHELL_RC"
    echo "$HOOK" >> "$SHELL_RC"
    echo "Shell hook added successfully!"
    echo "Please restart your terminal or run: source $SHELL_RC"
fi

