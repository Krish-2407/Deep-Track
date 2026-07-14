import { SettingsStore } from '../data/settings-store.js';

export function initSettings() {
  const settingsBtn = document.querySelector('.sidebar-btn[data-view="settings-view"]');
  if (!settingsBtn) return; // Settings view might not exist in some minimal layouts

  const saveBtn = document.getElementById('settings-save-btn');
  const cancelBtn = document.getElementById('settings-cancel-btn');
  const resetBtn = document.getElementById('settings-reset-btn');
  const exportBtn = document.getElementById('settings-export-btn');
  const saveIndicator = document.getElementById('settings-save-indicator');

  // Custom Steppers Helper
  function setupStepper(stepperId, min, max, step, formatFn) {
    const stepper = document.getElementById(stepperId);
    if (!stepper) return null;
    
    const decBtn = stepper.querySelector('.dec');
    const incBtn = stepper.querySelector('.inc');
    const input = stepper.querySelector('input[type="hidden"]');
    const display = stepper.querySelector('.stepper-display-value');
    
    const updateDisplay = () => {
      const val = parseInt(input.value) || min;
      display.textContent = formatFn(val);
    };
    
    decBtn.addEventListener('click', () => {
      let val = parseInt(input.value) || min;
      val = Math.max(min, val - step);
      input.value = val;
      updateDisplay();
      input.dispatchEvent(new Event('change'));
    });
    
    incBtn.addEventListener('click', () => {
      let val = parseInt(input.value) || min;
      val = Math.min(max, val + step);
      input.value = val;
      updateDisplay();
      input.dispatchEvent(new Event('change'));
    });
    
    return {
      setValue: (val) => {
        input.value = val;
        updateDisplay();
      },
      getValue: () => parseInt(input.value) || min
    };
  }

  // Initialize Steppers
  const steppers = {
    defaultTarget: setupStepper('stepper-defaultTarget', 30, 1440, 30, (val) => {
      const hrs = val / 60;
      if (hrs % 1 === 0) return `${hrs} hr${hrs !== 1 ? 's' : ''}`;
      return `${hrs.toFixed(1)} hrs`;
    }),
    breakDuration: setupStepper('stepper-breakDuration', 1, 60, 1, (val) => {
      return `${val} min${val !== 1 ? 's' : ''}`;
    })
  };

  // Input Elements
  const inputs = {
    launchOnStartup: document.getElementById('setting-launchOnStartup'),
    timeFormat: document.getElementById('setting-timeFormat'),
    chimeStyle: document.getElementById('setting-chimeStyle'),
    timerTick: document.getElementById('setting-timerTick'),
    showOverlayDuringSession: document.getElementById('setting-showOverlayDuringSession'),
    closeToTray: document.getElementById('setting-closeToTray')
  };

  // Warning Modal Logic
  const warningModal = document.getElementById('settings-warning-modal');
  const warningIcon = document.getElementById('warning-modal-icon');
  const warningGlow = document.getElementById('warning-glow-ring');
  const warningTitle = document.getElementById('warning-modal-title');
  const warningMsg = document.getElementById('warning-modal-message');
  const warningPrimaryBtn = document.getElementById('warning-modal-primary-btn');
  const warningSecondaryBtn = document.getElementById('warning-modal-secondary-btn');

  let currentWarningTarget = null;
  let currentWarningStep = 1;

  function showWarningModal(target, step = 1) {
    currentWarningTarget = target;
    currentWarningStep = step;
    
    if (target === 'startup') {
      if (step === 1) {
        if (warningIcon) {
          warningIcon.textContent = 'rocket_launch';
          warningIcon.style.color = 'var(--primary)';
        }
        if (warningGlow) warningGlow.style.borderColor = 'var(--primary)';
        if (warningTitle) warningTitle.textContent = 'Keep Launch on Startup Enabled?';
        if (warningMsg) warningMsg.textContent = 'Deep Track runs in the background to automatically track your screen time, productivity cycles, and block distractions. If disabled, the app won\'t start automatically on boot, which will lead to gaps in your daily metrics and break your active focus streaks.';
        if (warningPrimaryBtn) warningPrimaryBtn.textContent = 'Keep Enabled (Recommended)';
        if (warningSecondaryBtn) {
          warningSecondaryBtn.textContent = 'Continue to Disable';
          warningSecondaryBtn.style.color = 'var(--muted)';
        }
      } else if (step === 2) {
        if (warningIcon) {
          warningIcon.textContent = 'warning';
          warningIcon.style.color = 'var(--red)';
        }
        if (warningGlow) warningGlow.style.borderColor = 'var(--red)';
        if (warningTitle) warningTitle.textContent = 'Are you absolutely sure?';
        if (warningMsg) warningMsg.textContent = 'Warning: If you forget to launch Deep Track manually, your daily focus sessions won\'t be tracked and you will lose your active streak. Do you still want to disable it?';
        if (warningPrimaryBtn) warningPrimaryBtn.textContent = 'Go Back (Recommended)';
        if (warningSecondaryBtn) {
          warningSecondaryBtn.textContent = 'Yes, Turn It Off';
          warningSecondaryBtn.style.color = 'var(--red)';
        }
      }

    
    if (warningModal) warningModal.classList.add('active');
  }

  function hideWarningModal() {
    if (warningModal) warningModal.classList.remove('active');
    currentWarningTarget = null;
    currentWarningStep = 1;
  }

  if (warningPrimaryBtn) {
    warningPrimaryBtn.addEventListener('click', () => {
      hideWarningModal();
    });
  }

  if (warningSecondaryBtn) {
    warningSecondaryBtn.addEventListener('click', () => {
      if (currentWarningStep === 1) {
        showWarningModal(currentWarningTarget, 2);
      } else if (currentWarningStep === 2) {
        if (currentWarningTarget === 'startup' && inputs.launchOnStartup) {
          inputs.launchOnStartup.checked = false;
        }
        hideWarningModal();
      }
    });
  }

  if (inputs.launchOnStartup) {
    inputs.launchOnStartup.addEventListener('click', (e) => {
      if (!inputs.launchOnStartup.checked) {
        e.preventDefault();
        inputs.launchOnStartup.checked = true;
        showWarningModal('startup', 1);
      }
    });
  }



  // Populate forms with current settings
  function loadForm() {
    const config = SettingsStore.getSettings();
    
    // Sync with Dashboard's local storage target if it exists
    const dashboardTarget = parseFloat(localStorage.getItem('deepwork-daily-target'));
    if (!isNaN(dashboardTarget) && dashboardTarget > 0) {
      config.defaultTarget = dashboardTarget * 60;
    }
    
    if (inputs.launchOnStartup) inputs.launchOnStartup.checked = config.launchOnStartup;
    if (inputs.timeFormat) inputs.timeFormat.value = config.timeFormat;
    if (steppers.defaultTarget) steppers.defaultTarget.setValue(config.defaultTarget);
    if (steppers.breakDuration) steppers.breakDuration.setValue(config.breakDuration);
    if (inputs.chimeStyle) inputs.chimeStyle.value = config.chimeStyle;
    if (inputs.timerTick) inputs.timerTick.checked = config.timerTick;
    if (inputs.showOverlayDuringSession) inputs.showOverlayDuringSession.checked = config.showOverlayDuringSession !== false;
    if (inputs.closeToTray) inputs.closeToTray.checked = config.closeToTray;

    
    // Dispatch initial state so app boot sequence configures correctly
    window.dispatchEvent(new CustomEvent('settings-updated', { detail: config }));
  }

  // Handle settings updates dynamically to notify Electron main process
  window.addEventListener('settings-updated', (e) => {
    const config = e.detail;
    if (window.electronAPI) {
      window.electronAPI.updateStartupSetting(config.launchOnStartup);
      if (typeof window.electronAPI.updateCloseSetting === 'function') {
        window.electronAPI.updateCloseSetting(config.closeToTray);
      }
    }
  });

  // Initial load
  loadForm();

  // Save Settings
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const newConfig = {
        launchOnStartup: inputs.launchOnStartup ? inputs.launchOnStartup.checked : false,
        timeFormat: inputs.timeFormat ? inputs.timeFormat.value : '12h',
        defaultTarget: steppers.defaultTarget ? steppers.defaultTarget.getValue() : 240,
        breakDuration: steppers.breakDuration ? steppers.breakDuration.getValue() : 5,
        chimeStyle: inputs.chimeStyle ? inputs.chimeStyle.value : 'arpeggio',
        timerTick: inputs.timerTick ? inputs.timerTick.checked : false,
        showOverlayDuringSession: inputs.showOverlayDuringSession ? inputs.showOverlayDuringSession.checked : true,
        closeToTray: inputs.closeToTray ? inputs.closeToTray.checked : false
      };

      SettingsStore.saveSettings(newConfig);
      localStorage.setItem('deepwork-daily-target', String(newConfig.defaultTarget / 60));

      // Show temporary save indicator
      if (saveIndicator) {
        saveIndicator.classList.add('show');
        setTimeout(() => {
          saveIndicator.classList.remove('show');
        }, 2500);
      }
    });
  }

  // Cancel / Discard Changes
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      loadForm(); // Reload from last saved state
    });
  }

  // Export Data
  if (exportBtn) {
    exportBtn.addEventListener('click', async () => {
      try {
        let screentimeData = {};
        if (window.electronAPI && typeof window.electronAPI.getScreenTime === 'function') {
          screentimeData = await window.electronAPI.getScreenTime() || {};
        }

        const data = {
          settings: SettingsStore.getSettings(),
          sessions: JSON.parse(localStorage.getItem('sm_sessions') || '[]'),
          notes: JSON.parse(localStorage.getItem('sm_zen_notes') || '[]'),
          tasks: JSON.parse(localStorage.getItem('sm_zen_tasks') || '[]'),
          screentime: screentimeData,
          exportDate: new Date().toISOString()
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `deep-track-backup-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error('Export failed:', err);
        alert('Failed to export data.');
      }
    });
  }

  // Factory Reset
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      const confirmReset = confirm("DANGER ZONE: Are you absolutely sure you want to wipe all your Deep Track data? This will delete your session history, settings, and Zen Notes forever. This action cannot be undone.");
      if (confirmReset) {
        if (window.electronAPI && typeof window.electronAPI.wipeScreenTimeData === 'function') {
          try {
            await window.electronAPI.wipeScreenTimeData();
          } catch (e) {
            console.error('Failed to wipe screen time data:', e);
          }
        }
        localStorage.clear();
        SettingsStore.reset(); // Emits the reset event
        loadForm();
        alert('Factory reset complete. The application will now reload to apply defaults.');
        window.location.reload();
      }
    });
  }
}
