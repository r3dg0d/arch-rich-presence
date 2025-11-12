#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOME_DIR="$HOME"
SERVICE_NAME="arch-rich-presence"
SERVICE_FILE="$SCRIPT_DIR/arch-rich-presence.service"
USER_SERVICE_DIR="$HOME/.config/systemd/user"
NODE_PATH=$(which node)

echo "=========================================="
echo "  Arch Linux Rich Presence Installer"
echo "=========================================="
echo ""

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install it first:"
    echo "   sudo pacman -S nodejs npm"
    exit 1
fi

echo "✓ Node.js found: $NODE_PATH"

# Verify Node.js can find the source files
if [ ! -f "$SCRIPT_DIR/src/index.js" ]; then
    echo "❌ Error: Cannot find src/index.js in $SCRIPT_DIR"
    echo "   Please make sure you're running this script from the project directory"
    exit 1
fi

echo "✓ Source files found"

# Install dependencies
echo ""
echo "Installing Node.js dependencies..."
cd "$SCRIPT_DIR"
if ! npm install; then
    echo "❌ Failed to install dependencies. Please check the error above."
    exit 1
fi

echo "✓ Dependencies installed"

# Create config directory and config.json from example if it doesn't exist
CONFIG_DIR="$HOME/.config/arch-rich-presence"
CONFIG_FILE="$CONFIG_DIR/config.json"
mkdir -p "$CONFIG_DIR"

if [ ! -f "$CONFIG_FILE" ]; then
    echo ""
    echo "Creating config.json from example..."
    cp "$SCRIPT_DIR/config.example.json" "$CONFIG_FILE"
    echo "✓ Config file created at: $CONFIG_FILE"
    echo ""
    echo "⚠️  IMPORTANT: You need to set your Discord Application ID"
    echo "   1. Go to https://discord.com/developers/applications"
    echo "   2. Create a new application or select an existing one"
    echo "   3. Copy the Application ID"
    echo "   4. Edit $CONFIG_FILE and paste it in discord.clientId"
    echo ""
    read -p "Press Enter to continue (you can edit config.json later)..."
fi

# Create systemd user service directory
mkdir -p "$USER_SERVICE_DIR"

# Install service file with proper paths
echo ""
echo "Installing systemd user service..."
sed -e "s|SCRIPT_DIR_PLACEHOLDER|$SCRIPT_DIR|g" \
    -e "s|NODE_PATH_PLACEHOLDER|$NODE_PATH|g" \
    "$SERVICE_FILE" > "$USER_SERVICE_DIR/$SERVICE_NAME.service"

echo "✓ Service file installed at: $USER_SERVICE_DIR/$SERVICE_NAME.service"

# Verify service file was created correctly
if [ ! -f "$USER_SERVICE_DIR/$SERVICE_NAME.service" ]; then
    echo "❌ Error: Service file was not created correctly"
    exit 1
fi

# Reload systemd
echo "Reloading systemd..."
systemctl --user daemon-reload

# Create symlinks for commands in ~/.local/bin
echo ""
echo "Creating command symlinks..."
mkdir -p "$HOME/.local/bin"

# Create symlinks with proper path resolution
ln -sf "$SCRIPT_DIR/toggle.sh" "$HOME/.local/bin/arch-rich-presence-toggle"
ln -sf "$SCRIPT_DIR/set-status.sh" "$HOME/.local/bin/arch-rich-presence-set-status"
ln -sf "$SCRIPT_DIR/waybar-status.sh" "$HOME/.local/bin/arch-rich-presence-waybar"
ln -sf "$SCRIPT_DIR/setup-shell-hook.sh" "$HOME/.local/bin/arch-rich-presence-setup-hook"

# Make scripts executable
chmod +x "$SCRIPT_DIR/toggle.sh"
chmod +x "$SCRIPT_DIR/set-status.sh"
chmod +x "$SCRIPT_DIR/waybar-status.sh"
chmod +x "$SCRIPT_DIR/setup-shell-hook.sh"

echo "✓ Command symlinks created in ~/.local/bin"

# Check if ~/.local/bin is in PATH
if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
    echo ""
    echo "⚠️  Warning: ~/.local/bin is not in your PATH"
    echo "   Adding it to ~/.bashrc..."
    if ! grep -q '\.local/bin' "$HOME/.bashrc" 2>/dev/null; then
        echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.bashrc"
        echo "✓ Added to ~/.bashrc"
        echo "   Run 'source ~/.bashrc' or restart your terminal to use the commands"
    fi
fi

# Enable service
echo ""
echo "Enabling service for autostart..."
systemctl --user enable "$SERVICE_NAME.service" || true

echo ""
echo "=========================================="
echo "✓ Installation complete!"
echo "=========================================="
echo ""
echo "📋 IMPORTANT: Discord Desktop App Requirement"
echo "   This Rich Presence requires a Discord client with arRPC support."
echo "   The official Discord desktop app does NOT support Rich Presence on Linux."
echo ""
echo "   You need to use one of these alternatives:"
echo "   • vesktop (recommended): yay -S vesktop"
echo "   • WebCord: yay -S webcord"
echo "   • Discord with arRPC: Install arRPC separately"
echo ""
echo "   Without arRPC support, Rich Presence will not work!"
echo ""
echo "🔧 Next steps:"
echo "   1. Install vesktop or another Discord client with arRPC support"
echo "   2. Edit $CONFIG_FILE and set your Discord Application ID"
echo "   3. Start the service: systemctl --user start $SERVICE_NAME"
echo "   4. Check status: systemctl --user status $SERVICE_NAME"
echo ""
echo "📝 Useful commands:"
echo "   • Start service: systemctl --user start $SERVICE_NAME"
echo "   • Stop service: systemctl --user stop $SERVICE_NAME"
echo "   • View logs: journalctl --user -u $SERVICE_NAME -f"
echo "   • Toggle on/off: arch-rich-presence-toggle"
echo "   • Set custom status: arch-rich-presence-set-status \"Your message\""
echo ""

