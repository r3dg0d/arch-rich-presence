# Upload Terms of Service and Privacy Policy to GitHub Gist

To get permanent URLs for your Discord app verification, you need to upload the documents to GitHub Gist.

## Option 1: Using GitHub CLI (Recommended)

1. **Authenticate with GitHub CLI:**
   ```bash
   gh auth login
   ```
   Follow the prompts to authenticate (web browser or token).

2. **Upload the files:**
   ```bash
   cd /home/r3dg0d/Documents/arch-rich-presence
   ./upload-to-gist.sh
   ```

3. **Copy the URLs** that are displayed - these are permanent GitHub Gist URLs.

## Option 2: Using GitHub API with Token

1. **Get a GitHub Personal Access Token:**
   - Go to https://github.com/settings/tokens
   - Click "Generate new token" -> "Generate new token (classic)"
   - Name it "Gist Upload" or similar
   - Select the `gist` scope
   - Click "Generate token" and copy it

2. **Set the token and upload:**
   ```bash
   cd /home/r3dg0d/Documents/arch-rich-presence
   export GITHUB_TOKEN='your_token_here'
   ./upload-to-gist-api.sh
   ```

3. **Copy the URLs** that are displayed.

## What You'll Get

After running either script, you'll get two permanent URLs:
- Terms of Service: `https://gist.github.com/username/...`
- Privacy Policy: `https://gist.github.com/username/...`

These URLs are permanent and can be used in the Discord Developer Portal for app verification.

## Alternative: Manual Upload

If you prefer, you can manually:
1. Go to https://gist.github.com
2. Create a new public gist
3. Paste the contents of `terms-of-service.txt` or `privacy-policy.txt`
4. Name the file appropriately
5. Click "Create public gist"
6. Copy the URL from your browser

