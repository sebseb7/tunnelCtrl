const { app, Tray, Menu, BrowserWindow, ipcMain, dialog, nativeImage } = require('electron');
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const AutoLaunch = require('auto-launch');
const Store = require('electron-store');

class TunnelCtrl {
    constructor() {
        this.tray = null;
        this.settingsWindow = null;
        this.sshProcesses = new Map(); // Map of profileId -> process
        this.profiles = new Map(); // Map of profileId -> profile config
        this.checkInterval = null;
        this.autoLauncher = null;
        
        // Initialize Electron Store with default values
        this.store = new Store({
            defaults: {
                appSettings: {
                    autoStart: false
                },
                profiles: []
            }
        });
        
        // Initialize auto-launcher
        this.initAutoLauncher();
        
        // Load configuration
        this.loadConfig();
        
        // @note Initialize the app when Electron is ready
        app.whenReady().then(() => {
            this.createTray();
            this.startMonitoring();
            
            // Auto-connect enabled profiles after a short delay to ensure tray is ready
            setTimeout(() => {
                this.connectEnabledProfiles();
            }, 2000);
        });

        app.on('window-all-closed', (e) => {
            // Keep app running in tray
            e.preventDefault();
        });

        app.on('before-quit', () => {
            this.cleanup();
        });

        // IPC handlers
        ipcMain.handle('get-profiles', () => Array.from(this.profiles.values()));
        ipcMain.handle('add-profile', (event, profile) => this.addProfile(profile));
        ipcMain.handle('update-profile', (event, profile) => this.updateProfile(profile));
        ipcMain.handle('delete-profile', (event, profileId) => this.deleteProfile(profileId));
        ipcMain.handle('toggle-profile', (event, profileId) => this.toggleProfile(profileId));
        ipcMain.handle('get-status', () => this.getOverallStatus());
        ipcMain.handle('get-app-settings', () => this.store.get('appSettings', { autoStart: false }));
        ipcMain.handle('set-auto-start', (event, enabled) => this.setAutoStart(enabled));
        ipcMain.handle('close-settings-window', () => this.closeSettingsWindow());
    }

    createTray() {
        // Create tray icons
        this.createTrayIcons();
        
        // Create tray
        this.tray = new Tray(this.getIconPath(false));
        this.tray.setToolTip('TunnelCtrl - SSH Tunnel Monitor');
        
        this.updateTrayMenu();
        
        // Handle tray click
        this.tray.on('click', () => {
            this.openSettings();
        });
    }

    createTrayIcons() {
        const assetsDir = path.join(__dirname, 'assets');
        if (!fs.existsSync(assetsDir)) {
            fs.mkdirSync(assetsDir);
        }

        // Create simple red and green icons using nativeImage
        // This creates minimal 16x16 colored squares that work as tray icons
        
        // Red icon data (16x16 red circle as base64 PNG)
        const redIconBuffer = Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAFYSURBVDiNpZM9SwNBEIafgIWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYW',
            'base64'
        );
        
        // Green icon data (16x16 green circle as base64 PNG)
        const greenIconBuffer = Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAFYSURBVDiNpZM9SwNBEIafgIWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYW',
            'base64'
        );

        // Create simple colored rectangles as fallback
        const redIcon = nativeImage.createEmpty();
        const greenIcon = nativeImage.createEmpty();
        
        // Try to create from dataURL instead
        const redDataURL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAA3NJREFUOI2lk01oE1EQx3+zmSTbJE3SpmmTNrVJ05ZGa2uxFVsQRBBBUBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBCEYRhGEARBGIZhGEYQBGEYhmEYQRCEYRiGYQRBEIZhGIZhBEEQhmEYhmEEQRCGYRiGYQRBEIZhGIZhBEEQhmEYhmEEQRCGYRiGYQRBEIZhGIZhBEEQhmEYhmEEQRCGYRiGYQRBEIZhGIZhBEEQhmEYhmEEQRCGYRiGYQRBEIZhGIZhBEEQhmEYhmEEQRCGYRiGYQRBEIZhGIZhBEEQhmEYhmEEQRCGYRiGYQRBEIZhGIZhBEEQhmEYhmEEQRCGYRiGYQRBEIZhGIZhBEEQhmEYhmEEQRCGYRiGYQRBEIZhGIZhBEEQhmEYhmEEQRCGYRiGYQRBEIZZJrLJJJKwLi+++++++8ffe+zNT7/00RgAAAABJRU5ErkJggg==';
        const greenDataURL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAA3NJREFUOI2lk01oE1EQx3+zmSTbJE3SpmmTNrVJ05ZGa2uxFVsQRBBBUBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBBBEEEQRBCEYRhGEARBGIZhGEYQBGEYhmEYQRCEYRiGYQRBEIZhGIZhBEEQhmEYhmEEQRCGYRiGYQRBEIZhGIZhBEEQhmEYhmEEQRCGYRiGYQRBEIZhGIZhBEEQhmEYhmEEQRCGYRiGYQRBEIZhGIZhBEEQhmEYhmEEQRCGYRiGYQRBEIZhGIZhBEEQhmEYhmEEQRCGYRiGYQRBEIZhGIZhBEEQhmEYhmEEQRCGYRiGYQRBEIZhGIZhBEEQhmEYhmEEQRCGYRiGYQRBEIZhGIZhBEEQhmEYhmEEQRCGYRiGYQRBEIZhGIZhBEEQhmEYhmEEQRCGYRiGYQRBEIZZJrLJJJKwLi+++++++8ffe+zNT7/00RgAAAABJRU5ErkJggg==';
        
        // Create basic icons from simple data
        const redSimple = nativeImage.createFromDataURL(redDataURL);
        const greenSimple = nativeImage.createFromDataURL(greenDataURL);
        
        // Create very simple fallback icons - just colored pixels
        const redPixels = Buffer.alloc(16 * 16 * 4); // 16x16 RGBA
        const greenPixels = Buffer.alloc(16 * 16 * 4); // 16x16 RGBA
        
        // Fill with red/green color
        for (let i = 0; i < 16 * 16; i++) {
            const pos = i * 4;
            // Red icon
            redPixels[pos] = 255;     // R
            redPixels[pos + 1] = 68;  // G  
            redPixels[pos + 2] = 68;  // B
            redPixels[pos + 3] = 255; // A
            
            // Green icon  
            greenPixels[pos] = 68;    // R
            greenPixels[pos + 1] = 255; // G
            greenPixels[pos + 2] = 68;  // B
            greenPixels[pos + 3] = 255; // A
        }
        
        const redFinal = nativeImage.createFromBuffer(redPixels, { width: 16, height: 16 });
        const greenFinal = nativeImage.createFromBuffer(greenPixels, { width: 16, height: 16 });

        // Save the icons
        fs.writeFileSync(path.join(assetsDir, 'red-icon.png'), redFinal.toPNG());
        fs.writeFileSync(path.join(assetsDir, 'green-icon.png'), greenFinal.toPNG());
    }

    getIconPath(connected) {
        const iconName = connected ? 'green-icon.png' : 'red-icon.png';
        return path.join(__dirname, 'assets', iconName);
    }

    updateTrayMenu() {
        const status = this.getOverallStatus();
        const activeProfiles = Array.from(this.profiles.values()).filter(p => p.enabled);
        
        const menuItems = [
            {
                label: `Status: ${status.connected > 0 ? `${status.connected}/${status.total} Connected` : 'All Disconnected'}`,
                enabled: false
            },
            { type: 'separator' }
        ];

        // Add profile-specific menu items
        if (activeProfiles.length > 0) {
            activeProfiles.forEach(profile => {
                const isConnected = this.sshProcesses.has(profile.id) && !this.sshProcesses.get(profile.id).killed;
                menuItems.push({
                    label: `${profile.name}: ${isConnected ? 'Connected' : 'Disconnected'}`,
                    submenu: [
                        {
                            label: isConnected ? 'Disconnect' : 'Connect',
                            click: () => this.toggleProfile(profile.id)
                        }
                    ]
                });
            });
            menuItems.push({ type: 'separator' });
        }

        menuItems.push(
            {
                label: 'Settings',
                click: () => this.openSettings()
            },
            { type: 'separator' },
            {
                label: 'Quit',
                click: () => {
                    this.cleanup();
                    app.quit();
                }
            }
        );

        const contextMenu = Menu.buildFromTemplate(menuItems);
        this.tray.setContextMenu(contextMenu);
    }

    updateTrayIcon() {
        if (this.tray) {
            const status = this.getOverallStatus();
            const isConnected = status.connected > 0;
            this.tray.setImage(this.getIconPath(isConnected));
            this.tray.setToolTip(`TunnelCtrl - ${status.connected}/${status.total} Connected`);
            this.updateTrayMenu();
        }
    }

    loadConfig() {
        try {
            // Load profiles from store
            const profiles = this.store.get('profiles', []);
            profiles.forEach(profile => {
                this.profiles.set(profile.id, profile);
            });

            // Check for migration from old config.json file
            const oldConfigPath = path.join(__dirname, 'config.json');
            if (fs.existsSync(oldConfigPath)) {
                console.log('Migrating from old config.json file...');
                try {
                    const oldConfig = JSON.parse(fs.readFileSync(oldConfigPath, 'utf8'));
                    
                    // Migrate app settings
                    if (oldConfig.appSettings) {
                        this.store.set('appSettings', oldConfig.appSettings);
                    }
                    
                    // Migrate profiles
                    if (oldConfig.profiles && oldConfig.profiles.length > 0) {
                        this.store.set('profiles', oldConfig.profiles);
                        oldConfig.profiles.forEach(profile => {
                            this.profiles.set(profile.id, profile);
                        });
                    }
                    
                    // Handle old single sshCommand format
                    if (oldConfig.sshCommand && this.profiles.size === 0) {
                        const profile = {
                            id: 'default',
                            name: 'Default Profile',
                            command: oldConfig.sshCommand,
                            enabled: true
                        };
                        this.profiles.set('default', profile);
                        this.store.set('profiles', [profile]);
                    }
                    
                    console.log('Migration completed successfully');
                } catch (migrationError) {
                    console.error('Error during migration:', migrationError);
                }
            }
        } catch (error) {
            console.error('Failed to load config:', error);
        }
    }

    saveConfig() {
        try {
            // Save profiles to store
            this.store.set('profiles', Array.from(this.profiles.values()));
        } catch (error) {
            console.error('Failed to save config:', error);
        }
    }

    initAutoLauncher() {
        this.autoLauncher = new AutoLaunch({
            name: 'TunnelCtrl',
            path: process.execPath,
            isHidden: true
        });
    }

    async setAutoStart(enabled) {
        try {
            // Update app settings in store
            const appSettings = this.store.get('appSettings', { autoStart: false });
            appSettings.autoStart = enabled;
            this.store.set('appSettings', appSettings);
            
            const isEnabled = await this.autoLauncher.isEnabled();
            
            if (enabled && !isEnabled) {
                await this.autoLauncher.enable();
            } else if (!enabled && isEnabled) {
                await this.autoLauncher.disable();
            }
            
            return true;
        } catch (error) {
            console.error('Failed to set auto-start:', error);
            return false;
        }
    }

    startMonitoring() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }
        
        // Check connection status every 5 seconds
        this.checkInterval = setInterval(() => {
            this.checkConnectionStatus();
        }, 5000);
        
        // Initial check
        this.checkConnectionStatus();
    }

    restartMonitoring() {
        this.disconnect();
        this.startMonitoring();
    }

    async checkConnectionStatus() {
        let statusChanged = false;
        
        for (const [profileId, profile] of this.profiles) {
            if (!profile.enabled) continue;
            
            const wasConnected = this.sshProcesses.has(profileId) && !this.sshProcesses.get(profileId).killed;
            const process = this.sshProcesses.get(profileId);
            const isConnected = process && !process.killed;
            
            if (wasConnected !== isConnected) {
                statusChanged = true;
            }
        }
        
        if (statusChanged) {
            this.updateTrayIcon();
        }
    }

    notifyStatusChange(profileName, connected) {
        if (this.tray) {
            this.tray.displayBalloon({
                title: 'TunnelCtrl',
                content: `${profileName}: ${connected ? 'Connected' : 'Disconnected'}`,
                icon: path.join(__dirname, 'assets', connected ? 'green-icon.png' : 'red-icon.png')
            });
        }
    }

    addProfile(profile) {
        const id = Date.now().toString();
        const newProfile = {
            id,
            name: profile.name || 'New Profile',
            command: profile.command || '',
            enabled: false,
            keepAlive: profile.keepAlive !== undefined ? profile.keepAlive : true,
            keepAliveInterval: profile.keepAliveInterval || 60,
            autoReconnect: profile.autoReconnect !== undefined ? profile.autoReconnect : true,
            maxReconnectAttempts: profile.maxReconnectAttempts || 5
        };
        this.profiles.set(id, newProfile);
        this.saveConfig();
        return newProfile;
    }

    updateProfile(profile) {
        if (this.profiles.has(profile.id)) {
            this.profiles.set(profile.id, profile);
            this.saveConfig();
            return true;
        }
        return false;
    }

    deleteProfile(profileId) {
        if (this.profiles.has(profileId)) {
            // Disconnect if running
            this.disconnectProfile(profileId);
            this.profiles.delete(profileId);
            this.saveConfig();
            this.updateTrayIcon();
            return true;
        }
        return false;
    }

    toggleProfile(profileId) {
        const profile = this.profiles.get(profileId);
        if (!profile) return false;

        const isConnected = this.sshProcesses.has(profileId) && !this.sshProcesses.get(profileId).killed;
        
        if (isConnected) {
            this.disconnectProfile(profileId);
        } else {
            this.connectProfile(profileId);
        }
        
        return true;
    }

    connectEnabledProfiles() {
        console.log('Auto-connecting enabled profiles...');
        
        const enabledProfiles = Array.from(this.profiles.values()).filter(profile => 
            profile.enabled && profile.command && profile.command.trim() !== ''
        );
        
        if (enabledProfiles.length === 0) {
            console.log('No enabled profiles found for auto-connect');
            return;
        }
        
        console.log(`Found ${enabledProfiles.length} enabled profile(s) to connect`);
        
        // Connect each enabled profile with a small delay between connections
        enabledProfiles.forEach((profile, index) => {
            setTimeout(() => {
                console.log(`Auto-connecting profile: ${profile.name}`);
                const success = this.connectProfile(profile.id);
                if (success) {
                    console.log(`Successfully initiated connection for: ${profile.name}`);
                } else {
                    console.log(`Failed to connect profile: ${profile.name}`);
                }
            }, index * 1000); // 1 second delay between each connection
        });
    }

    connectProfile(profileId, isReconnect = false) {
        const profile = this.profiles.get(profileId);
        if (!profile || !profile.command || this.sshProcesses.has(profileId)) {
            return false;
        }

        try {
            // Build enhanced command with keep-alive options
            const enhancedCommand = this.buildEnhancedSSHCommand(profile);
            const commandParts = enhancedCommand.trim().split(' ');
            const command = commandParts[0];
            const args = commandParts.slice(1);

            const sshProcess = spawn(command, args, {
                stdio: 'pipe',
                detached: false
            });

            // Initialize reconnect attempt counter
            if (!isReconnect) {
                this.resetReconnectAttempts(profileId);
            }

            sshProcess.on('error', (error) => {
                console.error(`SSH process error for ${profile.name}:`, error);
                this.handleConnectionError(profileId, error);
            });

            sshProcess.on('exit', (code, signal) => {
                console.log(`SSH process exit for ${profile.name} with code: ${code}, signal: ${signal}`);
                this.handleConnectionExit(profileId, code, signal);
            });

            this.sshProcesses.set(profileId, sshProcess);

            // Give it a moment to establish connection
            setTimeout(() => {
                if (this.sshProcesses.has(profileId) && !this.sshProcesses.get(profileId).killed) {
                    this.notifyStatusChange(profile.name, true);
                    this.updateTrayIcon();
                    if (isReconnect) {
                        this.notifyStatusChange(profile.name + " (Reconnected)", true);
                    }
                    this.resetReconnectAttempts(profileId);
                }
            }, 2000);

            return true;
        } catch (error) {
            console.error(`Failed to start SSH for ${profile.name}:`, error);
            this.handleConnectionError(profileId, error);
            return false;
        }
    }

    buildEnhancedSSHCommand(profile) {
        let command = profile.command;
        
        // Add keep-alive options if enabled
        if (profile.keepAlive) {
            const aliveInterval = profile.keepAliveInterval || 60;
            
            // Check if keep-alive options are already in the command
            if (!command.includes('ServerAliveInterval')) {
                command += ` -o ServerAliveInterval=${aliveInterval}`;
            }
            if (!command.includes('ServerAliveCountMax')) {
                command += ` -o ServerAliveCountMax=3`;
            }
        }
        
        // Add other reliability options
        if (!command.includes('ExitOnForwardFailure')) {
            command += ` -o ExitOnForwardFailure=yes`;
        }
        if (!command.includes('TCPKeepAlive')) {
            command += ` -o TCPKeepAlive=yes`;
        }
        
        return command;
    }

    handleConnectionError(profileId, error) {
        this.sshProcesses.delete(profileId);
        this.updateTrayIcon();
        
        const profile = this.profiles.get(profileId);
        if (profile && profile.autoReconnect) {
            this.attemptReconnect(profileId, `Connection error: ${error.message}`);
        }
    }

    handleConnectionExit(profileId, code, signal) {
        const profile = this.profiles.get(profileId);
        this.sshProcesses.delete(profileId);
        this.notifyStatusChange(profile.name, false);
        this.updateTrayIcon();
        
        // Provide better error messages for common issues
        let errorMessage = '';
        if (signal === 'SIGTERM' && code === null) {
            if (!profile.command.includes(' -N')) {
                errorMessage = 'Connection terminated. Missing -N flag? Add -N to prevent remote command execution.';
            } else {
                errorMessage = 'Connection terminated by remote server. Check authentication and server settings.';
            }
        } else if (code === 255) {
            errorMessage = 'SSH connection failed. Check hostname, port, and credentials.';
        } else if (code === 1) {
            errorMessage = 'SSH authentication failed or permission denied.';
        } else if (code !== 0) {
            errorMessage = `SSH exit with code: ${code}`;
        }
        
        if (errorMessage) {
            console.error(`${profile.name}: ${errorMessage}`);
            // Show error notification for manual disconnections
            if (signal === 'SIGTERM' && !profile.command.includes(' -N')) {
                if (this.tray) {
                    this.tray.displayBalloon({
                        title: 'TunnelCtrl - Connection Error',
                        content: `${profile.name}: Add -N flag to your SSH command`,
                        icon: path.join(__dirname, 'assets', 'red-icon.png')
                    });
                }
            }
        }
        
        // Attempt reconnect if enabled and exit was unexpected (but not for SIGTERM which usually means manual disconnect)
        if (profile && profile.autoReconnect && code !== 0 && signal !== 'SIGTERM') {
            this.attemptReconnect(profileId, errorMessage || `Unexpected exit with code: ${code}`);
        }
    }

    attemptReconnect(profileId, reason) {
        const profile = this.profiles.get(profileId);
        if (!profile) return;

        const attempts = this.getReconnectAttempts(profileId);
        const maxAttempts = profile.maxReconnectAttempts || 5;

        if (attempts < maxAttempts) {
            this.incrementReconnectAttempts(profileId);
            const delay = Math.min(1000 * Math.pow(2, attempts), 30000); // Exponential backoff, max 30s
            
            console.log(`Attempting reconnect for ${profile.name} (attempt ${attempts + 1}/${maxAttempts}) in ${delay}ms. Reason: ${reason}`);
            
            setTimeout(() => {
                if (profile.enabled && !this.sshProcesses.has(profileId)) {
                    this.connectProfile(profileId, true);
                }
            }, delay);
        } else {
            console.log(`Max reconnect attempts reached for ${profile.name}`);
            this.notifyStatusChange(profile.name + " (Reconnect failed)", false);
        }
    }

    resetReconnectAttempts(profileId) {
        if (!this.reconnectAttempts) this.reconnectAttempts = new Map();
        this.reconnectAttempts.set(profileId, 0);
    }

    getReconnectAttempts(profileId) {
        if (!this.reconnectAttempts) this.reconnectAttempts = new Map();
        return this.reconnectAttempts.get(profileId) || 0;
    }

    incrementReconnectAttempts(profileId) {
        if (!this.reconnectAttempts) this.reconnectAttempts = new Map();
        const current = this.reconnectAttempts.get(profileId) || 0;
        this.reconnectAttempts.set(profileId, current + 1);
    }

    disconnectProfile(profileId) {
        const process = this.sshProcesses.get(profileId);
        const profile = this.profiles.get(profileId);
        
        if (process) {
            process.kill();
            this.sshProcesses.delete(profileId);
            if (profile) {
                this.notifyStatusChange(profile.name, false);
            }
            this.updateTrayIcon();
        }
    }

    getOverallStatus() {
        const enabledProfiles = Array.from(this.profiles.values()).filter(p => p.enabled);
        const connectedCount = enabledProfiles.filter(profile => {
            const process = this.sshProcesses.get(profile.id);
            return process && !process.killed;
        }).length;
        
        return {
            connected: connectedCount,
            total: enabledProfiles.length,
            profiles: enabledProfiles.map(profile => ({
                ...profile,
                connected: this.sshProcesses.has(profile.id) && !this.sshProcesses.get(profile.id).killed
            }))
        };
    }

    openSettings() {
        if (this.settingsWindow) {
            this.settingsWindow.focus();
            return;
        }

        this.settingsWindow = new BrowserWindow({
            width: 600,
            height: 600,
            show: false,
            resizable: false,
            minimizable: false,
            maximizable: false,
            autoHideMenuBar: true,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            },
            icon: path.join(__dirname, 'logo.png')
        });

        this.settingsWindow.loadFile('settings.html');

        this.settingsWindow.once('ready-to-show', () => {
            this.settingsWindow.show();
        });

        this.settingsWindow.on('closed', () => {
            this.settingsWindow = null;
        });
    }

    closeSettingsWindow() {
        if (this.settingsWindow) {
            this.settingsWindow.close();
        }
    }

    cleanup() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }
        // Disconnect all profiles
        for (const profileId of this.sshProcesses.keys()) {
            this.disconnectProfile(profileId);
        }
    }
}

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        // Focus settings window if it exists
        if (global.tunnelCtrl && global.tunnelCtrl.settingsWindow) {
            global.tunnelCtrl.settingsWindow.focus();
        }
    });

    // Create app instance
    global.tunnelCtrl = new TunnelCtrl();
} 