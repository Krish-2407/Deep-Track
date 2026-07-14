const { app, BrowserWindow, ipcMain, session, powerSaveBlocker, Tray, Menu, nativeImage, shell } = require('electron');
const path = require('path');
const { fileURLToPath } = require('url');
const { autoUpdater } = require('electron-updater');

// Advanced, Robust Auto-Updater Configuration
if (app.isPackaged) {
  console.log = () => {};
  console.warn = () => {};
}
let updaterLogPath = null;
const logUpdater = (msg) => {
  const line = `[${new Date().toISOString()}] ${msg}\r\n`;
  console.log(line.trim());
  try {
    if (!updaterLogPath) {
      updaterLogPath = path.join(app.getPath('userData'), 'updater.log');
    }
    fs.appendFileSync(updaterLogPath, line);
  } catch (e) {
    // dynamic path retrieval failsafe
  }
};

autoUpdater.autoDownload = true;
autoUpdater.allowPrerelease = false;
autoUpdater.verifyUpdateCodeSignature = false;

// Configure custom logger for electron-updater
autoUpdater.logger = {
  info: (msg) => logUpdater(`[INFO] ${msg}`),
  warn: (msg) => logUpdater(`[WARN] ${msg}`),
  error: (msg) => logUpdater(`[ERROR] ${msg}`),
  debug: (msg) => logUpdater(`[DEBUG] ${msg}`)
};

autoUpdater.on('checking-for-update', () => {
  logUpdater('Checking for updates...');
});

autoUpdater.on('update-available', (info) => {
  logUpdater(`Update available: version ${info.version}. Downloading automatically...`);
});

autoUpdater.on('update-not-available', (info) => {
  logUpdater(`Update not available. Current version is up to date.`);
});

autoUpdater.on('error', (err) => {
  logUpdater(`Auto-updater error: ${err.stack || err}`);
});

autoUpdater.on('download-progress', (progressObj) => {
  logUpdater(`Download progress: ${progressObj.percent.toFixed(2)}% (${progressObj.transferred}/${progressObj.total} bytes, speed: ${progressObj.bytesPerSecond} B/s)`);
});

autoUpdater.on('update-downloaded', (info) => {
  logUpdater(`Update downloaded successfully: version ${info.version}`);
  
  // Prompt the user via a high-priority native dialog
  const { dialog } = require('electron');
  dialog.showMessageBox({
    type: 'info',
    title: 'Deep Track Update Ready',
    message: `A new version of Deep Track (${info.version}) has been downloaded and is ready to install!`,
    detail: 'Would you like to restart and apply the update now?',
    buttons: ['Restart and Update', 'Later'],
    defaultId: 0,
    cancelId: 1,
    noLink: true
  }).then((result) => {
    if (result.response === 0) {
      logUpdater('User initiated "Restart and Update". Enforcing graceful exit...');
      isQuitting = true; // bypass any window/tray closing cancellation locks
      
      // Clean up overlay and locks
      try {
        hideSessionOverlay();
        releaseFocusLock();
        flushScreenTime();
        toggleNotifications(true);
      } catch (e) {
        logUpdater(`Cleanup error before updater quit: ${e.message}`);
      }
      
      autoUpdater.quitAndInstall();
    } else {
      logUpdater('User chose to install update later.');
    }
  });
});

// Enable hot reloading in development
if (!app.isPackaged) {
  try {
  require('electron-reloader')(module);
  } catch (_) {}
}

const { ElectronBlocker } = require('@ghostery/adblocker-electron');
const fetch = require('cross-fetch');
// active-win is ESM-only in version 8+, we use dynamic import inside the tracking loop

const { exec, execFile } = require('child_process');
const fs = require('fs');
const loudness = require('loudness');

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  try {
    const logPath = path.join(app.getPath('userData'), 'crash.log');
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] Uncaught Exception: ${err.stack}\n`);
    const { dialog } = require('electron');
    dialog.showErrorBox('Deep Track Startup Error', `The application crashed during startup.\n\nError: ${err.message}\n\nLog saved to: ${logPath}`);
  } catch (e) {}
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  try {
    const logPath = path.join(app.getPath('userData'), 'crash.log');
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] Unhandled Rejection: ${reason}\n`);
  } catch (e) {}
});

// Single Instance Lock & Cache Fixes
// NOTE: Both the dev (npm start) and installed app share the same userData folder ("Deep Track").
// This means your real session data is available during development.
// IMPORTANT: You must close the background Desktop App before running 'npm start', otherwise
// the app will refuse to open (second instance is blocked by this lock).
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  } else {
    createWindow();
  }
});

// GPU Acceleration Strategy:
// The app uses 38+ backdrop-filter blur effects and glassmorphism throughout the UI.
// Running those on the CPU causes severe animation lag and frame drops.
// Only disable GPU acceleration if an explicit environment flag is set (for debugging GPU crashes).
if (process.env.DEEPTRACK_DISABLE_GPU === '1') {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
} else {
  // Enable GPU compositing optimizations for smooth blur/glass effects
  app.commandLine.appendSwitch('enable-gpu-rasterization');
  app.commandLine.appendSwitch('enable-zero-copy');
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
}

let mainWindow;
let overlayWindow;
let latestOverlayState = { active: false };
let isQuitting = false;
let closeToTray = false;
let blockerId = null;
let trackingEngineStarted = false;

const OVERLAY_COLLAPSED_SIZE = { width: 58, height: 58 };
const OVERLAY_EXPANDED_SIZE = { width: 292, height: 200 };

function isSafeExternalUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return ['http:', 'https:', 'mailto:'].includes(parsed.protocol);
  } catch (err) {
    return false;
  }
}

function openExternalUrl(rawUrl) {
  if (!isSafeExternalUrl(rawUrl)) return false;
  shell.openExternal(rawUrl);
  return true;
}

function isSafeAppFileUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'file:') return false;

    const resolvedPath = path.resolve(fileURLToPath(parsed));
    const appRoot = path.resolve(__dirname, '..', '..');
    return resolvedPath === appRoot || resolvedPath.startsWith(`${appRoot}${path.sep}`);
  } catch (err) {
    return false;
  }
}

function guardMainWindowNavigation(contents) {
  const handleNavigation = (event, targetUrl) => {
    if (isSafeAppFileUrl(targetUrl)) return;

    event.preventDefault();
    openExternalUrl(targetUrl);
  };

  contents.on('will-navigate', handleNavigation);
  contents.on('will-redirect', handleNavigation);
  contents.setWindowOpenHandler((details) => {
    openExternalUrl(details.url);
    return { action: 'deny' };
  });
}

function getOverlayBounds(size = OVERLAY_COLLAPSED_SIZE) {
  const { screen } = require('electron');
  const display = screen.getPrimaryDisplay();
  const workArea = display.workArea;

  return {
    width: size.width,
    height: size.height,
    x: workArea.x + workArea.width - size.width - 24,
    y: workArea.y + workArea.height - size.height - 88
  };
}

function createOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) return overlayWindow;

  overlayWindow = new BrowserWindow({
    ...getOverlayBounds(),
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    show: false,
    skipTaskbar: true,
    focusable: false,
    alwaysOnTop: true,
    hasShadow: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '..', 'preload', 'preload.js')
    }
  });

  overlayWindow.loadFile(path.join(__dirname, '..', 'renderer', 'overlay.html'));
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.webContents.on('did-finish-load', () => {
    sendOverlayState(latestOverlayState);
  });

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });

  return overlayWindow;
}

function showSessionOverlay() {
  const overlay = createOverlayWindow();
  if (overlay.isDestroyed()) return;

  overlay.setBounds(getOverlayBounds(OVERLAY_COLLAPSED_SIZE));
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlay.showInactive();
}

function hideSessionOverlay() {
  latestOverlayState = { active: false };
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  overlayWindow.webContents.send('overlay-session-state', { active: false });
  overlayWindow.hide();
  overlayWindow.setBounds(getOverlayBounds(OVERLAY_COLLAPSED_SIZE));
}

function sendOverlayState(state) {
  latestOverlayState = state || { active: false };
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  overlayWindow.webContents.send('overlay-session-state', latestOverlayState);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 900,
    minHeight: 650,
    maximizable: true,
    fullscreenable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      webviewTag: true,
      devTools: !app.isPackaged
    },
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', '..', 'assets', 'logo image 2.png')
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  guardMainWindowNavigation(mainWindow.webContents);
  
  mainWindow.on('close', (event) => {
    if (!isQuitting && closeToTray) {
      event.preventDefault();
      mainWindow.hide();
    } else if (!isQuitting) {
      event.preventDefault();
      isQuitting = true;
      app.quit();
    } else if (strictModeActive) {
      releaseFocusLock();
    }
  });
  
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  
  // Adblocker
  ElectronBlocker.fromPrebuiltAdsAndTracking(fetch).then((blocker) => {
    if (session.defaultSession.registerPreloadScript) {
      blocker.enableBlockingInSession(session.defaultSession);
    } else {
      // Fallback: The static blacklist below handles basic blocking
      console.log('Using basic ad-blocking fallback.');
    }
  }).catch(err => console.error('Blocker error:', err.message));

  // Static Blacklist Fallback (Enhanced)
  const adDomains = [
    "*://*.doubleclick.net/*", 
    "*://*.googleadservices.com/*", 
    "*://*.googlesyndication.com/*",
    "*://*.moatads.com/*",
    "*://*.adservice.google.com/*",
    "*://*.ytimg.com/yts/jsbin/ads/*"
  ];
  session.defaultSession.webRequest.onBeforeRequest({ urls: adDomains }, (details, callback) => callback({ cancel: true }));

  // BUG-03 FIX: start tracking engine only once, from createWindow
  if (!trackingEngineStarted) {
    trackingEngineStarted = true;
    startTrackingEngine();
  }
}


let tray = null;

// BUG-13 FIX: dataPath deferred — app.getPath() must be called after app is ready
let dataPath;
let screenTimeData = {};
const TRACK_INTERVAL_MS = 2000;
const TRACK_INCREMENT_SECONDS = TRACK_INTERVAL_MS / 1000;
const TRACK_WARNING_INTERVAL_MS = 30000;
const unsafeObjectKeys = new Set(['__proto__', 'constructor', 'prototype']);
const trackingWarnings = new Map();
let activeDetectorName = null;

function readScreenTimeFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;

  try {
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    if (!raw) return {};

    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch (e) {
    console.warn(`[Main] Failed to read screen time data from ${filePath}:`, e.message);
  }

  return null;
}

function loadLegacyScreenTimeData() {
  const appDataDir = app.getPath('appData');
  const currentPath = path.resolve(dataPath || '');
  const candidates = ['deep-track', 'Deep Track', 'screen-monitor']
    .map((dir) => path.join(appDataDir, dir, 'screentime.json'))
    .filter((filePath) => path.resolve(filePath) !== currentPath)
    .filter((filePath) => fs.existsSync(filePath))
    .map((filePath) => ({
      filePath,
      mtimeMs: fs.statSync(filePath).mtimeMs
    }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  for (const candidate of candidates) {
    const data = readScreenTimeFile(candidate.filePath);
    if (data) {
      console.log(`[Main] Migrated screen time data from ${candidate.filePath}`);
      return data;
    }
  }

  return null;
}

function initDataPath() {
  dataPath = path.join(app.getPath('userData'), 'screentime.json');
  const backupPath = dataPath + '.bak';
  let currentData = readScreenTimeFile(dataPath);

  // If main file exists but is corrupted (readScreenTimeFile returned null)
  if (currentData === null && fs.existsSync(dataPath)) {
    console.warn('[Main] Main screen time file is corrupt. Attempting backup recovery...');
    const backupData = readScreenTimeFile(backupPath);
    if (backupData && Object.keys(backupData).length > 0) {
      console.log('[Main] Successfully recovered screen time data from backup.');
      currentData = backupData;
      // Copy healthy backup to main path immediately
      try {
        fs.copyFileSync(backupPath, dataPath);
      } catch (copyErr) {
        console.error('[Main] Failed to restore backup file to main path:', copyErr.message);
      }
    } else {
      console.error('[Main] Backup file is also corrupt or missing. Creating a copy of corrupt file to prevent total loss...');
      try {
        const corruptDest = dataPath + `.corrupt_${Date.now()}`;
        fs.copyFileSync(dataPath, corruptDest);
        console.log(`[Main] Corrupt file backed up to ${corruptDest}`);
      } catch (backupErr) {
        console.error('[Main] Failed to create corrupt file copy:', backupErr.message);
      }
    }
  }

  if (currentData && Object.keys(currentData).length > 0) {
    screenTimeData = currentData;
    return;
  }

  const legacyData = loadLegacyScreenTimeData();
  if (legacyData && Object.keys(legacyData).length > 0) {
    screenTimeData = legacyData;
    flushScreenTime();
    return;
  }

  screenTimeData = currentData || {};
}

function flushScreenTime() {
  try {
    if (dataPath && screenTimeData) {
      // 1. Back up existing healthy file (if any) before writing new data
      if (fs.existsSync(dataPath)) {
        try {
          const currentRaw = fs.readFileSync(dataPath, 'utf8').trim();
          if (currentRaw) {
            JSON.parse(currentRaw); // Verify it is valid JSON before backing up
            fs.copyFileSync(dataPath, dataPath + '.bak');
          }
        } catch (backupErr) {
          console.warn('[Main] Existing file on disk is corrupt or invalid JSON; skipping backup overwrite to preserve last known good backup.');
        }
      }

      // 2. Perform atomic write using a temp file to prevent corruption from crashes/power cuts
      const tempPath = dataPath + '.tmp';
      fs.writeFileSync(tempPath, JSON.stringify(screenTimeData, null, 2));
      fs.renameSync(tempPath, dataPath);
    }
  } catch (e) {
    console.error('[Main] Failed to flush screen time data:', e.message);
  }
}

// BUG-14 FIX: use local date, not UTC (prevents wrong-day logging for IST +5:30)
function getLocalDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}



let lastKnownDate = getLocalDateStr(); // Track date for midnight detection

function checkAndHandleDailyReset() {
  const currentDate = getLocalDateStr();
  
  if (currentDate !== lastKnownDate) {
    // Midnight has passed - new day detected
    const previousDate = lastKnownDate; // capture BEFORE updating
    console.log(`[Daily Reset] Date changed from ${previousDate} to ${currentDate}`);
    console.log(`[Daily Reset] Previous day data (${previousDate}) saved and archived`);
    
    // Flush current data to disk before switching
    flushScreenTime();
    
    // Update tracked date
    lastKnownDate = currentDate;
    
    // Initialize new day if not exists
    if (!screenTimeData[currentDate]) {
      screenTimeData[currentDate] = {};
    }
    
    // Notify renderer about daily reset
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('daily-reset', { newDate: currentDate, previousDate });
    }
    
    console.log(`[Daily Reset] Starting fresh tracking for ${currentDate}`);
  }
}

async function startTrackingEngine() {
  // Check for daily reset every minute
  setInterval(checkAndHandleDailyReset, 60000);
  // Periodically flush screen time data to disk (every 30 seconds) to prevent excessive write churn
  setInterval(flushScreenTime, 30000);

  const detectors = await createActiveWindowDetectors();
  if (detectors.length === 0) {
    console.error('[Tracking Engine] FATAL: No active window detector is available.');
    const logPath = path.join(app.getPath('userData'), 'crash.log');
    fs.appendFileSync(logPath, '[Tracking Engine] FATAL: No active window detector is available.\n');
    return;
  }

  setInterval(async () => {
    try {
      const window = await getActiveWindowSnapshot(detectors);

      if (window) {
        const owner = window.owner;
        const title = window.title || "Unknown";
        const today = getLocalDateStr();
        const hour = String(new Date().getHours()).padStart(2, '0');
        
        if (!screenTimeData[today]) screenTimeData[today] = {};
        
        // Store total by app - Use safe assignment to avoid prototype pollution
        if (!unsafeObjectKeys.has(owner)) {
          screenTimeData[today][owner] = (screenTimeData[today][owner] || 0) + TRACK_INCREMENT_SECONDS;

          // Store hourly breakdown
          if (!screenTimeData[today][hour]) screenTimeData[today][hour] = {};
          screenTimeData[today][hour][owner] = (screenTimeData[today][hour][owner] || 0) + TRACK_INCREMENT_SECONDS;
        }

        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('active-window', { owner, title });
          // Only send today's delta payload to improve performance and prevent memory size degradation
          mainWindow.webContents.send('screen-time-data', { [today]: screenTimeData[today] });
        }
      }
    } catch (e) {
      console.error('[Tracking Engine Loop Error]:', e);
    }
  }, TRACK_INTERVAL_MS);
}

async function createActiveWindowDetectors() {
  const detectors = [];

  try {
    const aw = await import('active-win');
    const activeWindowFn = aw.activeWindow || aw.default || aw['module.exports'];
    if (typeof activeWindowFn === 'function') {
      detectors.push({ name: 'active-win', getWindow: activeWindowFn });
      console.log('[Tracking Engine] active-win detector registered');
    } else {
      warnTracking('active-win-function', '[Tracking Engine] active-win loaded, but no callable detector was exported.');
    }
  } catch (err) {
    warnTracking('active-win-load', '[Tracking Engine] active-win could not be loaded; using fallback if available.', err);
  }

  if (process.platform === 'win32') {
    detectors.push({ name: 'powershell-win32', getWindow: getActiveWindowViaPowerShell });
    console.log('[Tracking Engine] Windows fallback detector registered');
  }

  return detectors;
}

async function getActiveWindowSnapshot(detectors) {
  for (const detector of detectors) {
    try {
      const rawWindow = await detector.getWindow();
      const normalized = normalizeActiveWindow(rawWindow);
      if (normalized) {
        if (activeDetectorName !== detector.name) {
          activeDetectorName = detector.name;
          console.log(`[Tracking Engine] Active window detector: ${detector.name}`);
        }
        return normalized;
      }

      warnTracking(`${detector.name}-empty`, `[Tracking Engine] ${detector.name} returned no active window.`);
    } catch (err) {
      warnTracking(`${detector.name}-error`, `[Tracking Engine] ${detector.name} failed.`, err);
    }
  }

  return null;
}

function normalizeActiveWindow(rawWindow) {
  if (!rawWindow || typeof rawWindow !== 'object') return null;

  const ownerValue = typeof rawWindow.owner === 'string'
    ? rawWindow.owner
    : rawWindow.owner?.name;
  const owner = String(ownerValue || '').trim();

  if (!owner || unsafeObjectKeys.has(owner)) return null;

  return {
    owner,
    title: String(rawWindow.title || 'Unknown')
  };
}

function warnTracking(key, message, err) {
  const now = Date.now();
  const lastWarnedAt = trackingWarnings.get(key) || 0;
  if (now - lastWarnedAt < TRACK_WARNING_INTERVAL_MS) return;

  trackingWarnings.set(key, now);
  if (err) {
    console.warn(message, err.message || err);
  } else {
    console.warn(message);
  }
}

function getActiveWindowViaPowerShell() {
  const script = `
    $ErrorActionPreference = 'Stop'
    Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class ActiveWindowReader {
  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();

  [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
"@
    $hwnd = [ActiveWindowReader]::GetForegroundWindow()
    if ($hwnd -eq [IntPtr]::Zero) {
      '{}' | Write-Output
      exit 0
    }

    $titleBuilder = New-Object System.Text.StringBuilder 1024
    [void][ActiveWindowReader]::GetWindowText($hwnd, $titleBuilder, $titleBuilder.Capacity)

    [uint32]$processId = 0
    [void][ActiveWindowReader]::GetWindowThreadProcessId($hwnd, [ref]$processId)

    $proc = Get-Process -Id $processId -ErrorAction SilentlyContinue
    $name = $null
    if ($proc) {
      try { $name = $proc.MainModule.FileVersionInfo.FileDescription } catch {}
      if ([string]::IsNullOrWhiteSpace($name)) { $name = $proc.ProcessName }
    }

    if ([string]::IsNullOrWhiteSpace($name)) { $name = 'Unknown' }

    [pscustomobject]@{
      owner = @{ name = $name }
      title = $titleBuilder.ToString()
      platform = 'windows'
      processId = $processId
    } | ConvertTo-Json -Compress -Depth 3
  `;

  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { timeout: 5000, windowsHide: true },
      (err, stdout) => {
        if (err) {
          reject(err);
          return;
        }

        try {
          resolve(JSON.parse((stdout || '{}').trim() || '{}'));
        } catch (parseErr) {
          reject(parseErr);
        }
      }
    );
  });
}



// BUG-1 FIX: registered once at module level
ipcMain.handle('get-screen-time', () => screenTimeData);

// BUG-2 FIX: flush data and reset registry before quit
app.on('before-quit', () => {
  isQuitting = true; // Mark that we are intentionally shutting down
  hideSessionOverlay();
  releaseFocusLock();
  flushScreenTime();
  toggleNotifications(true); // Failsafe restore on quit
});

app.whenReady().then(() => {
  // Check if the application was partially deleted/uninstalled (files missing)
  const essentialPaths = [
    path.join(__dirname, '..', 'renderer', 'index.html'),
    path.join(__dirname, '..', 'preload', 'preload.js'),
    path.join(__dirname, '..', 'renderer', 'renderer.js')
  ];
  const isPartiallyDeleted = essentialPaths.some(filePath => {
    try {
      return !fs.existsSync(filePath);
    } catch (e) {
      return true;
    }
  });

  if (isPartiallyDeleted) {
    try {
      app.setLoginItemSettings({ openAtLogin: false });
    } catch (e) {}
    app.exit(0);
    return;
  }

  // Check for updates on startup
  autoUpdater.checkForUpdatesAndNotify();

  // Periodically check for updates in the background every 2 hours (while running as a ghost app)
  setInterval(() => {
    try {
      logUpdater('Triggering scheduled background update check...');
      autoUpdater.checkForUpdatesAndNotify();
    } catch (e) {
      logUpdater(`Scheduled background check failed: ${e.message}`);
    }
  }, 2 * 60 * 60 * 1000); // 2 hours in milliseconds

  // BUG-13 FIX: initialize data path now that app is ready
  initDataPath();
  
  // Failsafe: Reset notifications in case of previous crash
  toggleNotifications(true);
  
  // Disable the default application menu to remove "View > Toggle Developer Tools"
  Menu.setApplicationMenu(null);
  
  createWindow();

  // Auto-launch OS integration
  ipcMain.on('update-startup-setting', (event, launchOnStartup) => {
    try {
      app.setLoginItemSettings({ 
        openAtLogin: !!launchOnStartup,
        path: app.getPath('exe')
      });
      console.log(`[Startup Settings] openAtLogin successfully set to: ${launchOnStartup}`);
    } catch (err) {
      console.error('[Startup Settings Error]:', err);
    }
  });

  ipcMain.on('update-close-setting', (event, val) => {
    closeToTray = !!val;
    console.log(`[Close Settings] closeToTray successfully set to: ${closeToTray}`);
  });

  ipcMain.handle('wipe-screen-time', () => {
    try {
      screenTimeData = {};
      if (dataPath) {
        fs.writeFileSync(dataPath, JSON.stringify({}, null, 2));
        console.log('[Main] Screentime data wiped successfully');
        return true;
      }
    } catch (err) {
      console.error('[Main] Failed to wipe screentime data:', err);
    }
    return false;
  });

  // System Tray (BUG-6 FIX: nativeImage from top-level require)
  const iconPath = path.join(__dirname, '..', '..', 'assets', 'logo image 2.png');
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon);
  tray.setToolTip('Deep Track - Focus & Screen Time Monitor');
  
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open Deep Track', click: () => { if (mainWindow) mainWindow.show(); else createWindow(); } },
    // BUG-9 FIX: use app.quit() so before-quit events fire (app.exit skips them)
    { label: 'Quit', click: () => { app.quit(); } }
  ]);
  tray.setContextMenu(contextMenu);
  
  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.show();
    } else {
      createWindow();
    }
  });

  // STRICT-4 FIX: Block new windows from webviews using modern API
  app.on('web-contents-created', (event, contents) => {
    // Harden webview attachment to restrict privileges
    contents.on('will-attach-webview', (webviewEvent, webPreferences, params) => {
      // Strip node integration and enforce isolation
      webPreferences.nodeIntegration = false;
      webPreferences.contextIsolation = true;
      webPreferences.nodeIntegrationInSubFrames = false;
      webPreferences.nodeIntegrationInWorker = false;
      
      // Prevent devTools unless in development mode
      webPreferences.devTools = !app.isPackaged;
      
      // Strip potentially insecure preload scripts if defined
      delete webPreferences.preload;
      delete webPreferences.preloadURL;
      
      console.log('[Security] Hardened webview preferences on attachment');
    });

    // Immersion Guard: Block DevTools shortcuts (Ctrl+Shift+I, F12) globally
    contents.on('before-input-event', (e, input) => {
      if ((input.control && input.shift && input.key.toLowerCase() === 'i') || input.key === 'F12') {
        e.preventDefault();
      }
    });

    if (contents.getType() === 'webview') {
      contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    }
  });
});

app.on('window-all-closed', () => {
  // Do nothing. Keep running in tray.
});

// GLOBAL FOCUS ENGINE (Notifications & Power)
const toggleNotifications = (enable) => {
  const value = enable ? 1 : 0;
  // SECURITY-02: Strict integer validation to prevent PowerShell injection
  const safeVal = Number.isInteger(value) && (value === 0 || value === 1) ? value : 1;
  
  // Comprehensive Notification Blackout Engine (Visuals + Tones)
  let script = '';
  if (safeVal === 0) {
    // MUTE: Save sound settings to backup key, then clear notification sound paths
    script = `
      $val = 0;
      Set-ItemProperty -Path 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\PushNotifications' -Name 'ToastEnabled' -Value $val -Type DWord -Force;
      Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings' -Name 'NOC_GLOBAL_SETTING_TOASTS_ENABLED' -Value $val -Type DWord -Force;
      Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings' -Name 'NOC_GLOBAL_SETTING_ALLOW_TOASTS_WITH_AUDIO' -Value $val -Type DWord -Force;
      Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings' -Name 'NOC_GLOBAL_SETTING_ALLOW_TOASTS_ABOVE_LOCK' -Value $val -Type DWord -Force;

      # Mute Sound Scheme: Back up the current scheme and set to .None
      $schemesPath = 'HKCU:\\AppEvents\\Schemes';
      $currentScheme = (Get-ItemProperty -Path $schemesPath -Name '(default)' -ErrorAction SilentlyContinue).'(default)';
      if ($currentScheme -ne '.None' -and $currentScheme -ne $null) {
        New-Item -Path 'HKCU:\\Software\\DeepTrack\\BackupSounds' -Force -ErrorAction SilentlyContinue | Out-Null;
        Set-ItemProperty -Path 'HKCU:\\Software\\DeepTrack\\BackupSounds' -Name 'ActiveScheme' -Value $currentScheme -Force;
      }
      Set-ItemProperty -Path $schemesPath -Name '(default)' -Value '.None' -Force;

      $paths = @('Notification.Default','Notification.IM','Notification.Mail','Notification.SMS','Notification.Looping.Alarm','Notification.Looping.Alarm2','Notification.Looping.Alarm3','Notification.Looping.Alarm4','Notification.Looping.Alarm5','Notification.Looping.Alarm6','Notification.Looping.Alarm7','Notification.Looping.Alarm8','Notification.Looping.Alarm9','Notification.Looping.Alarm10','Notification.Looping.Call','Notification.Looping.Call2','Notification.Looping.Call3','Notification.Looping.Call4','Notification.Looping.Call5','Notification.Looping.Call6','Notification.Looping.Call7','Notification.Looping.Call8','Notification.Looping.Call9','Notification.Looping.Call10');
      New-Item -Path 'HKCU:\\Software\\DeepTrack\\BackupSounds' -Force -ErrorAction SilentlyContinue | Out-Null;
      foreach ($p in $paths) {
        $regPath = "HKCU:\\AppEvents\\Schemes\\Apps\\.Default\\$p\\.Current";
        if (Test-Path $regPath) {
          $v = (Get-ItemProperty -Path $regPath -Name '(default)' -ErrorAction SilentlyContinue).'(default)';
          if ($v -ne $null) {
            Set-ItemProperty -Path 'HKCU:\\Software\\DeepTrack\\BackupSounds' -Name $p -Value $v -Force;
            Set-ItemProperty -Path $regPath -Name '(default)' -Value '' -Force;
          }
        }
      }
    `;
  } else {
    // RESTORE: Restore original sound settings from backup key, then delete backup key
    script = `
      $val = 1;
      Set-ItemProperty -Path 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\PushNotifications' -Name 'ToastEnabled' -Value $val -Type DWord -Force;
      Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings' -Name 'NOC_GLOBAL_SETTING_TOASTS_ENABLED' -Value $val -Type DWord -Force;
      Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings' -Name 'NOC_GLOBAL_SETTING_ALLOW_TOASTS_WITH_AUDIO' -Value $val -Type DWord -Force;
      Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings' -Name 'NOC_GLOBAL_SETTING_ALLOW_TOASTS_ABOVE_LOCK' -Value $val -Type DWord -Force;

      # Restore Sound Scheme
      $schemesPath = 'HKCU:\\AppEvents\\Schemes';
      if (Test-Path 'HKCU:\\Software\\DeepTrack\\BackupSounds') {
        $savedScheme = (Get-ItemProperty -Path 'HKCU:\\Software\\DeepTrack\\BackupSounds' -Name 'ActiveScheme' -ErrorAction SilentlyContinue).ActiveScheme;
        if ($savedScheme -ne $null) {
          Set-ItemProperty -Path $schemesPath -Name '(default)' -Value $savedScheme -Force;
        } else {
          Set-ItemProperty -Path $schemesPath -Name '(default)' -Value '.Default' -Force;
        }
      } else {
        Set-ItemProperty -Path $schemesPath -Name '(default)' -Value '.Default' -Force;
      }

      $paths = @('Notification.Default','Notification.IM','Notification.Mail','Notification.SMS','Notification.Looping.Alarm','Notification.Looping.Alarm2','Notification.Looping.Alarm3','Notification.Looping.Alarm4','Notification.Looping.Alarm5','Notification.Looping.Alarm6','Notification.Looping.Alarm7','Notification.Looping.Alarm8','Notification.Looping.Alarm9','Notification.Looping.Alarm10','Notification.Looping.Call','Notification.Looping.Call2','Notification.Looping.Call3','Notification.Looping.Call4','Notification.Looping.Call5','Notification.Looping.Call6','Notification.Looping.Call7','Notification.Looping.Call8','Notification.Looping.Call9','Notification.Looping.Call10');
      if (Test-Path 'HKCU:\\Software\\DeepTrack\\BackupSounds') {
        foreach ($p in $paths) {
          $bv = (Get-ItemProperty -Path 'HKCU:\\Software\\DeepTrack\\BackupSounds' -Name $p -ErrorAction SilentlyContinue)."$p";
          if ($bv -ne $null) {
            $regPath = "HKCU:\\AppEvents\\Schemes\\Apps\\.Default\\$p\\.Current";
            if (Test-Path $regPath) {
              Set-ItemProperty -Path $regPath -Name '(default)' -Value $bv -Force;
            }
          }
        }
        Remove-Item -Path 'HKCU:\\Software\\DeepTrack\\BackupSounds' -Recurse -Force -ErrorAction SilentlyContinue | Out-Null;
      }
    `;
  }
  
  const tempScriptPath = path.join(
    app.getPath('temp'),
    `deepwork-toggle-notifications-${safeVal}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.ps1`
  );
  try {
    fs.writeFileSync(tempScriptPath, script, 'utf8');
    execFile('powershell.exe', [
      '-ExecutionPolicy', 'Bypass',
      '-NoProfile',
      '-NonInteractive',
      '-File', tempScriptPath
    ], { windowsHide: true }, (err) => {
      if (err) console.error('Notification toggle PowerShell execution error:', err);
      try {
        fs.unlinkSync(tempScriptPath);
      } catch (e) {}
    });
  } catch (err) {
    console.error('Failed to execute notification toggle script:', err);
  }
};

ipcMain.on('start-global-focus', () => {
  toggleNotifications(false);
  if (blockerId === null) {
    blockerId = powerSaveBlocker.start('prevent-app-suspension');
  }
});

ipcMain.on('end-global-focus', () => {
  toggleNotifications(true);
  if (blockerId !== null) {
    powerSaveBlocker.stop(blockerId);
    blockerId = null;
  }
});

let strictModeActive = false;

function releaseFocusLock() {
  strictModeActive = false;

  if (!mainWindow) return;

  mainWindow.removeListener('blur', enforceLockdown);
  mainWindow.removeListener('minimize', enforceLockdown);
  mainWindow.removeListener('hide', enforceLockdown);

  mainWindow.setAlwaysOnTop(false);
  mainWindow.setVisibleOnAllWorkspaces(false);
  mainWindow.setFullScreen(false);
  // Restore window to normal compact size after exiting strict fullscreen
  mainWindow.once('leave-full-screen', () => {
    if (mainWindow) mainWindow.setSize(1100, 800, true);
  });
}

// FORCEFUL FOCUS RECLAMATION (Blocks swipes/minimizing)
function enforceLockdown() {
  if (strictModeActive && mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    // Re-enforce always-on-top in case a gesture stripped it
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
  }
}

ipcMain.on('start-focus', () => {
  if (mainWindow) {
    // BUG-5 FIX: remove before re-adding to prevent duplicate listeners
    mainWindow.removeListener('blur', enforceLockdown);
    mainWindow.removeListener('minimize', enforceLockdown);
    mainWindow.removeListener('hide', enforceLockdown);
    strictModeActive = true;
    mainWindow.setFullScreen(true);
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    mainWindow.on('blur', enforceLockdown);
    mainWindow.on('minimize', enforceLockdown);
    mainWindow.on('hide', enforceLockdown);
  }
});

ipcMain.on('end-focus', () => {
  releaseFocusLock();
});

ipcMain.on('start-break', () => {
  if (mainWindow) {
    mainWindow.setFullScreen(true);
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    mainWindow.focus(); // Capture keyboard focus
  }
});

ipcMain.on('end-break', () => {
  if (mainWindow) {
    mainWindow.setFullScreen(false);
    mainWindow.setAlwaysOnTop(false);
    
    // Allow sleep after break (if focus is also ended)
    // Note: Usually start-focus will re-trigger it if focus follows break
  }
});

// (Dead handlers removed: set-bubble-mode, timer-sync)

ipcMain.on('hide-break', () => {
  if (mainWindow) {
    mainWindow.setFullScreen(false);
    mainWindow.setAlwaysOnTop(false);
  }
});

// (Dead handler removed: window-drag)

ipcMain.on('show-session-overlay', () => {
  showSessionOverlay();
});

ipcMain.on('hide-session-overlay', () => {
  hideSessionOverlay();
});

ipcMain.on('session-state-update', (event, state) => {
  sendOverlayState(state);
});

ipcMain.on('overlay-session-command', (event, action) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('overlay-session-command', action);
});

ipcMain.on('overlay-media-command', (event, action) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('overlay-media-command', action);
});

ipcMain.on('set-overlay-expanded', (event, expanded) => {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;

  const currentBounds = overlayWindow.getBounds();
  const nextSize = expanded ? OVERLAY_EXPANDED_SIZE : OVERLAY_COLLAPSED_SIZE;
  const rightEdge = currentBounds.x + currentBounds.width;
  const { screen } = require('electron');
  const bounds = screen.getDisplayMatching(currentBounds).bounds;
  const nextX = Math.min(
    Math.max(rightEdge - nextSize.width, bounds.x),
    bounds.x + bounds.width - nextSize.width
  );
  const nextY = Math.min(
    Math.max(currentBounds.y, bounds.y),
    bounds.y + bounds.height - nextSize.height
  );
  overlayWindow.setBounds({
    x: nextX,
    y: nextY,
    width: nextSize.width,
    height: nextSize.height
  });
});

ipcMain.on('move-overlay-by', (event, delta) => {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  if (!delta || !Number.isFinite(delta.x) || !Number.isFinite(delta.y)) return;

  const currentBounds = overlayWindow.getBounds();
  const { screen } = require('electron');
  const bounds = screen.getDisplayMatching(currentBounds).bounds;
  const nextX = Math.min(
    Math.max(currentBounds.x + delta.x, bounds.x),
    bounds.x + bounds.width - currentBounds.width
  );
  const nextY = Math.min(
    Math.max(currentBounds.y + delta.y, bounds.y),
    bounds.y + bounds.height - currentBounds.height
  );
  overlayWindow.setPosition(
    Math.round(nextX),
    Math.round(nextY)
  );
});

// UNIVERSAL MEDIA CONTROL ENGINE
ipcMain.on('media-control', (event, action) => {
  if (!['play', 'next', 'prev'].includes(action)) return;

  const exePath = require('path').join(__dirname, 'bin', 'media-control.exe').replace('app.asar', 'app.asar.unpacked');

  // Map action to Windows virtual key codes for SendKeys fallback
  const vkMap = { play: '{MediaPlayPause}', next: '{MediaNextTrack}', prev: '{MediaPreviousTrack}' };

  execFile(exePath, [action], (err) => {
    if (err) {
      console.warn('[Media] media-control.exe failed, using SendKeys fallback:', err.message);
      // PowerShell WScript.Shell SendKeys fallback — sends real media key strokes
      const psScript = `(New-Object -ComObject WScript.Shell).SendKeys('${vkMap[action]}')`;
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript],
        { windowsHide: true },
        (psErr) => { if (psErr) console.error('[Media] SendKeys fallback failed:', psErr.message); }
      );
    }
  });
});

ipcMain.handle('get-media-metadata', async () => {
  return new Promise((resolve) => {
    const scriptPath = require('path').join(__dirname, 'bin', 'media-helper.ps1').replace('app.asar', 'app.asar.unpacked');
    execFile('powershell.exe', [
      '-ExecutionPolicy', 'Bypass',
      '-NoProfile',
      '-NonInteractive',
      '-File', scriptPath,
      'metadata'
    ], { windowsHide: true }, (err, stdout) => {
      try {
        resolve(JSON.parse(stdout || '{}'));
      } catch (e) {
        resolve({});
      }
    });
  });
});

ipcMain.handle('open-external-url', (event, rawUrl) => openExternalUrl(rawUrl));
ipcMain.handle('get-version', () => app.getVersion());

ipcMain.on('set-volume', async (event, level) => {
  if (typeof level === 'number' && level >= 0 && level <= 100) {
    try {
      await loudness.setVolume(level);
    } catch (err) {
      console.error('Set volume error:', err.message);
    }
  }
});

ipcMain.handle('get-volume', async () => {
  try {
    return await loudness.getVolume();
  } catch (err) {
    console.error('Get volume error:', err.message);
    return 75;
  }
});



