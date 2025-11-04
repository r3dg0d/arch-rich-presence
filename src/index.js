#!/usr/bin/env node

const { Client } = require('discord-rpc');
const { exec, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { EventEmitter } = require('events');
const https = require('https');
const http = require('http');

class ArchRichPresence extends EventEmitter {
    constructor(configPath = null) {
        super();
        // Use XDG Base Directory Specification for config location
        if (!configPath) {
            // Use XDG_CONFIG_HOME or default to ~/.config
            const xdgConfigHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
            const userConfigPath = path.join(xdgConfigHome, 'arch-rich-presence', 'config.json');
            
            // Check if user config exists, otherwise fall back to system location
            if (fs.existsSync(userConfigPath)) {
                configPath = userConfigPath;
            } else {
                // Fallback to system location (for backward compatibility)
                const systemConfigPath = path.join(__dirname, '..', 'config.json');
                if (fs.existsSync(systemConfigPath)) {
                    configPath = systemConfigPath;
                } else {
                    // Default to user config location (will be created if needed)
                    configPath = userConfigPath;
                }
            }
        }
        this.configPath = configPath;
        this.config = this.loadConfig();
        this.rpc = null;
        this.isActive = !this.config.privacy.defaultState;
        this.currentWindow = null;
        this.lastCommand = null;
        this.systemInfo = null;
        this.updateInterval = null;
        this.statusFile = path.join(os.tmpdir(), 'arch-rp-status.json');
        this.watchInterval = null;
        this.systemInfoUrl = null;
        this.urlUpdateInterval = null;
        this.commandCache = null;
        this.commandCacheTime = 0;
        this.historyWatchers = new Map();
        this.commandTempFile = path.join(os.tmpdir(), 'arch-rp-last-command.txt');
    }

    loadConfig() {
        try {
            // Ensure config directory exists
            const configDir = path.dirname(this.configPath);
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
            }
            
            // If config doesn't exist, try to copy from example
            if (!fs.existsSync(this.configPath)) {
                // Try to find example config in common locations
                const examplePaths = [
                    path.join(os.homedir(), '.config', 'arch-rich-presence', 'config.example.json'),
                    '/usr/share/arch-rich-presence/config.example.json',
                    path.join(__dirname, '..', 'config.example.json'),
                    path.join(__dirname, '..', '..', 'config.example.json')
                ];
                
                for (const examplePath of examplePaths) {
                    if (fs.existsSync(examplePath)) {
                        console.log(`Creating config from example: ${examplePath}`);
                        fs.copyFileSync(examplePath, this.configPath);
                        console.log(`Config file created at: ${this.configPath}`);
                        console.log('Please edit it and set your Discord Application ID');
                        break;
                    }
                }
            }
            
            const config = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
            return config;
        } catch (error) {
            console.error(`Failed to load config: ${error.message}`);
            console.log(`Config path: ${this.configPath}`);
            console.log('Using default configuration. Please copy config.example.json to config.json');
            return {
                discord: { clientId: null, updateInterval: 5000 },
                privacy: { defaultState: true, showIpAddress: false, showUsername: false, sanitizePaths: true },
                display: { showTerminalCommands: true, showSystemInfo: true, showWindowTitle: true, maxTitleLength: 128, maxCommandLength: 64 }
            };
        }
    }

    saveStatus() {
        const status = {
            active: this.isActive,
            timestamp: Date.now()
        };
        try {
            fs.writeFileSync(this.statusFile, JSON.stringify(status));
        } catch (error) {
            console.error('Failed to save status:', error.message);
        }
    }

    async connectDiscord() {
        if (!this.config.discord.clientId || 
            this.config.discord.clientId === 'YOUR_DISCORD_APPLICATION_ID' ||
            this.config.discord.clientId.length < 10) {
            console.error('Discord Client ID not configured. Please set it in config.json');
            console.error('Go to https://discord.com/developers/applications to create an application and get your Client ID');
            return false;
        }

        this.rpc = new Client({ transport: 'ipc' });

        this.rpc.on('ready', () => {
            console.log('Connected to Discord!');
            this.startUpdating();
        });

        try {
            await this.rpc.login({ clientId: this.config.discord.clientId });
            return true;
        } catch (error) {
            console.error('Failed to connect to Discord:', error.message);
            console.log('Make sure Discord is running and you have a valid Client ID');
            return false;
        }
    }

    async getActiveWindow() {
        try {
            // Use hyprctl to get active window
            const hyprctlSocket = process.env.HYPRLAND_INSTANCE_SIGNATURE 
                ? `/tmp/hypr/${process.env.HYPRLAND_INSTANCE_SIGNATURE}/.socket2`
                : this.config.hyprland?.socketPath || '/tmp/hypr/.socket2';

            // Try hyprctl first
            try {
                const result = execSync('hyprctl activewindow -j', { encoding: 'utf8', timeout: 1000 });
                const window = JSON.parse(result);
                if (window && window.title) {
                    return window.title;
                }
            } catch (error) {
                // Fallback to other methods
            }

            // Fallback: try xdotool (if X11 is available)
            try {
                const title = execSync('xdotool getactivewindow getwindowname 2>/dev/null', { encoding: 'utf8', timeout: 1000 });
                return title.trim();
            } catch (error) {
                // Continue to next fallback
            }

            // Fallback: try wlr-randr/wayland methods
            try {
                const result = execSync('swaymsg -t get_tree 2>/dev/null | jq -r \'recurse(.nodes[]?, .floating_nodes[]?) | select(.focused==true) | .name\'', { encoding: 'utf8', timeout: 1000, shell: '/bin/bash' });
                return result.trim();
            } catch (error) {
                // Last resort
            }

            return null;
        } catch (error) {
            return null;
        }
    }

    sanitizePath(pathStr) {
        if (!this.config.privacy.sanitizePaths) return pathStr;
        // Replace home directory with ~
        const homeDir = os.homedir();
        return pathStr.replace(homeDir, '~');
    }

    sanitizeTitle(title) {
        if (!title) return 'No Window';
        
        // Sanitize paths
        let sanitized = this.sanitizePath(title);
        
        // Limit length
        if (sanitized.length > this.config.display.maxTitleLength) {
            sanitized = sanitized.substring(0, this.config.display.maxTitleLength - 3) + '...';
        }
        
        return sanitized;
    }

    setupHistoryWatchers() {
        // Setup file watchers for history files to detect changes
        const homeDir = os.homedir();
        const historyFiles = [
            path.join(homeDir, '.bash_history'),
            path.join(homeDir, '.zsh_history'),
            path.join(homeDir, '.fish_history'),
            ...(this.config.terminal?.alternativeHistoryFiles || []).map(f => f.replace('~', homeDir))
        ];

        historyFiles.forEach(histFile => {
            if (fs.existsSync(histFile) && !this.historyWatchers.has(histFile)) {
                // Watch for changes to the history file
                fs.watchFile(histFile, { interval: 1000 }, (curr, prev) => {
                    // File was modified
                    if (curr.mtime !== prev.mtime) {
                        // Clear cache so it gets re-read
                        this.commandCache = null;
                        this.commandCacheTime = 0;
                    }
                });
                this.historyWatchers.set(histFile, true);
            }
        });
    }

    async getLastTerminalCommand() {
        if (!this.config.display.showTerminalCommands) return null;

        // Setup watchers on first call
        if (this.historyWatchers.size === 0) {
            this.setupHistoryWatchers();
        }

        // Use cache if recent (within last second)
        const now = Date.now();
        if (this.commandCache && (now - this.commandCacheTime) < 1000) {
            return this.commandCache;
        }

        try {
            const homeDir = os.homedir();
            const historyFiles = [
                path.join(homeDir, '.bash_history'),
                path.join(homeDir, '.zsh_history'),
                path.join(homeDir, '.fish_history'),
                ...(this.config.terminal?.alternativeHistoryFiles || []).map(f => f.replace('~', homeDir))
            ];

            // First, try to read from temp file (if shell hooks are set up)
            // This provides real-time updates without waiting for shell exit
            if (fs.existsSync(this.commandTempFile)) {
                try {
                    const stats = fs.statSync(this.commandTempFile);
                    // Only read if file was modified recently (within last 5 minutes)
                    if (now - stats.mtimeMs < 300000) {
                        const lastCmd = fs.readFileSync(this.commandTempFile, 'utf8').trim();
                        if (lastCmd && lastCmd.length > 0) {
                            let cmd = this.sanitizePath(lastCmd);
                            if (cmd.length > this.config.display.maxCommandLength) {
                                cmd = cmd.substring(0, this.config.display.maxCommandLength - 3) + '...';
                            }
                            this.commandCache = cmd;
                            this.commandCacheTime = now;
                            return cmd;
                        }
                    }
                } catch (error) {
                    // Fall through to history file method
                }
            }

            // Fallback: Read from history files
            for (const histFile of historyFiles) {
                if (fs.existsSync(histFile)) {
                    try {
                        const stats = fs.statSync(histFile);
                        const history = fs.readFileSync(histFile, 'utf8');
                        const lines = history.split('\n').filter(line => line.trim());
                        if (lines.length > 0) {
                            // Get the last few lines and find the most recent valid command
                            // Sometimes the last line might be incomplete, so check a few
                            for (let i = lines.length - 1; i >= Math.max(0, lines.length - 5); i--) {
                                const lastLine = lines[i];
                                // Skip empty or special commands
                                if (lastLine && !lastLine.startsWith('#') && lastLine.trim().length > 0) {
                                    let cmd = lastLine.trim();
                                    // For zsh history, remove timestamp
                                    if (cmd.match(/^:\s*\d+:\d+;/)) {
                                        cmd = cmd.replace(/^:\s*\d+:\d+;/, '').trim();
                                    }
                                    // For fish history, parse format
                                    if (cmd.includes('- cmd:')) {
                                        const match = cmd.match(/- cmd: (.+)/);
                                        if (match) cmd = match[1];
                                    }
                                    // Skip common non-command patterns
                                    if (cmd && cmd.length > 0 && !cmd.match(/^(exit|clear|reset)$/i)) {
                                        // Sanitize
                                        cmd = this.sanitizePath(cmd);
                                        if (cmd.length > this.config.display.maxCommandLength) {
                                            cmd = cmd.substring(0, this.config.display.maxCommandLength - 3) + '...';
                                        }
                                        this.commandCache = cmd;
                                        this.commandCacheTime = now;
                                        return cmd;
                                    }
                                }
                            }
                        }
                    } catch (error) {
                        // Continue to next file
                        continue;
                    }
                }
            }
        } catch (error) {
            // Ignore errors
        }

        return null;
    }

    async getSystemInfo() {
        if (!this.config.display.showSystemInfo) return null;

        try {
            const info = {
                // Hardware
                hostname: null,
                cpu: null,
                gpu: null,
                memory: null,
                swap: null,
                disk: null,
                displays: null,
                
                // Software
                os: null,
                kernel: null,
                wm: null,
                shell: null,
                packages: null,
                theme: null,
                font: null,
                
                // Uptime
                uptime: null,
                osAge: null
            };

            // Get hostname
            try {
                info.hostname = os.hostname();
            } catch (error) {
                info.hostname = null;
            }

            // Get CPU info
            try {
                const cpuInfo = execSync('lscpu | grep "Model name" | cut -d: -f2 | xargs', { encoding: 'utf8', timeout: 1000 });
                info.cpu = cpuInfo.trim().substring(0, 50);
            } catch (error) {
                info.cpu = `${os.cpus().length} cores`;
            }

            // Get GPU info
            try {
                // Try nvidia-smi first (NVIDIA)
                try {
                    const gpuInfo = execSync('nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1', { encoding: 'utf8', timeout: 1000 });
                    if (gpuInfo && gpuInfo.trim()) {
                        info.gpu = gpuInfo.trim().substring(0, 50);
                    }
                } catch (error) {
                    // Try lspci (all GPUs)
                    try {
                        const gpuInfo = execSync('lspci | grep -i vga | cut -d: -f3 | xargs', { encoding: 'utf8', timeout: 1000 });
                        if (gpuInfo && gpuInfo.trim()) {
                            info.gpu = gpuInfo.trim().substring(0, 50);
                        }
                    } catch (error) {
                        // Give up
                    }
                }
            } catch (error) {
                info.gpu = null;
            }

            // Get memory info
            try {
                const totalMem = os.totalmem() / (1024 ** 3);
                const freeMem = os.freemem() / (1024 ** 3);
                const usedMem = totalMem - freeMem;
                info.memory = `${usedMem.toFixed(2)} GiB / ${totalMem.toFixed(2)} GiB`;
            } catch (error) {
                info.memory = 'Unknown';
            }

            // Get swap info
            try {
                const swapInfo = execSync('free -h | grep Swap | awk \'{print $2 "/" $3}\'', { encoding: 'utf8', timeout: 1000 });
                if (swapInfo && swapInfo.trim()) {
                    info.swap = swapInfo.trim();
                }
            } catch (error) {
                // Try alternative method
                try {
                    const meminfo = fs.readFileSync('/proc/meminfo', 'utf8');
                    const swapTotal = meminfo.match(/SwapTotal:\s+(\d+)/);
                    const swapFree = meminfo.match(/SwapFree:\s+(\d+)/);
                    if (swapTotal && swapFree) {
                        const total = (parseInt(swapTotal[1]) / (1024 ** 2)).toFixed(2);
                        const used = ((parseInt(swapTotal[1]) - parseInt(swapFree[1])) / (1024 ** 2)).toFixed(2);
                        info.swap = `${used} GiB / ${total} GiB`;
                    }
                } catch (error) {
                    info.swap = null;
                }
            }

            // Get disk space
            try {
                const diskInfo = execSync('df -h / | tail -1 | awk \'{print $3 "/" $2 " (" $5 " used)"}\'', { encoding: 'utf8', timeout: 1000 });
                if (diskInfo && diskInfo.trim()) {
                    info.disk = diskInfo.trim();
                }
            } catch (error) {
                info.disk = null;
            }

            // Get display resolutions
            try {
                const displays = [];
                // Try hyprctl for Wayland
                try {
                    const hyprDisplays = execSync('hyprctl monitors -j 2>/dev/null', { encoding: 'utf8', timeout: 1000 });
                    const monitors = JSON.parse(hyprDisplays);
                    if (Array.isArray(monitors)) {
                        monitors.forEach(monitor => {
                            if (monitor.width && monitor.height) {
                                displays.push(`${monitor.width}x${monitor.height}`);
                            }
                        });
                    }
                } catch (error) {
                    // Try xrandr for X11
                    try {
                        const xrandr = execSync('xrandr 2>/dev/null | grep " connected" | awk \'{print $3}\' | cut -d+ -f1', { encoding: 'utf8', timeout: 1000 });
                        if (xrandr && xrandr.trim()) {
                            displays.push(...xrandr.trim().split('\n').filter(d => d));
                        }
                    } catch (error) {
                        // Give up
                    }
                }
                if (displays.length > 0) {
                    info.displays = displays.join(', ');
                }
            } catch (error) {
                info.displays = null;
            }

            // Get OS info
            try {
                // Try /etc/os-release
                if (fs.existsSync('/etc/os-release')) {
                    const osRelease = fs.readFileSync('/etc/os-release', 'utf8');
                    const nameMatch = osRelease.match(/^NAME="?([^"\n]+)"?/m);
                    const versionMatch = osRelease.match(/^VERSION="?([^"\n]+)"?/m);
                    if (nameMatch && versionMatch) {
                        info.os = `${nameMatch[1]} ${versionMatch[1]}`;
                    } else if (nameMatch) {
                        info.os = nameMatch[1];
                    }
                }
                if (!info.os) {
                    info.os = 'Arch Linux';
                }
            } catch (error) {
                info.os = 'Arch Linux';
            }

            // Get kernel
            try {
                info.kernel = `Linux ${os.release()}`;
            } catch (error) {
                info.kernel = null;
            }

            // Get WM/DE
            try {
                if (process.env.HYPRLAND_INSTANCE_SIGNATURE) {
                    const hyprVersion = execSync('hyprctl version 2>/dev/null | head -1 | awk \'{print $2}\'', { encoding: 'utf8', timeout: 1000 });
                    if (hyprVersion && hyprVersion.trim()) {
                        info.wm = `Hyprland ${hyprVersion.trim()}`;
                    } else {
                        info.wm = 'Hyprland';
                    }
                } else if (process.env.WAYLAND_DISPLAY) {
                    info.wm = 'Wayland';
                } else if (process.env.DISPLAY) {
                    info.wm = 'X11';
                }
            } catch (error) {
                info.wm = null;
            }

            // Get shell
            try {
                const shellPath = process.env.SHELL || '/bin/bash';
                const shellName = path.basename(shellPath);
                // Try to get version
                try {
                    if (shellName === 'zsh') {
                        const version = execSync('zsh --version 2>/dev/null | awk \'{print $2}\'', { encoding: 'utf8', timeout: 1000 });
                        info.shell = `zsh ${version.trim()}`;
                    } else if (shellName === 'fish') {
                        const version = execSync('fish --version 2>/dev/null | awk \'{print $3}\'', { encoding: 'utf8', timeout: 1000 });
                        info.shell = `fish ${version.trim()}`;
                    } else if (shellName.includes('ghostty')) {
                        // Ghostty is a terminal emulator, not shell
                        const ghosttyVersion = execSync('ghostty --version 2>/dev/null | head -1', { encoding: 'utf8', timeout: 1000 });
                        if (ghosttyVersion && ghosttyVersion.trim()) {
                            info.shell = `ghostty ${ghosttyVersion.trim().split(' ')[0] || ''}`;
                        } else {
                            info.shell = 'ghostty';
                        }
                    } else {
                        info.shell = shellName;
                    }
                } catch (error) {
                    info.shell = shellName;
                }
            } catch (error) {
                info.shell = null;
            }

            // Get package count
            try {
                const pacmanCount = execSync('pacman -Q 2>/dev/null | wc -l', { encoding: 'utf8', timeout: 1000 });
                let packageStr = `${parseInt(pacmanCount.trim()) || 0} (pacman)`;
                
                // Try flatpak
                try {
                    const flatpakCount = execSync('flatpak list --app 2>/dev/null | wc -l', { encoding: 'utf8', timeout: 1000 });
                    const fpCount = parseInt(flatpakCount.trim()) || 0;
                    if (fpCount > 0) {
                        packageStr += `, ${fpCount} (flatpak)`;
                    }
                } catch (error) {
                    // Ignore
                }
                
                info.packages = packageStr;
            } catch (error) {
                info.packages = null;
            }

            // Get theme (try to detect from gtk or qt configs)
            try {
                // Try gtk theme
                const gtkTheme = execSync('gsettings get org.gnome.desktop.interface gtk-theme 2>/dev/null || echo ""', { encoding: 'utf8', timeout: 1000 });
                if (gtkTheme && gtkTheme.trim() && !gtkTheme.includes('command not found')) {
                    info.theme = gtkTheme.trim().replace(/[\'"]/g, '');
                }
            } catch (error) {
                // Try other methods or skip
            }

            // Get font
            try {
                const font = execSync('gsettings get org.gnome.desktop.interface monospace-font-name 2>/dev/null || echo ""', { encoding: 'utf8', timeout: 1000 });
                if (font && font.trim() && !font.includes('command not found')) {
                    info.font = font.trim().replace(/[\'"]/g, '');
                }
            } catch (error) {
                // Skip
            }

            // Get system uptime (time since last boot)
            try {
                const uptime = os.uptime();
                const days = Math.floor(uptime / 86400);
                const hours = Math.floor((uptime % 86400) / 3600);
                const minutes = Math.floor((uptime % 3600) / 60);
                
                const parts = [];
                if (days > 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`);
                if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`);
                if (minutes > 0 && parts.length < 2) parts.push(`${minutes} min${minutes !== 1 ? 's' : ''}`);
                
                info.uptime = parts.length > 0 ? parts.join(', ') : '0 mins';
            } catch (error) {
                info.uptime = 'Unknown';
            }

            // Get OS age (time since installation)
            try {
                // Try to get install date from pacman log or filesystem
                let installDate = null;
                
                // Method 1: Check pacman.log for first entry
                try {
                    const pacmanLog = '/var/log/pacman.log';
                    if (fs.existsSync(pacmanLog)) {
                        const firstLine = execSync(`head -1 ${pacmanLog}`, { encoding: 'utf8', timeout: 1000 });
                        // Parse date from pacman log format: [YYYY-MM-DD HH:MM]
                        const dateMatch = firstLine.match(/\[(\d{4}-\d{2}-\d{2})/);
                        if (dateMatch) {
                            installDate = new Date(dateMatch[1]);
                        }
                    }
                } catch (error) {
                    // Try alternative method
                }

                // Method 2: Check filesystem creation date
                if (!installDate) {
                    try {
                        const stats = fs.statSync('/');
                        installDate = stats.birthtime;
                        // If birthtime is invalid (newer filesystems), use mtime as fallback
                        if (!installDate || installDate.getTime() === 0) {
                            installDate = stats.mtime;
                        }
                    } catch (error) {
                        // Fallback: use oldest file in /etc
                        try {
                            const etcStats = fs.statSync('/etc');
                            installDate = etcStats.birthtime || etcStats.mtime;
                        } catch (error) {
                            // Give up
                        }
                    }
                }

                if (installDate && installDate.getTime() > 0) {
                    const now = new Date();
                    const ageMs = now - installDate;
                    const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
                    const ageMonths = Math.floor(ageDays / 30);
                    const ageYears = Math.floor(ageDays / 365);
                    
                    if (ageYears > 0) {
                        info.osAge = `${ageYears} year${ageYears !== 1 ? 's' : ''}`;
                        const remainingMonths = Math.floor((ageDays % 365) / 30);
                        if (remainingMonths > 0) {
                            info.osAge += `, ${remainingMonths} month${remainingMonths !== 1 ? 's' : ''}`;
                        }
                    } else if (ageMonths > 0) {
                        info.osAge = `${ageMonths} month${ageMonths !== 1 ? 's' : ''}`;
                        const remainingDays = ageDays % 30;
                        if (remainingDays > 0) {
                            info.osAge += `, ${remainingDays} day${remainingDays !== 1 ? 's' : ''}`;
                        }
                    } else {
                        info.osAge = `${ageDays} day${ageDays !== 1 ? 's' : ''}`;
                    }
                }
            } catch (error) {
                // OS age not available
                info.osAge = null;
            }

            return info;
        } catch (error) {
            return null;
        }
    }

    async uploadSystemInfo(sysInfo) {
        if (!sysInfo) return null;

        try {
            // Format system info as readable text
            let infoText = '═══════════════════════════════════════\n';
            infoText += '   ARCH LINUX SYSTEM INFORMATION\n';
            infoText += '═══════════════════════════════════════\n\n';
            
            // Hardware section
            infoText += '┌─ HARDWARE ───────────────────────────┐\n';
            if (sysInfo.hostname) infoText += `│ PC: ${sysInfo.hostname}\n`;
            if (sysInfo.cpu) infoText += `│ CPU: ${sysInfo.cpu}\n`;
            if (sysInfo.gpu) infoText += `│ GPU: ${sysInfo.gpu}\n`;
            if (sysInfo.memory) infoText += `│ RAM: ${sysInfo.memory}\n`;
            if (sysInfo.swap) infoText += `│ Swap: ${sysInfo.swap}\n`;
            if (sysInfo.disk) infoText += `│ Disk: ${sysInfo.disk}\n`;
            if (sysInfo.displays) infoText += `│ Displays: ${sysInfo.displays}\n`;
            infoText += '└──────────────────────────────────────┘\n\n';
            
            // Software section
            infoText += '┌─ SOFTWARE ───────────────────────────┐\n';
            if (sysInfo.os) infoText += `│ OS: ${sysInfo.os}\n`;
            if (sysInfo.kernel) infoText += `│ Kernel: ${sysInfo.kernel}\n`;
            if (sysInfo.wm) infoText += `│ WM: ${sysInfo.wm}\n`;
            if (sysInfo.shell) infoText += `│ Shell: ${sysInfo.shell}\n`;
            if (sysInfo.packages) infoText += `│ Packages: ${sysInfo.packages}\n`;
            if (sysInfo.theme) infoText += `│ Theme: ${sysInfo.theme}\n`;
            if (sysInfo.font) infoText += `│ Font: ${sysInfo.font}\n`;
            infoText += '└──────────────────────────────────────┘\n\n';
            
            // Uptime section
            infoText += '┌─ UPTIME ─────────────────────────────┐\n';
            if (sysInfo.osAge) infoText += `│ OS Age: ${sysInfo.osAge}\n`;
            if (sysInfo.uptime) infoText += `│ Uptime: ${sysInfo.uptime}\n`;
            infoText += '└──────────────────────────────────────┘\n\n';
            
            infoText += `Last Updated: ${new Date().toISOString()}\n`;
            infoText += '═══════════════════════════════════════\n';

            // Upload to 0x0.st (simple file hosting, no auth required)
            const uploadUrl = 'https://0x0.st';
            
            return new Promise((resolve, reject) => {
                const postData = infoText;
                
                // Use multipart form data for 0x0.st
                const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
                const formData = `--${boundary}\r\n` +
                    `Content-Disposition: form-data; name="file"; filename="system-info.txt"\r\n` +
                    `Content-Type: text/plain\r\n\r\n` +
                    postData + `\r\n--${boundary}--\r\n`;
                
                const options = {
                    hostname: '0x0.st',
                    port: 443,
                    path: '/',
                    method: 'POST',
                    headers: {
                        'Content-Type': `multipart/form-data; boundary=${boundary}`,
                        'Content-Length': Buffer.byteLength(formData),
                        'User-Agent': 'Arch-Rich-Presence/1.0'
                    }
                };

                const req = https.request(options, (res) => {
                    let data = '';
                    
                    res.on('data', (chunk) => {
                        data += chunk;
                    });
                    
                    res.on('end', () => {
                        const url = data.trim();
                        // 0x0.st returns the URL directly if successful
                        if (url.startsWith('https://0x0.st/')) {
                            resolve(url);
                        } else {
                            reject(new Error(`Upload failed: ${url.substring(0, 100)}`));
                        }
                    });
                });

                req.on('error', (error) => {
                    reject(error);
                });

                req.write(formData);
                req.end();
            });
        } catch (error) {
            console.error('Failed to upload system info:', error.message);
            return null;
        }
    }

    async updateSystemInfoUrl(sysInfo) {
        if (!sysInfo) return;
        
        // Upload new system info every time (we'll schedule this every 30 minutes)
        // Don't let errors crash the service
        try {
            const url = await this.uploadSystemInfo(sysInfo);
            if (url) {
                const wasEmpty = !this.systemInfoUrl;
                this.systemInfoUrl = url;
                console.log(`System info uploaded: ${url}`);
                // If we just got the URL and didn't have one before, update Rich Presence to show the button
                if (wasEmpty && this.rpc && this.isActive) {
                    await this.updateRichPresence();
                }
            }
        } catch (error) {
            // Silently fail - we'll try again later
            console.error('Failed to upload system info (will retry):', error.message);
        }
    }

    async updateRichPresence() {
        if (!this.rpc || !this.isActive) {
            // Show privacy mode
            if (this.rpc) {
                try {
                    await this.rpc.setActivity({
                        details: '🔒 Privacy Mode',
                        state: 'Rich Presence disabled',
                        largeImageKey: 'arch-logo',
                        largeImageText: 'Arch Linux',
                        smallImageKey: 'privacymode',
                        smallImageText: 'Privacy mode active',
                        startTimestamp: Math.floor(Date.now() / 1000) // Discord RPC expects seconds
                    });
                } catch (error) {
                    // Ignore
                }
            }
            this.saveStatus();
            return;
        }

        // Get current data
        const window = await this.getActiveWindow();
        const command = await this.getLastTerminalCommand();
        const sysInfo = await this.getSystemInfo();

        this.currentWindow = window;
        this.lastCommand = command;
        this.systemInfo = sysInfo;

        // Build activity - show window/command, no system info in rich presence
        const windowTitle = this.sanitizeTitle(window);
        let details = 'No Active Window';
        let state = null;
        
        // Command goes in details (top line), window title goes in state (bottom line)
        if (command) {
            // Just show the command without "Last command ran:" prefix
            details = command.length > 128 ? command.substring(0, 125) + '...' : command;
            // Window title goes in state underneath
            if (windowTitle && windowTitle.length < 128) {
                state = windowTitle;
            }
        } else {
            // If no command, show window in details
            if (windowTitle) {
                details = windowTitle.length > 128 ? windowTitle.substring(0, 125) + '...' : windowTitle;
            }
        }
        
        // Build activity object matching Discord's Rich Presence structure
        const activity = {
            details: details,
            state: state || undefined, // Only include state if we have one
            largeImageKey: 'arch-logo',
            largeImageText: sysInfo ? `Arch Linux - ${sysInfo.os || 'Arch Linux'}` : 'Arch Linux',
            smallImageKey: 'active',
            smallImageText: 'Rich Presence Active',
            startTimestamp: Math.floor(Date.now() / 1000), // Discord RPC expects seconds
            instance: false // Required field - indicates if this is an instanced game
        };
        
        // Add button to view full system info online if URL is available
        if (this.systemInfoUrl) {
            // Discord Rich Presence buttons format: array of objects with label and url
            // Note: Even verified apps may take time for buttons to appear
            // Try without emoji in label as some clients may have issues
            const buttonLabel = 'View System Info'; // Removed emoji in case it causes issues
            activity.buttons = [
                { label: buttonLabel, url: this.systemInfoUrl }
            ];
            console.log(`✅ Adding button: "${buttonLabel}" -> ${this.systemInfoUrl}`);
        } else {
            // Log that URL is not available yet
            if (Date.now() % 30000 < 5000) { // Log every ~30 seconds when URL is missing
                console.log('⏳ System info URL not available yet, button will appear after upload completes');
            }
        }

        try {
            // Clean up buttons array - ensure proper format
            if (activity.buttons) {
                if (!Array.isArray(activity.buttons)) {
                    activity.buttons = [activity.buttons];
                }
                
                // Ensure buttons meet Discord's requirements
                activity.buttons = activity.buttons
                    .map(btn => {
                        if (!btn || typeof btn !== 'object') return null;
                        const label = String(btn.label || '').substring(0, 32).trim();
                        const url = String(btn.url || '').trim();
                        
                        // Validate: label max 32 chars, URL must be HTTPS
                        if (!label || !url || !url.startsWith('https://')) {
                            return null;
                        }
                        
                        return { label, url };
                    })
                    .filter(btn => btn !== null);
                
                // Discord allows max 2 buttons
                if (activity.buttons.length > 2) {
                    activity.buttons = activity.buttons.slice(0, 2);
                }
                
                // Only include buttons if we have valid ones
                if (activity.buttons.length === 0) {
                    delete activity.buttons;
                }
            }
            
            // Log when buttons are present
            if (activity.buttons && activity.buttons.length > 0) {
                console.log('📤 Sending Rich Presence with buttons:', JSON.stringify({
                    details: activity.details?.substring(0, 50),
                    state: activity.state?.substring(0, 50),
                    buttons: activity.buttons
                }, null, 2));
            }
            
            // Log full activity before sending to help debug
            if (activity.buttons && activity.buttons.length > 0) {
                console.log('📤 Full activity being sent to Discord:', JSON.stringify(activity, null, 2));
            }
            
            const result = await this.rpc.setActivity(activity);
            
            // Log response from Discord RPC
            if (activity.buttons && activity.buttons.length > 0) {
                console.log('📥 Discord RPC response:', JSON.stringify(result || 'OK', null, 2));
            }
            
            this.saveStatus();
            // Debug logging (can be removed later)
            if (Date.now() % 60000 < 5000) { // Log every ~60 seconds
                console.log('Rich Presence updated:', {
                    details: activity.details?.substring(0, 50),
                    state: activity.state?.substring(0, 50),
                    hasSmallImage: !!activity.smallImageKey,
                    hasButtons: !!activity.buttons,
                    buttonCount: activity.buttons?.length || 0,
                    buttonLabel: activity.buttons?.[0]?.label,
                    buttonUrl: activity.buttons?.[0]?.url,
                    systemInfoUrl: this.systemInfoUrl ? 'set' : 'not set'
                });
            }
        } catch (error) {
            console.error('❌ Failed to update Rich Presence:', error.message);
            console.error('Error details:', error);
            if (activity.buttons) {
                console.error('Activity object with buttons:', JSON.stringify(activity, null, 2));
            }
        }
    }

    async startUpdating() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        
        if (this.urlUpdateInterval) {
            clearInterval(this.urlUpdateInterval);
        }

        // Fetch system info first if not already available
        if (!this.systemInfo) {
            this.systemInfo = await this.getSystemInfo();
        }

        // Initial upload on startup - wait for it to complete so button can be added immediately
        if (this.systemInfo) {
            try {
                await this.updateSystemInfoUrl(this.systemInfo);
                console.log('Initial system info upload completed');
            } catch (err) {
                console.error('Initial upload failed, will retry:', err.message);
            }
        }

        // Initial update (after upload completes)
        this.updateRichPresence();

        // Regular updates
        this.updateInterval = setInterval(() => {
            this.updateRichPresence();
        }, this.config.discord.updateInterval || 5000);
        
        // Update system info URL every 30 minutes
        this.urlUpdateInterval = setInterval(async () => {
            if (this.systemInfo) {
                await this.updateSystemInfoUrl(this.systemInfo);
            }
        }, 1800000); // 30 minutes (30 * 60 * 1000)
    }

    async toggle() {
        this.isActive = !this.isActive;
        console.log(`Rich Presence ${this.isActive ? 'enabled' : 'disabled'}`);
        await this.updateRichPresence();
        this.saveStatus();
        return this.isActive;
    }

    async start() {
        console.log('Starting Arch Linux Rich Presence...');
        const connected = await this.connectDiscord();
        if (!connected) {
            console.error('Failed to connect to Discord. Exiting.');
            process.exit(1);
        }

        // Setup status file watching for external toggles
        let lastStatusTime = 0;
        this.watchInterval = setInterval(() => {
            try {
                if (fs.existsSync(this.statusFile)) {
                    const status = JSON.parse(fs.readFileSync(this.statusFile, 'utf8'));
                    // Check if there's a toggle request (newer timestamp means external toggle)
                    if (status.toggle && status.timestamp > lastStatusTime) {
                        lastStatusTime = status.timestamp;
                        if (status.active !== this.isActive) {
                            this.isActive = status.active;
                            console.log(`Rich Presence toggled to: ${this.isActive ? 'enabled' : 'disabled'}`);
                            this.updateRichPresence();
                        }
                        // Clear toggle flag after processing
                        delete status.toggle;
                        fs.writeFileSync(this.statusFile, JSON.stringify(status));
                    }
                }
            } catch (error) {
                // Ignore
            }
        }, 500);

        // Handle graceful shutdown
        process.on('SIGINT', () => this.shutdown());
        process.on('SIGTERM', () => this.shutdown());

        console.log('Arch Linux Rich Presence is running!');
    }

    async shutdown() {
        console.log('Shutting down...');
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        if (this.urlUpdateInterval) {
            clearInterval(this.urlUpdateInterval);
        }
        if (this.watchInterval) {
            clearInterval(this.watchInterval);
        }
        // Clean up file watchers
        this.historyWatchers.forEach((_, histFile) => {
            try {
                fs.unwatchFile(histFile);
            } catch (error) {
                // Ignore errors
            }
        });
        this.historyWatchers.clear();
        if (this.rpc) {
            await this.rpc.clearActivity();
            await this.rpc.destroy();
        }
        process.exit(0);
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    // Allow config path to be passed as first argument, otherwise auto-detect
    let configPath = null;
    if (args.length > 0 && args[0] && !args[0].startsWith('-') && args[0] !== 'toggle') {
        configPath = args[0];
        args.shift(); // Remove config path from args
    }
    const rp = new ArchRichPresence(configPath);

    if (args[0] === 'toggle') {
        // Toggle mode - read current status and flip it
        rp.loadConfig();
        if (fs.existsSync(rp.statusFile)) {
            try {
                const status = JSON.parse(fs.readFileSync(rp.statusFile, 'utf8'));
                rp.isActive = status.active;
            } catch (error) {
                // Default
            }
        }
        rp.toggle().then(() => process.exit(0));
    } else {
        // Normal start
        rp.start();
    }
}

module.exports = ArchRichPresence;

