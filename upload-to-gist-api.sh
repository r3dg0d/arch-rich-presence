#!/bin/bash
# Upload Terms of Service and Privacy Policy to GitHub Gist using GitHub API
# Usage: ./upload-to-gist-api.sh
# Requirements: GitHub Personal Access Token with 'gist' scope

if [ -z "$GITHUB_TOKEN" ]; then
    echo "Error: GITHUB_TOKEN environment variable is not set."
    echo ""
    echo "To get a GitHub Personal Access Token:"
    echo "1. Go to https://github.com/settings/tokens"
    echo "2. Click 'Generate new token' -> 'Generate new token (classic)'"
    echo "3. Give it a name like 'Gist Upload'"
    echo "4. Select the 'gist' scope"
    echo "5. Click 'Generate token' and copy it"
    echo ""
    echo "Then run:"
    echo "  export GITHUB_TOKEN='your_token_here'"
    echo "  ./upload-to-gist-api.sh"
    exit 1
fi

echo "Creating Gist for Terms of Service..."

TOS_GIST_RESPONSE=$(curl -s -X POST \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/gists \
  -d "{
    \"description\": \"Arch Linux Rich Presence - Terms of Service\",
    \"public\": true,
    \"files\": {
      \"terms-of-service.txt\": {
        \"content\": $(cat terms-of-service.txt | jq -Rs .)
      }
    }
  }")

TOS_URL=$(echo "$TOS_GIST_RESPONSE" | grep -o '"html_url": "[^"]*' | head -1 | cut -d'"' -f4)

if [ -n "$TOS_URL" ]; then
    echo "✓ Terms of Service uploaded!"
    echo "  URL: $TOS_URL"
    echo "$TOS_URL" > /tmp/tos-gist-url.txt
else
    echo "✗ Failed to upload Terms of Service"
    echo "$TOS_GIST_RESPONSE" | jq -r '.message // .' 2>/dev/null || echo "$TOS_GIST_RESPONSE"
    exit 1
fi

echo ""
echo "Creating Gist for Privacy Policy..."

PP_GIST_RESPONSE=$(curl -s -X POST \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/gists \
  -d "{
    \"description\": \"Arch Linux Rich Presence - Privacy Policy\",
    \"public\": true,
    \"files\": {
      \"privacy-policy.txt\": {
        \"content\": $(cat privacy-policy.txt | jq -Rs .)
      }
    }
  }")

PP_URL=$(echo "$PP_GIST_RESPONSE" | grep -o '"html_url": "[^"]*' | head -1 | cut -d'"' -f4)

if [ -n "$PP_URL" ]; then
    echo "✓ Privacy Policy uploaded!"
    echo "  URL: $PP_URL"
    echo "$PP_URL" > /tmp/pp-gist-url.txt
else
    echo "✗ Failed to upload Privacy Policy"
    echo "$PP_GIST_RESPONSE" | jq -r '.message // .' 2>/dev/null || echo "$PP_GIST_RESPONSE"
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

