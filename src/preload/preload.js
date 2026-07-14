const { contextBridge, ipcRenderer } = require('electron');

function isTrustedRenderer() {
  return window.location.protocol === 'file:';
}

function guardedSend(channel, payload) {
  if (!isTrustedRenderer()) return false;
  ipcRenderer.send(channel, payload);
  return true;
}

function guardedInvoke(channel, payload) {
  if (!isTrustedRenderer()) {
    return Promise.reject(new Error('Blocked IPC call from untrusted renderer'));
  }
  return ipcRenderer.invoke(channel, payload);
}

function guardedOn(channel, callback) {
  if (!isTrustedRenderer() || typeof callback !== 'function') {
    return () => {};
  }

  const wrapped = (_event, ...args) => callback(...args);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

contextBridge.exposeInMainWorld('electronAPI', {
  isPackaged: window.location.href.includes('app.asar'),
  getVersion: () => guardedInvoke('get-version'),
  startFocus: () => guardedSend('start-focus'),
  endFocus: () => guardedSend('end-focus'),
  startBreak: () => guardedSend('start-break'),
  endBreak: () => guardedSend('end-break'),
  hideBreak: () => guardedSend('hide-break'),
  mediaControl: (action) => guardedSend('media-control', action),
  startGlobalFocus: () => guardedSend('start-global-focus'),
  endGlobalFocus: () => guardedSend('end-global-focus'),
  setVolume: (level) => guardedSend('set-volume', level),
  showSessionOverlay: () => guardedSend('show-session-overlay'),
  hideSessionOverlay: () => guardedSend('hide-session-overlay'),
  updateSessionState: (state) => guardedSend('session-state-update', state),
  sendOverlaySessionCommand: (action) => guardedSend('overlay-session-command', action),
  sendOverlayMediaCommand: (action) => guardedSend('overlay-media-command', action),
  setOverlayExpanded: (expanded) => guardedSend('set-overlay-expanded', expanded),
  moveOverlayBy: (delta) => guardedSend('move-overlay-by', delta),
  updateStartupSetting: (launchOnStartup) => guardedSend('update-startup-setting', launchOnStartup),
  updateCloseSetting: (closeToTray) => guardedSend('update-close-setting', closeToTray),
  wipeScreenTimeData: () => guardedInvoke('wipe-screen-time'),
  getScreenTime: () => guardedInvoke('get-screen-time'),
  getMediaMetadata: () => guardedInvoke('get-media-metadata'),
  getVolume: () => guardedInvoke('get-volume'),
  openExternalUrl: (url) => guardedInvoke('open-external-url', url),
  onActiveWindow: (callback) => guardedOn('active-window', callback),
  onDailyReset: (callback) => guardedOn('daily-reset', callback),
  onScreenTimeData: (callback) => guardedOn('screen-time-data', callback),
  onForceStopSession: (callback) => guardedOn('force-stop-session', callback),
  onOverlaySessionCommand: (callback) => guardedOn('overlay-session-command', callback),
  onOverlayMediaCommand: (callback) => guardedOn('overlay-media-command', callback),
  onOverlaySessionState: (callback) => guardedOn('overlay-session-state', callback)
});
