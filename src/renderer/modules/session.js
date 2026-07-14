/**
 * Phase 6: Session Orchestration Module
 * Handles initialization and start logic for Focus Studio and Strict Sessions.
 * 
 * This module extracts the complex validation and setup logic from renderer.js
 * to maintain a thin entry point and improve modularity.
 */

import {
  SessionState,
  isValidUrl,
  normalizeStrictUrl,
  logState,
  startTimerSequence,
  syncSessionTasks,
  showSessionOverlay
} from '../components/timer-ui.js';


export function initSessionModules() {
  console.log('[Session Module] Initializing session listeners...');

  const startBtn = document.getElementById('start-btn');
  const startStrictBtn = document.getElementById('start-strict-btn');

  // Inputs
  const focusInput = document.getElementById('focus-input');
  const breakInput = document.getElementById('break-input');
  const taskInput = document.getElementById('task-input');
  const estCyclesInput = document.getElementById('est-cycles-input');

  // Strict Inputs
  const strictFocusInput = document.getElementById('strict-focus-input');
  const strictBreakInput = document.getElementById('strict-break-input');
  const strictTaskInput = document.getElementById('strict-task-input');
  const strictEstCyclesInput = document.getElementById('strict-est-cycles-input');
  const strictUrlInput = document.getElementById('strict-url-input');

  // Views & UI Elements
  const setupView = document.getElementById('setup-view');
  const strictView = document.getElementById('strict-view');
  const timerView = document.getElementById('timer-view');
  const activeSessionView = document.getElementById('active-session-view');
  const appShell = document.getElementById('app-shell');
  const sessionStatusLabel = document.getElementById('session-status-label');

  // Clamping Helpers
  const clampInput = (inputEl, min, max, defaultValue) => {
    if (!inputEl) return;
    let val = parseInt(inputEl.value);
    if (isNaN(val)) {
      inputEl.value = defaultValue;
    } else {
      if (val < min) val = min;
      if (val > max) val = max;
      inputEl.value = val;
    }
  };

  const setupInputClamping = (inputEl, min, max, defaultValue) => {
    if (!inputEl) return;
    const handler = () => clampInput(inputEl, min, max, defaultValue);
    inputEl.addEventListener('change', handler);
    inputEl.addEventListener('blur', handler);
  };

  // Setup dynamic listeners for clamping inputs
  setupInputClamping(focusInput, 1, 1440, 25);
  setupInputClamping(breakInput, 1, 1440, 5);
  setupInputClamping(estCyclesInput, 0, 100, 0);
  setupInputClamping(strictFocusInput, 1, 1440, 45);
  setupInputClamping(strictBreakInput, 1, 1440, 10);
  setupInputClamping(strictEstCyclesInput, 0, 100, 0);

  // --- Standard Focus Session Start ---
  if (startBtn) {
    startBtn.addEventListener('click', () => {
      SessionState.reset();
      logState('SESSION_START');
      
      // Clamp inputs before starting
      clampInput(focusInput, 1, 1440, 25);
      clampInput(breakInput, 1, 1440, 5);
      clampInput(estCyclesInput, 0, 100, 0);

      // Values from UI
      SessionState.focusTime = (parseInt(focusInput.value) || 25) * 60;
      SessionState.breakTime = (parseInt(breakInput.value) || 5) * 60;
      SessionState.immersiveUrl = ""; // No immersive link for standard sessions
      SessionState.currentTask = taskInput.value.trim() || "Focus Session";
      SessionState.estCycles = parseInt(estCyclesInput.value) || 0;
      
      const audioChecked = document.querySelector('input[name="notification"]:checked');
      SessionState.useAudio = audioChecked ? audioChecked.value === 'audio' : false;

      // Initial State
      SessionState.isFocus = true; 
      SessionState.isPaused = false; 
      SessionState.cycleCount = 0; 
      SessionState.isStrict = false; 
      SessionState.endingSession = false;

      // Lock system
      window.electronAPI.startGlobalFocus();



      // UI Transition
      if (setupView) setupView.classList.remove('active');
      if (timerView) timerView.classList.add('active');
      if (activeSessionView) activeSessionView.classList.add('active');
      if (appShell) appShell.style.display = 'none';
      if (sessionStatusLabel) sessionStatusLabel.textContent = "Focus Session";
      
      // Sync Tasks
      syncSessionTasks();

      // Start Engine
      startTimerSequence();
      showSessionOverlay();
    });
  }

  // --- Strict Protocol Session Start ---
  if (startStrictBtn) {
    startStrictBtn.addEventListener('click', () => {
      const url = strictUrlInput.value.trim();
      const finalUrl = normalizeStrictUrl(url);

      if (url && !isValidUrl(url)) {
        alert("Invalid Protocol: Strict sessions only support secure direct YouTube video links over HTTPS.");
        return;
      }

      SessionState.reset();
      logState('STRICT_SESSION_START');
      
      // Clamp inputs before starting
      clampInput(strictFocusInput, 1, 1440, 45);
      clampInput(strictBreakInput, 1, 1440, 10);
      clampInput(strictEstCyclesInput, 0, 100, 0);

      // Values from UI
      SessionState.focusTime = (parseInt(strictFocusInput.value) || 45) * 60;
      SessionState.breakTime = (parseInt(strictBreakInput.value) || 10) * 60;
      SessionState.immersiveUrl = finalUrl;
      SessionState.currentTask = strictTaskInput.value.trim() || "Deep Focus Session";
      SessionState.estCycles = parseInt(strictEstCyclesInput.value) || 0;
      SessionState.useAudio = false; // Always use blackout for strict mode

      // Initial State
      SessionState.isFocus = true; 
      SessionState.isPaused = false; 
      SessionState.cycleCount = 0; 
      SessionState.isStrict = true; 
      SessionState.endingSession = false;

      // Lock system
      window.electronAPI.startGlobalFocus();



      // UI Transition
      if (strictView) strictView.classList.remove('active');
      if (timerView) timerView.classList.add('active');
      if (activeSessionView) activeSessionView.classList.add('active');
      if (appShell) appShell.style.display = 'none';
      if (sessionStatusLabel) sessionStatusLabel.textContent = "Strict Protocol";
      
      // Sync Tasks
      syncSessionTasks();

      // Start Engine
      startTimerSequence();
      showSessionOverlay();
    });
  }

  // --- Protocol Shortcuts ---
  const protocolStandard = document.getElementById('protocol-standard');
  const protocolStrict = document.getElementById('protocol-strict-shortcut');
  if (protocolStandard) {
    protocolStandard.addEventListener('click', () => {
      const config = document.getElementById('standard-config');
      if (config) config.scrollIntoView({ behavior: 'smooth' });
    });
  }
  if (protocolStrict) {
    protocolStrict.addEventListener('click', () => {
      if (typeof window.switchView === 'function') window.switchView('strict-view');
    });
  }

  console.log('[Session Module] Session listeners initialized ✓');
}
