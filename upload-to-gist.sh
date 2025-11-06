#!/bin/bash
# Upload Terms of Service and Privacy Policy to GitHub Gist
# Usage: ./upload-to-gist.sh
# Requirements: GitHub CLI (gh) must be installed and authenticated

if ! command -v gh &> /dev/null; then
    echo "Error: GitHub CLI (gh) is not installed."
    echo "Install it with: sudo pacman -S github-cli (Arch Linux)"
    echo "Or visit: https://cli.github.com/"
    exit 1
fi

# Check if authenticated
if ! gh auth status &> /dev/null; then
    echo "Error: GitHub CLI is not authenticated."
    echo "Run: gh auth login"
    exit 1
fi

echo "Creating Gist for Terms of Service..."
TOS_GIST=$(gh gist create terms-of-service.txt --public --desc "Arch Linux Rich Presence - Terms of Service" 2>&1)

if [[ $? -eq 0 ]]; then
    TOS_URL=$(echo "$TOS_GIST" | grep -o 'https://gist.github.com/[^ ]*' | head -1)
    echo "✓ Terms of Service uploaded!"
    echo "  URL: $TOS_URL"
    echo "$TOS_URL" > /tmp/tos-gist-url.txt
else
    echo "✗ Failed to upload Terms of Service"
    echo "$TOS_GIST"
    exit 1
fi

echo ""
echo "Creating Gist for Privacy Policy..."
PP_GIST=$(gh gist create privacy-policy.txt --public --desc "Arch Linux Rich Presence - Privacy Policy" 2>&1)

if [[ $? -eq 0 ]]; then
    PP_URL=$(echo "$PP_GIST" | grep -o 'https://gist.github.com/[^ ]*' | head -1)
    echo "✓ Privacy Policy uploaded!"
    echo "  URL: $PP_URL"
    echo "$PP_URL" > /tmp/pp-gist-url.txt
else
    echo "✗ Failed to upload Privacy Policy"
    echo "$PP_GIST"
    exit 1
fi

echo ""
echo "=========================================="
echo "GitHub Gist URLs (permanent):"
echo "=========================================="
echo "Terms of Service:"
cat /tmp/tos-gist-url.txt
echo ""
echo "Privacy Policy:"
cat /tmp/pp-gist-url.txt
echo ""
echo "=========================================="
echo "Use these URLs in the Discord Developer Portal"
echo "=========================================="

