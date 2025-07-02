const { ipcRenderer } = require('electron');

class SettingsUI {
    constructor() {
        this.profiles = [];
        this.currentEditingProfile = null;
        
        this.elements = {
            // Header elements
            statusDot: document.getElementById('statusDot'),
            statusText: document.getElementById('statusText'),
            
            // App settings
            autoStartCheckbox: document.getElementById('autoStartCheckbox'),
            
            // Profile list elements
            profilesList: document.getElementById('profilesList'),
            noProfiles: document.getElementById('noProfiles'),
            addProfileBtn: document.getElementById('addProfileBtn'),
            
            // Footer elements
            overallStatus: document.getElementById('overallStatus'),
            closeBtn: document.getElementById('closeBtn'),
            
            // Modal elements
            profileModal: document.getElementById('profileModal'),
            modalTitle: document.getElementById('modalTitle'),
            modalClose: document.getElementById('modalClose'),
            modalCancel: document.getElementById('modalCancel'),
            modalSave: document.getElementById('modalSave'),
            profileName: document.getElementById('profileName'),
            profileCommand: document.getElementById('profileCommand'),
            profileKeepAlive: document.getElementById('profileKeepAlive'),
            profileKeepAliveInterval: document.getElementById('profileKeepAliveInterval'),
            profileAutoReconnect: document.getElementById('profileAutoReconnect'),
            profileMaxReconnectAttempts: document.getElementById('profileMaxReconnectAttempts'),
            
            // Notification
            notification: document.getElementById('notification'),
            notificationText: document.getElementById('notificationText')
        };

        this.initializeUI();
        this.attachEventListeners();
        this.loadAppSettings();
        this.loadProfiles();
        this.startStatusPolling();
    }

    initializeUI() {
        // Set initial states
        this.updateProfilesList();
    }

    attachEventListeners() {
        // App settings event listeners
        this.elements.autoStartCheckbox.addEventListener('change', () => this.setAutoStart());
        
        // Button event listeners
        this.elements.addProfileBtn.addEventListener('click', () => this.showAddProfileModal());
        this.elements.closeBtn.addEventListener('click', () => this.closeWindow());
        
        // Modal event listeners
        this.elements.modalClose.addEventListener('click', () => this.hideModal());
        this.elements.modalCancel.addEventListener('click', () => this.hideModal());
        this.elements.modalSave.addEventListener('click', () => this.saveProfile());
        
        // Modal keyboard events
        this.elements.profileModal.addEventListener('click', (e) => {
            if (e.target === this.elements.profileModal) {
                this.hideModal();
            }
        });
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !this.elements.profileModal.classList.contains('hidden')) {
                this.hideModal();
            }
        });
        
        // Form events
        this.elements.profileName.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.elements.profileCommand.focus();
            }
        });
        
        this.elements.profileCommand.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.saveProfile();
            }
        });

        // Window event listeners
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });
    }

    async loadAppSettings() {
        try {
            const appSettings = await ipcRenderer.invoke('get-app-settings');
            this.elements.autoStartCheckbox.checked = appSettings.autoStart || false;
        } catch (error) {
            console.error('Failed to load app settings:', error);
        }
    }

    async setAutoStart() {
        try {
            const enabled = this.elements.autoStartCheckbox.checked;
            const success = await ipcRenderer.invoke('set-auto-start', enabled);
            
            if (success) {
                this.showNotification(`Auto-start ${enabled ? 'enabled' : 'disabled'}`, 'success');
            } else {
                this.showNotification('Failed to update auto-start setting', 'error');
                // Revert checkbox state
                this.elements.autoStartCheckbox.checked = !enabled;
            }
        } catch (error) {
            console.error('Failed to set auto-start:', error);
            this.showNotification('Failed to update auto-start setting', 'error');
        }
    }

    async loadProfiles() {
        try {
            this.profiles = await ipcRenderer.invoke('get-profiles');
            this.updateProfilesList();
            this.updateStatus();
        } catch (error) {
            console.error('Failed to load profiles:', error);
            this.showNotification('Failed to load profiles', 'error');
        }
    }

    updateProfilesList() {
        if (this.profiles.length === 0) {
            this.elements.profilesList.innerHTML = '';
            this.elements.noProfiles.classList.remove('hidden');
            return;
        }
        
        this.elements.noProfiles.classList.add('hidden');
        
        this.elements.profilesList.innerHTML = this.profiles.map(profile => 
            this.createProfileHTML(profile)
        ).join('');
        
        // Attach event listeners to profile elements
        this.profiles.forEach(profile => {
            this.attachProfileEventListeners(profile.id);
        });
    }

    createProfileHTML(profile) {
        const status = this.getProfileStatus(profile);
        const statusClass = status.connected ? 'connected' : 'disconnected';
        const statusText = status.connected ? 'Connected' : 'Disconnected';
        
        return `
            <div class="profile-item ${statusClass}" data-profile-id="${profile.id}">
                <div class="profile-header">
                    <div class="profile-name">${this.escapeHtml(profile.name)}</div>
                    <div class="profile-status ${statusClass}">${statusText}</div>
                </div>
                <div class="profile-command">${this.escapeHtml(profile.command)}</div>
                <div class="profile-actions">
                    <div class="profile-toggle">
                        <div class="toggle-switch ${profile.enabled ? 'enabled' : ''}" 
                             data-profile-id="${profile.id}" 
                             data-action="toggle-enabled">
                        </div>
                        <span>Enabled</span>
                    </div>
                    <button class="btn btn-secondary btn-small" 
                            data-profile-id="${profile.id}" 
                            data-action="connect">
                        ${status.connected ? 'Disconnect' : 'Connect'}
                    </button>
                    <button class="btn btn-secondary btn-small" 
                            data-profile-id="${profile.id}" 
                            data-action="edit">
                        Edit
                    </button>
                    <button class="btn btn-danger btn-small" 
                            data-profile-id="${profile.id}" 
                            data-action="delete">
                        Delete
                    </button>
                </div>
            </div>
        `;
    }

    attachProfileEventListeners(profileId) {
        const profileElement = document.querySelector(`[data-profile-id="${profileId}"]`);
        if (!profileElement) return;
        
        // Find all action elements within this profile
        const actionElements = profileElement.querySelectorAll('[data-action]');
        
        actionElements.forEach(element => {
            const action = element.getAttribute('data-action');
            
            element.addEventListener('click', async (e) => {
                e.preventDefault();
                await this.handleProfileAction(profileId, action);
            });
        });
    }

    async handleProfileAction(profileId, action) {
        try {
            switch (action) {
                case 'toggle-enabled':
                    await this.toggleProfileEnabled(profileId);
                    break;
                case 'connect':
                    await this.toggleProfileConnection(profileId);
                    break;
                case 'edit':
                    this.showEditProfileModal(profileId);
                    break;
                case 'delete':
                    await this.deleteProfile(profileId);
                    break;
            }
        } catch (error) {
            console.error(`Failed to handle profile action ${action}:`, error);
            this.showNotification(`Failed to ${action} profile`, 'error');
        }
    }

    async toggleProfileEnabled(profileId) {
        const profile = this.profiles.find(p => p.id === profileId);
        if (!profile) return;
        
        profile.enabled = !profile.enabled;
        const success = await ipcRenderer.invoke('update-profile', profile);
        
        if (success) {
            this.updateProfilesList();
            this.showNotification(`Profile ${profile.enabled ? 'enabled' : 'disabled'}`, 'success');
        }
    }

    async toggleProfileConnection(profileId) {
        const success = await ipcRenderer.invoke('toggle-profile', profileId);
        if (success) {
            // Update status immediately and then again after a short delay
            this.updateStatus();
            setTimeout(() => {
                this.updateStatus();
            }, 500);
        }
    }

    async deleteProfile(profileId) {
        const profile = this.profiles.find(p => p.id === profileId);
        if (!profile) return;
        
        if (confirm(`Are you sure you want to delete "${profile.name}"?`)) {
            const success = await ipcRenderer.invoke('delete-profile', profileId);
            if (success) {
                await this.loadProfiles();
                this.showNotification('Profile deleted', 'success');
            }
        }
    }

    showAddProfileModal() {
        this.currentEditingProfile = null;
        this.elements.modalTitle.textContent = 'Add Profile';
        this.elements.profileName.value = '';
        this.elements.profileCommand.value = '';
        
        // Set default values for advanced options
        this.elements.profileKeepAlive.checked = true;
        this.elements.profileKeepAliveInterval.value = 60;
        this.elements.profileAutoReconnect.checked = true;
        this.elements.profileMaxReconnectAttempts.value = 5;
        
        this.elements.profileModal.classList.remove('hidden');
        this.elements.profileName.focus();
    }

    showEditProfileModal(profileId) {
        const profile = this.profiles.find(p => p.id === profileId);
        if (!profile) return;
        
        this.currentEditingProfile = profile;
        this.elements.modalTitle.textContent = 'Edit Profile';
        this.elements.profileName.value = profile.name;
        this.elements.profileCommand.value = profile.command;
        
        // Populate advanced options (with defaults for backward compatibility)
        this.elements.profileKeepAlive.checked = profile.keepAlive !== undefined ? profile.keepAlive : true;
        this.elements.profileKeepAliveInterval.value = profile.keepAliveInterval || 60;
        this.elements.profileAutoReconnect.checked = profile.autoReconnect !== undefined ? profile.autoReconnect : true;
        this.elements.profileMaxReconnectAttempts.value = profile.maxReconnectAttempts || 5;
        
        this.elements.profileModal.classList.remove('hidden');
        this.elements.profileName.focus();
        this.elements.profileName.select();
    }

    hideModal() {
        this.elements.profileModal.classList.add('hidden');
        this.currentEditingProfile = null;
    }

    async saveProfile() {
        const name = this.elements.profileName.value.trim();
        const command = this.elements.profileCommand.value.trim();
        
        if (!name) {
            this.showNotification('Please enter a profile name', 'warning');
            this.elements.profileName.focus();
            return;
        }
        
        if (!command) {
            this.showNotification('Please enter an SSH command', 'warning');
            this.elements.profileCommand.focus();
            return;
        }

        // Validate SSH command for common issues
        if (!command.toLowerCase().startsWith('ssh')) {
            this.showNotification('Command should start with "ssh"', 'warning');
            this.elements.profileCommand.focus();
            return;
        }

        if (!command.includes(' -N')) {
            this.showNotification('Warning: Missing -N flag. Tunnels require -N to prevent remote command execution', 'warning');
            // Don't return, just warn
        }
        
        // Get advanced options
        const keepAlive = this.elements.profileKeepAlive.checked;
        const keepAliveInterval = parseInt(this.elements.profileKeepAliveInterval.value) || 60;
        const autoReconnect = this.elements.profileAutoReconnect.checked;
        const maxReconnectAttempts = parseInt(this.elements.profileMaxReconnectAttempts.value) || 5;
        
        try {
            let success;
            
            if (this.currentEditingProfile) {
                // Update existing profile
                const updatedProfile = {
                    ...this.currentEditingProfile,
                    name,
                    command,
                    keepAlive,
                    keepAliveInterval,
                    autoReconnect,
                    maxReconnectAttempts
                };
                success = await ipcRenderer.invoke('update-profile', updatedProfile);
                
                if (success) {
                    this.showNotification('Profile updated', 'success');
                }
            } else {
                // Add new profile
                const newProfile = { 
                    name, 
                    command,
                    keepAlive,
                    keepAliveInterval,
                    autoReconnect,
                    maxReconnectAttempts
                };
                const result = await ipcRenderer.invoke('add-profile', newProfile);
                success = !!result;
                
                if (success) {
                    this.showNotification('Profile added', 'success');
                }
            }
            
            if (success) {
                this.hideModal();
                await this.loadProfiles();
            }
        } catch (error) {
            console.error('Failed to save profile:', error);
            this.showNotification('Failed to save profile', 'error');
        }
    }

    async updateStatus() {
        try {
            const status = await ipcRenderer.invoke('get-status');
            console.log('Status update received:', status);
            this.updateUI(status);
        } catch (error) {
            console.error('Failed to get status:', error);
        }
    }

    updateUI(status) {
        const { connected, total } = status;
        
        // Update header status
        this.elements.statusDot.className = `status-dot ${connected > 0 ? 'connected' : ''}`;
        this.elements.statusText.textContent = `${connected}/${total} Connected`;
        
        // Update footer status
        if (total === 0) {
            this.elements.overallStatus.textContent = 'No profiles configured';
        } else if (connected === 0) {
            this.elements.overallStatus.textContent = 'All profiles disconnected';
        } else if (connected === total) {
            this.elements.overallStatus.textContent = 'All profiles connected';
        } else {
            this.elements.overallStatus.textContent = `${connected} of ${total} profiles connected`;
        }
        
        // Update body class for styling
        document.body.className = connected > 0 ? 'connected' : '';
        
        // Update profiles list with current status
        if (status.profiles) {
            // Merge status information with existing profiles
            this.profiles = this.profiles.map(profile => {
                const statusProfile = status.profiles.find(p => p.id === profile.id);
                if (statusProfile) {
                    return { ...profile, connected: statusProfile.connected };
                }
                return profile;
            });
            this.updateProfilesList();
        }
    }

    getProfileStatus(profile) {
        // Return the actual connection status
        return { connected: profile.connected || false };
    }

    startStatusPolling() {
        // Poll status every 1 second for more responsive updates
        this.statusInterval = setInterval(() => {
            this.updateStatus();
        }, 1000);
        
        // Initial status update
        this.updateStatus();
    }

    showNotification(message, type = 'info') {
        this.elements.notificationText.textContent = message;
        this.elements.notification.className = `notification ${type} show`;
        
        // Hide notification after 3 seconds
        setTimeout(() => {
            this.elements.notification.className = `notification ${type}`;
            setTimeout(() => {
                this.elements.notification.className = 'notification hidden';
            }, 300);
        }, 3000);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    async closeWindow() {
        try {
            await ipcRenderer.invoke('close-settings-window');
        } catch (error) {
            console.error('Failed to close window:', error);
        }
    }

    cleanup() {
        if (this.statusInterval) {
            clearInterval(this.statusInterval);
        }
    }
}

// Initialize the settings UI when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.settingsUI = new SettingsUI();
});

// @note Handle window focus events to refresh status
window.addEventListener('focus', () => {
    if (window.settingsUI) {
        window.settingsUI.updateStatus();
    }
});

// Export for potential external access
window.SettingsUI = SettingsUI; 