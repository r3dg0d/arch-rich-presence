#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOME_DIR="$HOME"
SERVICE_NAME="arch-rich-presence"
SERVICE_FILE="$SCRIPT_DIR/arch-rich-presence.service"
USER_SERVICE_DIR="$HOME/.config/systemd/user"
NODE_PATH=$(which node)

echo "Installing Arch Linux Rich Presence..."

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install it first:"
    echo "   sudo pacman -S nodejs npm"
    exit 1
fi

echo "✓ Node.js found: $NODE_PATH"

# Install dependencies
echo "Installing dependencies..."
cd "$SCRIPT_DIR"
npm install

# Create config.json from example if it doesn't exist
if [ ! -f "$SCRIPT_DIR/config.json" ]; then
    echo "Creating config.json from example..."
    cp "$SCRIPT_DIR/config.example.json" "$SCRIPT_DIR/config.json"
    echo ""
    echo "⚠️  IMPORTANT: Please edit config.json and set your Discord Application ID:"
    echo "   1. Go to https://discord.com/developers/applications"
    echo "   2. Create a new application or select an existing one"
    echo "   3. Go to 'Rich Presence' and upload assets (optional)"
    echo "   4. Copy the Application ID"
    echo "   5. Edit config.json and paste it in discord.clientId"
    echo ""
    read -p "Press Enter to continue after editing config.json..."
fi

# Create systemd user service directory
mkdir -p "$USER_SERVICE_DIR"

# Install service file
echo "Installing systemd user service..."
sed -e "s|%i|$USER|g" -e "s|%h|$HOME_DIR|g" "$SERVICE_FILE" > "$USER_SERVICE_DIR/$SERVICE_NAME.service"

# Reload systemd
systemctl --user daemon-reload

# Enable service
echo "Enabling service for autostart..."
systemctl --user enable "$SERVICE_NAME.service"

echo ""
echo "✓ Installation complete!"
echo ""
echo "To start the service now:"
echo "  systemctl --user start $SERVICE_NAME"
echo ""
echo "To stop the service:"
echo "  systemctl --user stop $SERVICE_NAME"
echo ""
echo "To view logs:"
echo "  journalctl --user -u $SERVICE_NAME -f"
echo ""
echo "To toggle Rich Presence on/off:"
echo "  $SCRIPT_DIR/toggle.sh"
echo ""
echo "Or create a waybar button (see README.md for waybar config)"

