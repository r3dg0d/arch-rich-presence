# Arch Linux Rich Presence

A Discord Rich Presence client for Arch Linux with Hyprland that shows what you're currently doing on your system, including active windows, terminal commands, and system information.

## Features

- 🪟 **Window Tracking**: Shows the title of your active window (e.g., "Chromium - Youtube", "Ghostty - nvim")
- ⌨️ **Terminal Command Tracking**: Displays your last executed terminal command with real-time updates (via shell hooks)
- 🖥️ **System Information**: View comprehensive system info via button link (CPU, GPU, RAM, Disk, OS, Kernel, WM, Shell, Packages, Theme, Font, Uptime, OS Age)
- 🔒 **Privacy Mode**: Toggle Rich Presence on/off via notification or waybar widget
- 🚀 **Auto-start**: Runs automatically on system boot via systemd user service
- 🎨 **Customizable**: Extensive configuration options via `config.json`
- 🔗 **System Info Button**: Clickable button in Rich Presence to view full system information online

## Prerequisites

- Arch Linux (or other Linux distros)
- Hyprland (or other Wayland/X11 compositors)
- Node.js 18+ (`sudo pacman -S nodejs npm`)
- Discord Desktop Application (must be running)
- `hyprctl` (included with Hyprland) or `xdotool` for window tracking
- `notify-send` (usually in `libnotify` package) for notifications

## Installation

### Option 1: Install from AUR (Recommended)

Install using your favorite AUR helper:

```bash
# Using yay
yay -S arch-rich-presence

# Using paru
paru -S arch-rich-presence

# Or manually
git clone https://aur.archlinux.org/arch-rich-presence.git
cd arch-rich-presence
makepkg -si
```

After installation:
1. Configure your Discord Application ID:
   ```bash
   # Config will be at ~/.config/arch-rich-presence/config.json
   nano ~/.config/arch-rich-presence/config.json
   ```
2. Enable and start the service:
   ```bash
   systemctl --user enable arch-rich-presence
   systemctl --user start arch-rich-presence
   ```

### Option 2: Manual Installation

1. **Clone or navigate to the project directory:**
   ```bash
   cd ~/Documents/arch-rich-presence
   ```

2. **Run the installation script:**
   ```bash
   chmod +x install.sh
   ./install.sh
   ```

3. **Configure Discord Application:**
   - Go to https://discord.com/developers/applications
   - Create a new application or select an existing one
   - Go to "Rich Presence" → "Art Assets"
   - Upload images (optional):
     - `arch-logo` (large image, 512x512px)
     - `active` (small image, 128x128px) - shown when Rich Presence is active
     - `privacymode` (small image, 128x128px) - shown in privacy mode
   - Copy the **Application ID**
   - Edit `config.json` (located at `~/.config/arch-rich-presence/config.json` for AUR install, or in the project directory for manual install) and paste the Application ID in `discord.clientId`

4. **Set up shell hook for real-time command tracking (optional but recommended):**
   
   **AUR Installation:**
   ```bash
   arch-rich-presence-setup-hook
   source ~/.bashrc  # or restart your terminal
   ```
   
   **Manual Installation:**
   ```bash
   ./setup-shell-hook.sh
   source ~/.bashrc  # or restart your terminal
   ```
   
   This enables real-time command tracking. Without it, commands only update when you exit your terminal.

5. **Start the service:**
   ```bash
   systemctl --user start arch-rich-presence
   ```

## Configuration

Edit `config.json` to customize behavior:

```json
{
  "discord": {
    "clientId": "YOUR_APPLICATION_ID",
    "updateInterval": 5000
  },
  "privacy": {
    "defaultState": true,
    "showIpAddress": false,
    "showUsername": false,
    "sanitizePaths": true
  },
  "display": {
    "showTerminalCommands": true,
    "showSystemInfo": true,
    "showWindowTitle": true,
    "maxTitleLength": 128,
    "maxCommandLength": 64
  }
}
```

### Privacy Settings

- `defaultState`: `true` = Privacy Mode by default, `false` = Active by default
- `showIpAddress`: Never shown (hardcoded for security)
- `showUsername`: Control whether username is included in system info
- `sanitizePaths`: Replace home directory with `~` in paths

## Usage

### Manual Start/Stop

```bash
# Start
systemctl --user start arch-rich-presence

# Stop
systemctl --user stop arch-rich-presence

# Restart
systemctl --user restart arch-rich-presence

# Check status
systemctl --user status arch-rich-presence
```

### Toggle Rich Presence On/Off

**AUR Installation:**
```bash
arch-rich-presence-toggle
```

**Manual Installation:**
```bash
./toggle.sh
```

This will toggle between active mode and privacy mode without stopping the service.

### View Logs

```bash
journalctl --user -u arch-rich-presence -f
```

## Waybar Integration

Add to your `~/.config/waybar/config`:

```json
{
  "modules-right": [
    // ... your existing modules ...
    "custom/arch-rp"
  ],
  "custom/arch-rp": {
    "format": "{}",
    "exec": "arch-rich-presence-waybar",
    "interval": 5,
    "on-click": "arch-rich-presence-toggle",
    "tooltip": true
  }
}
```

**Note:** If you installed manually (not from AUR), use full paths:
```json
"exec": "~/Documents/arch-rich-presence/waybar-status.sh",
"on-click": "~/Documents/arch-rich-presence/toggle.sh",
```

Add CSS styling to `~/.config/waybar/style.css`:

```css
#custom-arch-rp.enabled {
    color: #4ade80;
}

#custom-arch-rp.disabled {
    color: #ef4444;
}

#custom-arch-rp.stopped {
    color: #6b7280;
}
```

## Systemd Service

The service runs as a user service and automatically starts on login. To disable autostart:

```bash
systemctl --user disable arch-rich-presence
```

## How It Works

1. **Window Tracking**: Uses `hyprctl activewindow -j` to get the active window title from Hyprland
2. **Command Tracking**: 
   - **Real-time**: Via shell hooks that write to `/tmp/arch-rp-last-command.txt` immediately
   - **Fallback**: Monitors shell history files (`.bash_history`, `.zsh_history`, `.fish_history`)
3. **System Info**: Reads comprehensive system information via Node.js `os` module and system commands
4. **Rich Presence**: Updates Discord via IPC connection to Discord desktop app
5. **System Info Upload**: Automatically uploads system information to `0x0.st` every 30 minutes, providing a clickable button in Rich Presence
6. **Privacy Mode**: When disabled, shows "Privacy Mode" status instead of actual activity

## Troubleshooting

### Rich Presence not showing

1. Make sure Discord desktop app is running
2. Check that your Application ID is correct in `config.json`
3. Verify the service is running: `systemctl --user status arch-rich-presence`
4. Check logs: `journalctl --user -u arch-rich-presence -n 50`

### Window title not updating

1. Verify `hyprctl` is available: `hyprctl activewindow`
2. If using X11, ensure `xdotool` is installed: `sudo pacman -S xdotool`

### Terminal commands not showing

1. **For real-time updates**: 
   - AUR: Run `arch-rich-presence-setup-hook` to set up shell hooks
   - Manual: Run `./setup-shell-hook.sh` to set up shell hooks
2. **For history-based tracking**: Check that your shell history file exists and is being written to
3. Verify the path in `config.json` matches your shell's history file location
4. Note: Without shell hooks, commands only update when you exit your terminal (when history is written to disk)

### Service fails to start

1. Check Node.js path in service file: `which node`
2. Verify working directory path is correct
3. Check logs for specific errors: `journalctl --user -u arch-rich-presence`

## Security & Privacy

- **No IP addresses** are ever sent to Discord
- **Paths are sanitized** (home directory replaced with `~`)
- **Username can be hidden** via configuration
- **Privacy Mode** completely hides your activity when enabled
- All data stays local - only formatted activity strings are sent to Discord

## License

MIT

## Contributing

Feel free to submit issues and enhancement requests!

