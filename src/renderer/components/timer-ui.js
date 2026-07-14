/**
 * Phase 5: Timer Engine & Break Overlay Component
 * 
 * Contains all session management logic:
 * - SessionState (reactive state machine)
 * - startTimerSequence (core timer engine)
 * - endCurrentSession (cleanup & save logic)
 * - Break overlay handling with enhanced video pause logic
 * - Session task synchronization
 * 
 * Integration: Call initTimer(dependencies) during DOMContentLoaded
 * Dependencies: SessionStore, callback for updateMediaMetadata
 */

import { SessionStore } from '../data/session-store.js';
import { SettingsStore } from '../data/settings-store.js';

// ── REACTIVE SESSION STATE ──
export const SessionState = {
  // Timer config
  focusTime: 25 * 60,
  breakTime: 5 * 60,
  estCycles: 1,
  currentTask: "",
  immersiveUrl: "",
  useAudio: false,
  isStrict: false,

  // Runtime state
  timeLeft: 0,
  timerInterval: null,
  isFocus: true,
  isPaused: false,
  cycleCount: 0,
  endingSession: false,
  breakKeyActive: false,
  isInBreakMode: false,

  // Guaranteed clean slate
  reset() {
    this.isFocus = true;
    this.isPaused = false;
    this.cycleCount = 0;
    this.endingSession = false;
    this.breakKeyActive = false;
    this.isInBreakMode = false;
    this.timerInterval = null;
    this.timeLeft = 0;
    this.isStrict = false;
    this.immersiveUrl = "";
    this.useAudio = false;
  }
};

// ── LOGGING & DEBUG ──
export function logState(label) {
  console.log(`[STATE: ${label}]`, {
    isFocus: SessionState.isFocus,
    isPaused: SessionState.isPaused,
    isStrict: SessionState.isStrict,
    breakKeyActive: SessionState.breakKeyActive,
    isInBreakMode: SessionState.isInBreakMode,
    endingSession: SessionState.endingSession,
    timeLeft: SessionState.timeLeft,
    cycleCount: SessionState.cycleCount
  });
}

// ── HELPERS ──
function normalizeStrictUrl(urlString) {
  if (!urlString) return '';

  const candidate = String(urlString).trim();
  if (!candidate) return '';

  try {
    const url = new URL(/^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`);
    const hostname = url.hostname.toLowerCase();
    const isYouTubeHost =
      hostname === 'youtube.com' ||
      hostname.endsWith('.youtube.com') ||
      hostname === 'youtu.be' ||
      hostname === 'youtube-nocookie.com' ||
      hostname.endsWith('.youtube-nocookie.com');
    const videoMatch = url.toString().match(/(?:v=|\/shorts\/|\/embed\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);

    if (url.protocol !== 'https:' || !isYouTubeHost || !videoMatch) {
      return null;
    }

    return `https://www.youtube.com/watch?v=${videoMatch[1]}`;
  } catch (e) {
    return null;
  }
}

function isValidUrl(urlString) {
  if (!urlString) return true; // Empty is fine (loads about:blank)
  return normalizeStrictUrl(urlString) !== null;
}

function getLocalDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

let lastOverlayStateKey = '';

function formatShortTime(seconds) {
  const safeSeconds = Math.max(0, seconds || 0);
  const mins = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export function syncSessionOverlayState(active = true) {
  if (!window.electronAPI) return;

  const settings = SettingsStore.getSettings();
  if (!settings.showOverlayDuringSession) return;

  const state = {
    active,
    isPaused: SessionState.isPaused,
    isFocus: SessionState.isFocus,
    isStrict: SessionState.isStrict,
    isInBreakMode: SessionState.isInBreakMode,
    timeLeft: SessionState.timeLeft,
    timeLabel: formatShortTime(SessionState.timeLeft),
    task: SessionState.currentTask || 'Focus Session'
  };
  const key = JSON.stringify(state);
  if (key === lastOverlayStateKey) return;

  lastOverlayStateKey = key;
  window.electronAPI.updateSessionState(state);
}

export function showSessionOverlay() {
  const settings = SettingsStore.getSettings();
  if (!settings.showOverlayDuringSession) {
    hideSessionOverlay();
    return;
  }
  lastOverlayStateKey = '';
  window.electronAPI?.showSessionOverlay();
  syncSessionOverlayState(true);
}

export function hideSessionOverlay() {
  lastOverlayStateKey = '';
  window.electronAPI?.hideSessionOverlay();
}

export function toggleSessionPause() {
  if (SessionState.endingSession || SessionState.isInBreakMode) {
    syncSessionOverlayState(true);
    return;
  }

  const pauseBtn = document.getElementById('pause-btn');
  const sessionPauseBtn = document.getElementById('session-pause-btn');
  const timerView = document.getElementById('timer-view');
  const webview = document.getElementById('immersive-browser');

  SessionState.isPaused = !SessionState.isPaused;
  
  if (pauseBtn) pauseBtn.textContent = SessionState.isPaused ? "▶" : "⏸";
  if (timerView) timerView.classList.toggle('paused', SessionState.isPaused);
  
  if (sessionPauseBtn) {
    sessionPauseBtn.classList.toggle('active', SessionState.isPaused);
    const btnText = sessionPauseBtn.querySelector('.btn-text');
    const btnSub = sessionPauseBtn.querySelector('.btn-subtext');
    if (btnText) btnText.textContent = SessionState.isPaused ? "Resume Session" : "Pause Session";
    if (btnSub) btnSub.textContent = SessionState.isPaused ? "Continue your focus" : "Take a short break";
  }

  if (SessionState.isPaused) {
    window.electronAPI.endFocus();
    if (SessionState.immersiveUrl && webview && webview.src && webview.src !== 'about:blank') {
      pauseAllWebviewContent(webview);
    }
  } else {
    startTimerSequence(SessionState.timeLeft);
  }

  syncSessionOverlayState(true);
}

// ── BREAK OVERLAY & VIDEO PAUSE HARDENING ──
/**
 * PHASE 5 BUG FIX: Comprehensive video pause when break starts
 * Methods:
 * 1. Pause all <video> elements
 * 2. Pause all <audio> elements
 * 3. YouTube player API (html5-main-video)
 * 4. Click YouTube pause button
 * 5. Exit fullscreen if active
 */
function pauseAllWebviewContent(webview) {
  if (!webview || !webview.src || webview.src === 'about:blank' || webview.src === '') {
    return; // Nothing to pause
  }

  // Blur webview to stop stealing focus
  webview.blur();

  try {
    webview.executeJavaScript(`
      (function() {
        try {
          // Method 1: Pause all video elements
          const videos = document.querySelectorAll('video');
          videos.forEach(v => {
            if (!v.paused) {
              v.pause();
              console.log('[Break] Paused video element');
            }
          });
          
          // Method 2: Pause all audio elements
          const audios = document.querySelectorAll('audio');
          audios.forEach(a => {
            if (!a.paused) {
              a.pause();
              console.log('[Break] Paused audio element');
            }
          });
          
          // Method 3: YouTube HTML5 player
          if (window.YT && window.YT.Player) {
            const players = document.querySelectorAll('video.html5-main-video');
            players.forEach(p => {
              if (!p.paused) {
                p.pause();
                console.log('[Break] Paused YouTube HTML5 video');
              }
            });
          }
          
          // Method 4: Click YouTube pause button if visible
          const ytPlayButton = document.querySelector('.ytp-play-button');
          if (ytPlayButton) {
            const isPlaying = ytPlayButton.getAttribute('aria-label') && 
                              ytPlayButton.getAttribute('aria-label').toLowerCase().includes('pause');
            if (isPlaying) {
              ytPlayButton.click();
              console.log('[Break] Clicked YouTube pause button');
            }
          }
          
          // Method 5: Exit fullscreen if active
          if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
            console.log('[Break] Exited fullscreen');
          }
        } catch (err) {
          console.warn('[Break] Pause error:', err);
        }
      })();
    `);
  } catch (err) {
    console.warn('[Break] executeJavaScript failed:', err);
  }
}

/**
 * Resume video when focus resumes
 */
function resumeWebviewContent(webview) {
  if (!webview || !webview.src || webview.src === 'about:blank') {
    return; // Nothing to resume
  }

  try {
    webview.executeJavaScript(`
      (function() {
        try {
          // Method 1: Resume all video elements
          const videos = document.querySelectorAll('video');
          videos.forEach(v => {
            if (v.paused) {
              v.play().catch(() => {});
              console.log('[Focus] Resumed video element');
            }
          });
          
          // Method 2: Resume all audio elements
          const audios = document.querySelectorAll('audio');
          audios.forEach(a => {
            if (a.paused) {
              a.play().catch(() => {});
              console.log('[Focus] Resumed audio element');
            }
          });
          
          // Method 3: YouTube pause button (try to click if paused)
          const ytPlayButton = document.querySelector('.ytp-play-button[title*="Play"]');
          if (ytPlayButton) {
            ytPlayButton.click();
            console.log('[Focus] Clicked YouTube play button');
          }
        } catch (err) {
          console.warn('[Focus] Resume error:', err);
        }
      })();
    `);
  } catch (err) {
    console.warn('[Focus] executeJavaScript failed:', err);
  }
}

// ── SKIP BREAK HANDLER ──
export function skipBreak() {
  const breakOverlay = document.getElementById('break-overlay');
  if (!breakOverlay) return;

  breakOverlay.classList.remove('active');
  window.electronAPI.hideBreak();
  document.body.classList.remove('break-mode');
  
  const webview = document.getElementById('immersive-browser');
  if (SessionState.immersiveUrl && webview) {
    webview.style.pointerEvents = 'all';
  }
  
  SessionState.breakKeyActive = false;
  SessionState.isInBreakMode = false;
  SessionState.isFocus = true;
  SessionState.isPaused = false;
  
  startTimerSequence(); // BUG-03 fix: actually resume session
}

// ── SYNC SESSION TASKS ──
export function syncSessionTasks() {
  const sessionTaskList = document.getElementById('session-task-list');
  const subTaskList = document.getElementById('sub-task-list');
  const sessionChecklistProgress = document.getElementById('checklist-progress-fill');
  const sessionChecklistCount = document.getElementById('checklist-count');

  if (!sessionTaskList) return;

  sessionTaskList.innerHTML = '';
  const tasks = subTaskList ? subTaskList.querySelectorAll('li') : [];
  const completed = Array.from(tasks).filter(li => li.querySelector('input').checked).length;

  tasks.forEach((li, idx) => {
    const isChecked = li.querySelector('input').checked;
    const text = li.querySelector('span').textContent;

    const item = document.createElement('div');
    item.className = 'session-task-item';
    
    const taskCheck = document.createElement('div');
    taskCheck.className = `task-check ${isChecked ? 'completed' : ''}`;
    taskCheck.dataset.idx = idx;
    
    if (isChecked) {
      const checkIcon = document.createElement('span');
      checkIcon.className = 'material-icons-outlined';
      checkIcon.style.fontSize = '14px';
      checkIcon.style.color = '#fff';
      checkIcon.textContent = 'check';
      taskCheck.appendChild(checkIcon);
    }

    const taskText = document.createElement('span');
    taskText.className = `task-text ${isChecked ? 'completed' : ''}`;
    taskText.textContent = text;

    // Delete button for session sidebar tasks
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'task-delete-btn';
    deleteBtn.title = 'Remove task';
    deleteBtn.innerHTML = '<span class="material-icons-outlined" style="font-size:14px;">close</span>';
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      li.remove(); // Remove from the hidden sub-task-list source of truth
      syncSessionTasks();
    };

    item.appendChild(taskCheck);
    item.appendChild(taskText);
    item.appendChild(deleteBtn);

    taskCheck.onclick = () => {
      const checkbox = tasks[idx].querySelector('input');
      checkbox.checked = !checkbox.checked;
      checkbox.dispatchEvent(new Event('change'));
      syncSessionTasks();
    };

    sessionTaskList.appendChild(item);
  });

  if (tasks.length > 0) {
    if (sessionChecklistCount) sessionChecklistCount.textContent = `${completed}/${tasks.length}`;
    if (sessionChecklistProgress) sessionChecklistProgress.style.width = `${(completed / tasks.length) * 100}%`;
  } else {
    if (sessionChecklistCount) sessionChecklistCount.textContent = '0/0';
    if (sessionChecklistProgress) sessionChecklistProgress.style.width = '0%';
  }
}


// ── WEB AUDIO SYNTHESIZERS ──
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function playChime() {
  try {
    const config = SettingsStore.getSettings();
    const style = config.chimeStyle || 'arpeggio';
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    if (style === 'bell') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now); // A5 (high pitch)
      osc.frequency.exponentialRampToValueAtTime(440, now + 1.5); // Decay to A4
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 1.5);
    } else if (style === 'arpeggio') {
      const notes = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
      const noteDuration = 0.15;
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * noteDuration);
        gain.gain.setValueAtTime(0.3, now + idx * noteDuration);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * noteDuration + noteDuration * 1.5);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * noteDuration);
        osc.stop(now + idx * noteDuration + noteDuration * 1.5);
      });
    }
  } catch (err) {
    console.error('[Web Audio] Failed to play chime:', err);
  }
}

function playTick() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, now); // Short, high-frequency burst
    gain.gain.setValueAtTime(0.05, now); // Subtly quiet
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05); // Fast decay
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);
  } catch (err) {
    console.error('[Web Audio] Failed to play tick:', err);
  }
}

// ── TIMER ENGINE (CORE) ──
/**
 * ⚠️ CORE ENGINE
 * Reads/writes: SessionState.isFocus, isPaused, breakKeyActive, isInBreakMode, timerInterval, timeLeft
 * Sends IPC: start-focus, end-focus, start-break, end-break
 * DO NOT modify without running TEST_CHECKLIST.md
 */
export function startTimerSequence(manualTime) {
  console.assert(!SessionState.endingSession, 
    'startTimerSequence called during session end — logic error');

  if (SessionState.timerInterval) clearInterval(SessionState.timerInterval);
  SessionState.timerInterval = null;

  if (manualTime !== undefined) {
    SessionState.timeLeft = manualTime;
  } else {
    SessionState.timeLeft = SessionState.isFocus ? SessionState.focusTime : SessionState.breakTime;
  }

  const breakOverlay = document.getElementById('break-overlay');
  const webview = document.getElementById('immersive-browser');

  if (SessionState.isFocus) {
    logState('FOCUS_CYCLE');
    document.body.classList.remove('theme-break', 'break-mode');
    
    if (breakOverlay) {
      breakOverlay.classList.remove('active');
      // PHASE 5 FIX: Hardened break overlay visibility
      breakOverlay.style.display = 'none';
      breakOverlay.style.zIndex = '-1';
    }
    
    SessionState.breakKeyActive = false;

    // BUG-04 fix: only release break lock when actually coming from break phase
    if (SessionState.isInBreakMode) {
      window.electronAPI.endBreak();
      SessionState.isInBreakMode = false;
    }

    if (SessionState.immersiveUrl || SessionState.isStrict) {
      if (webview) webview.style.pointerEvents = 'all';
      window.electronAPI.startFocus();
      if (SessionState.isStrict) document.body.classList.add('immersive-mode');

      // Resume video if webview is active
      if (webview && webview.src && webview.src !== 'about:blank') {
        resumeWebviewContent(webview);
      }

      if (SessionState.immersiveUrl && webview && webview.src !== SessionState.immersiveUrl) {
        webview.src = SessionState.immersiveUrl;
      }
    } else {
      window.electronAPI.endFocus();
    }
  } else {
    logState('BREAK_START');
    // BUG-09 fix: reset pause state when entering break
    SessionState.isPaused = false;
    SessionState.isInBreakMode = true;
    SessionState.breakKeyActive = true;

    document.body.classList.add('theme-break', 'break-mode');
    
    if (breakOverlay) {
      breakOverlay.classList.add('active');
      // PHASE 5 FIX: Hardened break overlay visibility
      breakOverlay.style.display = 'flex';
      breakOverlay.style.zIndex = '10000';
      // Ensure it covers the entire viewport
      breakOverlay.style.position = 'fixed';
      breakOverlay.style.width = '100%';
      breakOverlay.style.height = '100%';
    }
    
    window.electronAPI.endFocus();

    // PHASE 5 BUG FIX: Comprehensive pause when break starts
    if (webview) {
      pauseAllWebviewContent(webview);
      webview.style.pointerEvents = 'none';
    }
    
    // Enhanced focus handling for "S" key to work without clicking
    window.focus();
    if (breakOverlay) breakOverlay.focus();

    if (!SessionState.useAudio) {
      window.electronAPI.startBreak();
    }
  }

  // HIGH-PRECISION DRIFT-FREE TIMER
  const initialStartTime = performance.now();
  let endTime = initialStartTime + (SessionState.timeLeft * 1000);

  // FIX-P5-1: Update display immediately (fixes 00:00 bug)
  const updateDisplay = () => {
    const mins = Math.floor(SessionState.timeLeft / 60);
    const secs = SessionState.timeLeft % 60;
    const ts = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    const fts = `00:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
    if (document.getElementById('time-display')) document.getElementById('time-display').textContent = ts;
    if (document.getElementById('session-time-display')) document.getElementById('session-time-display').textContent = fts;
    if (document.getElementById('timer-progress-bar')) {
      const tt = SessionState.isFocus ? SessionState.focusTime : SessionState.breakTime;
      document.getElementById('timer-progress-bar').style.strokeDashoffset = 1382 * (1 - SessionState.timeLeft / tt);
    }
    if (!SessionState.isFocus && document.getElementById('break-timer-display')) document.getElementById('break-timer-display').textContent = ts;
    syncSessionOverlayState(true);
  };
  updateDisplay();

  SessionState.timerInterval = setInterval(() => {
    if (SessionState.isPaused) {
      endTime += 1000;
      return;
    }

    const now = performance.now();
    const newTimeLeft = Math.max(0, Math.ceil((endTime - now) / 1000));

    if (newTimeLeft !== SessionState.timeLeft) {
      const config = SettingsStore.getSettings();
      if (config.timerTick && !SessionState.isInBreakMode) {
        playTick();
      }
      SessionState.timeLeft = newTimeLeft;
      updateDisplay();
    }

    if (now >= endTime || SessionState.timeLeft <= 0) {
      clearInterval(SessionState.timerInterval);
      SessionState.timerInterval = null;
      
      if (SessionState.isFocus) {
        SessionState.cycleCount++;
        if (SessionState.estCycles > 0 && SessionState.cycleCount >= SessionState.estCycles) {
          playChime();
          // Delay modal display until after UI updates
          setTimeout(() => {
            const modal = document.getElementById('cycle-complete-modal');
            if (modal) {
              const estCyclesLabel = document.getElementById('notif-est-cycles');
              const actCyclesLabel = document.getElementById('notif-act-cycles');
              if (estCyclesLabel) estCyclesLabel.textContent = SessionState.estCycles;
              if (actCyclesLabel) actCyclesLabel.textContent = SessionState.cycleCount;
              modal.classList.add('active');
            } else {
              // Fallback if modal DOM element is not present
              alert("Goal Accomplished! Your planned cycles are complete.");
              endCurrentSession();
            }
          }, 500);
          return;
        }
      }
      
      playChime();
      SessionState.isFocus = !SessionState.isFocus;
      startTimerSequence();
    }
  }, 100);
}

// ── SESSION END & CLEANUP ──
export function endCurrentSession() {
  if (SessionState.endingSession) return;
  SessionState.endingSession = true;
  logState('SESSION_END');

  if (SessionState.timerInterval) clearInterval(SessionState.timerInterval);
  SessionState.timerInterval = null;

  // Release Electron lockdown FIRST
  window.electronAPI.endBreak();
  window.electronAPI.endFocus();
  window.electronAPI.endGlobalFocus();
  hideSessionOverlay();

  try {
    // Calculate partial progress if stopping during focus
    const elapsedInCurrentCycle = (SessionState.isFocus && SessionState.timeLeft > 0) 
      ? (SessionState.focusTime - SessionState.timeLeft) 
      : 0;
    const sessionFocusSeconds = (SessionState.cycleCount * SessionState.focusTime) + elapsedInCurrentCycle;

    if (sessionFocusSeconds > 0) {
      const totalSeconds = SessionStore.getTotalSeconds() + sessionFocusSeconds;
      const sessions = SessionStore.getSessions();

      sessions.push({
        task: SessionState.currentTask,
        estimate: SessionState.estCycles,
        actual: parseFloat((sessionFocusSeconds / SessionState.focusTime).toFixed(2)),
        focusMinutes: Math.round(SessionState.focusTime / 60),
        date: new Date().toISOString()
      });
      
      SessionStore.saveTotalSeconds(totalSeconds);
      SessionStore.saveSessions(sessions);
      
      // Refresh dashboard (called by renderer.js)
      if (typeof window.loadDashboardData === 'function') {
        window.loadDashboardData();
      }
    }
  } catch (error) {
    console.error('Session save error:', error);
  }

  try {
    const timerView = document.getElementById('timer-view');
    const activeSessionView = document.getElementById('active-session-view');
    const checklistPopover = document.getElementById('checklist-popover');
    const appShell = document.getElementById('app-shell');
    const webview = document.getElementById('immersive-browser');
    const breakOverlay = document.getElementById('break-overlay');

    if (timerView) timerView.classList.remove('active', 'paused');
    if (activeSessionView) activeSessionView.classList.remove('active');
    if (checklistPopover) checklistPopover.classList.remove('active');
    
    document.body.classList.remove('theme-break', 'break-mode', 'immersive-mode');
    
    if (appShell) appShell.style.display = 'flex';
    
    SessionState.immersiveUrl = "";
    if (webview) {
      webview.src = 'about:blank';
      webview.style.pointerEvents = 'none';
      webview.classList.remove('ready');
    }

    // Reset zen color state
    const selectedNoteColor = document.querySelector('[data-color-state]');
    document.querySelectorAll('.color-dot').forEach(d => d.classList.toggle('active', d.dataset.color === 'transparent'));

    // Switch to dashboard
    if (typeof window.switchView === 'function') {
      // Ensure body classes are cleaned up BEFORE switching views
      document.body.classList.remove('theme-break', 'break-mode', 'immersive-mode');
      if (appShell) appShell.style.display = 'flex';
      window.switchView('dash-view');
    }
  } catch (error) {
    console.error('Session cleanup error:', error);
  } finally {
    // ALWAYS runs — even if above throws
    SessionState.reset();
    hideSessionOverlay();
    document.body.classList.remove('theme-break', 'break-mode', 'immersive-mode');
    
    const timerView = document.getElementById('timer-view');
    const activeSessionView = document.getElementById('active-session-view');
    const appShell = document.getElementById('app-shell');
    const breakOverlay = document.getElementById('break-overlay');

    if (timerView) timerView.classList.remove('active', 'paused');
    if (activeSessionView) activeSessionView.classList.remove('active');
    if (appShell) appShell.style.display = 'flex';
    if (breakOverlay) {
      breakOverlay.classList.remove('active');
      breakOverlay.style.display = 'none';
      breakOverlay.style.zIndex = '-1';
    }
  }
}

// ── DAILY RESET TRACKING ──
let lastKnownDate = getLocalDateStr();

function checkAndHandleFocusDataReset() {
  const currentDate = getLocalDateStr();

  if (currentDate !== lastKnownDate) {
    console.log(`[Daily Reset - Focus] Date changed from ${lastKnownDate} to ${currentDate}`);

    const sessions = SessionStore.getSessions();
    const previousDaySessions = sessions.filter(s => s.date.startsWith(lastKnownDate));

    if (previousDaySessions.length > 0) {
      console.log(`[Daily Reset - Focus] Archived ${previousDaySessions.length} sessions from ${lastKnownDate}`);
      const archivedKey = `sm_sessions_archived_${lastKnownDate}`;
      localStorage.setItem(archivedKey, JSON.stringify(previousDaySessions));
    }

    lastKnownDate = currentDate;
    console.log(`[Daily Reset - Focus] Starting fresh day: ${currentDate}`);
  }
}

function showDailyResetNotification(newDate) {
  console.log(`✓ New Day Started! ${newDate}`);
}

// ── INITIALIZATION ──
/**
 * Call during DOMContentLoaded to set up all event listeners and start daily reset checker
 * Pattern: initTimer({ SessionStore, ...other deps })
 */
export function initTimer(dependencies = {}) {
  console.log('[Timer UI] Initializing component...');

  // Start daily reset checker
  setInterval(checkAndHandleFocusDataReset, 60000);
  checkAndHandleFocusDataReset(); // Check immediately on init

  // Setup pause/stop button listeners
  const pauseBtn = document.getElementById('pause-btn');
  const stopBtn = document.getElementById('stop-btn');
  const sessionPauseBtn = document.getElementById('session-pause-btn');
  const timerView = document.getElementById('timer-view');
  const webview = document.getElementById('immersive-browser');

  if (stopBtn) {
    stopBtn.addEventListener('click', endCurrentSession);
  }

  const closeCycleModalBtn = document.getElementById('close-cycle-modal-btn');
  if (closeCycleModalBtn) {
    closeCycleModalBtn.addEventListener('click', () => {
      const modal = document.getElementById('cycle-complete-modal');
      if (modal) modal.classList.remove('active');
      endCurrentSession();
    });
  }

  if (pauseBtn) {
    pauseBtn.dataset.primaryPauseBound = 'true';
    const togglePause = () => {
      SessionState.isPaused = !SessionState.isPaused;
      
      // Update Bubble UI
      if (pauseBtn) pauseBtn.textContent = SessionState.isPaused ? "▶" : "⏸";
      if (timerView) timerView.classList.toggle('paused', SessionState.isPaused);
      
      // Update Session View UI
      if (sessionPauseBtn) {
        sessionPauseBtn.classList.toggle('active', SessionState.isPaused);
        const btnText = sessionPauseBtn.querySelector('.btn-text');
        const btnSub = sessionPauseBtn.querySelector('.btn-subtext');
        if (btnText) btnText.textContent = SessionState.isPaused ? "Resume Session" : "Pause Session";
        if (btnSub) btnSub.textContent = SessionState.isPaused ? "Continue your focus" : "Take a short break";
      }

      if (SessionState.isPaused) {
        window.electronAPI.endFocus();
        if (SessionState.immersiveUrl && webview && webview.src && webview.src !== 'about:blank') {
          pauseAllWebviewContent(webview);
        }
      } else {
        startTimerSequence(SessionState.timeLeft);
      }
    };

    pauseBtn.addEventListener('click', togglePause);
    if (sessionPauseBtn) sessionPauseBtn.addEventListener('click', togglePause);
  }

  const sessionStopBtn = document.getElementById('session-stop-btn');
  if (sessionStopBtn) {
    sessionStopBtn.addEventListener('click', endCurrentSession);
  }

  // Setup key event listeners for break skip (S key)
  const breakOverlay = document.getElementById('break-overlay');

  // Global keydown listener
  window.addEventListener('keydown', (e) => {
    if (!SessionState.breakKeyActive && !SessionState.isStrict) return;
    
    if (e.altKey && (e.key === 'F4' || e.code === 'F4')) return; // Allow Alt+F4 emergency exit

    e.preventDefault();
    e.stopPropagation();
    
    if (e.code === 'KeyS' && SessionState.breakKeyActive) {
      skipBreak();
    }
  }, true);

  // Break overlay keydown listener
  if (breakOverlay) {
    breakOverlay.addEventListener('keydown', (e) => {
      if (e.code === 'KeyS' && SessionState.breakKeyActive) {
        e.preventDefault();
        e.stopPropagation();
        skipBreak();
      }
    }, true);
  }

  // --- SESSION CHECKLIST & SIDEBAR ---
  const sAddTask = document.getElementById('add-session-task-btn');
  const sToggle = document.getElementById('session-sidebar-toggle');
  const sTaskInput = document.getElementById('session-task-input');
  const subTaskList = document.getElementById('sub-task-list');

  if (sAddTask) {
    const addNewTask = () => {
      const task = sTaskInput ? sTaskInput.value.trim() : "";
      if (task) {
        const li = document.createElement('li');
        const check = document.createElement('input');
        check.type = 'checkbox';
        const span = document.createElement('span');
        span.textContent = task;

        // Delete button in bubble popover
        const delBtn = document.createElement('button');
        delBtn.className = 'sub-task-delete-btn';
        delBtn.title = 'Remove';
        delBtn.innerHTML = '&times;';
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          li.remove();
          syncSessionTasks();
        });

        li.appendChild(check);
        li.appendChild(span);
        li.appendChild(delBtn);
        check.addEventListener('change', (ev) => {
          li.style.opacity = ev.target.checked ? 0.4 : 1;
          syncSessionTasks();
        });
        if (subTaskList) subTaskList.appendChild(li);
        syncSessionTasks();
        if (sTaskInput) sTaskInput.value = '';
      }
    };
    sAddTask.addEventListener('click', addNewTask);
    if (sTaskInput) {
      sTaskInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addNewTask();
      });
    }
  }


  if (sToggle) {
    sToggle.addEventListener('click', () => {
      const sidebar = document.getElementById('session-sidebar');
      if (sidebar) sidebar.classList.toggle('hidden');
    });
  }

  // --- FLOATING TIMER DRAG LOGIC ---
  let isDragging = false, xOffset = 0, yOffset = 0, initialX, initialY;
  const dragHandle = document.getElementById('drag-handle');
  if (dragHandle) {
    dragHandle.addEventListener("mousedown", (e) => {
      initialX = e.clientX - xOffset; initialY = e.clientY - yOffset; isDragging = true;
    });
    document.addEventListener("mouseup", () => isDragging = false);
    document.addEventListener("mousemove", (e) => {
      if (isDragging) {
        xOffset = e.clientX - initialX; yOffset = e.clientY - initialY;
        if (timerView) timerView.style.transform = `translate3d(${xOffset}px, ${yOffset}px, 0)`;
      }
    });
  }

  // --- GLOBAL IPC LISTENERS ---
  window.electronAPI.onForceStopSession(() => {
    console.log("[Timer UI] Received force-stop-session");
    endCurrentSession();
  });

  window.electronAPI.onOverlaySessionCommand((action) => {
    if (action === 'toggle-pause') {
      toggleSessionPause();
    }
  });

  window.addEventListener('settings-updated', (e) => {
    const config = e.detail;
    if (SessionState.timerInterval !== null) {
      if (config.showOverlayDuringSession) {
        showSessionOverlay();
      } else {
        hideSessionOverlay();
      }
    }
  });

  // Expose critical functions to window object for legacy HTML onclick handlers
  window.skipBreak = skipBreak;
  window.startTimerSequence = startTimerSequence;
  window.endCurrentSession = endCurrentSession;
  window.toggleSessionPause = toggleSessionPause;
  window.syncSessionTasks = syncSessionTasks;
  window.syncSessionOverlayState = syncSessionOverlayState;
  window.showSessionOverlay = showSessionOverlay;
  window.hideSessionOverlay = hideSessionOverlay;
  window.SessionState = SessionState;
  window.logState = logState;

  console.log('[Timer UI] Component initialized ✓');
}

export { isValidUrl, normalizeStrictUrl };
