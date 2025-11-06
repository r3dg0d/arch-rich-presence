#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const statusFile = path.join(os.tmpdir(), 'arch-rp-status.json');

function setCustomStatus(statusText) {
    let status = {};
    
    // Read existing status if it exists
    try {
        if (fs.existsSync(statusFile)) {
            status = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
        }
    } catch (error) {
        // If file doesn't exist or is invalid, start fresh
        status = { active: true };
    }
    
    // Set custom status
    if (statusText && statusText.trim()) {
        status.customStatus = statusText.trim();
        status.timestamp = Date.now();
        
        try {
            fs.writeFileSync(statusFile, JSON.stringify(status));
            console.log(`Custom status set: "${status.customStatus}"`);
            
            // Send notification
            try {
                execSync(`notify-send "Arch Linux Rich Presence" "Custom status set: ${status.customStatus}" -a "Arch Linux Rich Presence" -i "preferences-desktop" 2>/dev/null`, { encoding: 'utf8' });
            } catch (error) {
                // notify-send might not be available, that's okay
            }
            
            return true;
        } catch (error) {
            console.error(`Failed to set custom status: ${error.message}`);
            return false;
        }
    } else {
        // Clear custom status
        delete status.customStatus;
        status.timestamp = Date.now();
        
        try {
            fs.writeFileSync(statusFile, JSON.stringify(status));
            console.log('Custom status cleared');
            
            // Send notification
            try {
                execSync(`notify-send "Arch Linux Rich Presence" "Custom status cleared" -a "Arch Linux Rich Presence" -i "preferences-desktop" 2>/dev/null`, { encoding: 'utf8' });
            } catch (error) {
                // notify-send might not be available, that's okay
            }
            
            return true;
        } catch (error) {
            console.error(`Failed to clear custom status: ${error.message}`);
            return false;
        }
    }
}

function getCustomStatus() {
    try {
        if (fs.existsSync(statusFile)) {
            const status = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
            return status.customStatus || null;
        }
    } catch (error) {
        // Ignore errors
    }
    return null;
}

if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        console.log('Usage:');
        console.log('  set-status.js "Your custom status text"  - Set custom status');
        console.log('  set-status.js --clear                    - Clear custom status');
        console.log('  set-status.js --get                      - Show current custom status');
        process.exit(0);
    }
    
    if (args[0] === '--clear' || args[0] === '-c') {
        setCustomStatus('');
    } else if (args[0] === '--get' || args[0] === '-g') {
        const currentStatus = getCustomStatus();
        if (currentStatus) {
            console.log(`Current custom status: "${currentStatus}"`);
        } else {
            console.log('No custom status set');
        }
    } else {
        // Join all arguments as the status text
        const statusText = args.join(' ');
        setCustomStatus(statusText);
    }
}

module.exports = { setCustomStatus, getCustomStatus };

