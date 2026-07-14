export const DEFAULT_SETTINGS = {
  launchOnStartup: false,
  timeFormat: '12h',
  defaultTarget: 240, // minutes (4 hours)
  breakDuration: 5,   // minutes
  chimeStyle: 'arpeggio',
  timerTick: false,
  showOverlayDuringSession: true,
  closeToTray: false
};

export const SettingsStore = {
  getSettings: () => {
    try {
      const stored = localStorage.getItem('sm_settings');
      if (stored) {
        // Deep merge with defaults to ensure new settings are added without breaking existing ones
        return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      }
    } catch (e) {
      console.error('Failed to parse settings from localStorage:', e);
    }
    return DEFAULT_SETTINGS;
  },

  saveSettings: (config) => {
    localStorage.setItem('sm_settings', JSON.stringify(config));
    window.dispatchEvent(new CustomEvent('settings-updated', { detail: config }));
  },

  reset: () => {
    localStorage.removeItem('sm_settings');
    window.dispatchEvent(new CustomEvent('settings-updated', { detail: DEFAULT_SETTINGS }));
  }
};
