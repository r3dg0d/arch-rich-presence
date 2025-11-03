#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const statusFile = path.join(os.tmpdir(), 'arch-rp-status.json');
const serviceName = 'arch-rich-presence';

function getCurrentStatus() {
    try {
        if (fs.existsSync(statusFile)) {
            const status = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
            return status.active;
        }
    } catch (error) {
        // Ignore
    }
    return true; // Default
}

function toggleStatus() {
    const currentStatus = getCurrentStatus();
    const newStatus = !currentStatus;
    
    // Write toggle command to status file
    const status = {
        active: newStatus,
        timestamp: Date.now(),
        toggle: true
    };
    
    fs.writeFileSync(statusFile, JSON.stringify(status));
    
    // Send notification
    try {
        const message = newStatus 
            ? 'Discord Rich Presence: Enabled'
            : 'Discord Rich Presence: Privacy Mode';
        execSync(`notify-send "Arch Linux Rich Presence" "${message}" -a "Arch Linux Rich Presence" -i "preferences-desktop" 2>/dev/null`, { encoding: 'utf8' });
    } catch (error) {
        // notify-send might not be available, that's okay
    }
    
    return newStatus;
}

if (require.main === module) {
    const newStatus = toggleStatus();
    console.log(`Rich Presence ${newStatus ? 'enabled' : 'disabled'}`);
}

module.exports = { toggleStatus, getCurrentStatus };

