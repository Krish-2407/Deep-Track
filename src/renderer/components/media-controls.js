/**
 * Media Controls Component
 * Handles the dashboard media bar and session view media display.
 */

import { SessionState } from './timer-ui.js';

export function sendMedia(action) {
  const webview = document.getElementById('immersive-browser');
  const hasActiveWebview = webview && webview.src && webview.src !== 'about:blank';
  const isSeekAction = action === 'next' || action === 'prev';

  // Seek in webview for prev/next when any webview session is active (strict or not)
  if (isSeekAction && hasActiveWebview) {
    const seconds = action === 'next' ? 10 : -10;
    webview.executeJavaScript(`
      const video = document.querySelector('video');
      if (video) video.currentTime += ${seconds};
    `);
    return;
  }

  // Fallback: use system media transport controls (SMTC) via media-control.exe
  window.electronAPI.mediaControl(action);
}

export async function updateMediaMetadata(options = {}) {
  const { isInBreakMode = false, isSessionActive = false, isDashActive = false } = options;

  // Guard against unnecessary polling
  if (document.hidden) return;

  // Also only poll if session view, dashboard media bar, or break overlay is active
  if (!isSessionActive && !isDashActive && !isInBreakMode) return;

  const data = await window.electronAPI.getMediaMetadata();
  const display = document.getElementById('media-metadata');
  const playBtn = document.getElementById('media-play-btn');

  const breakTrack = document.getElementById('break-track-name');
  const breakDesc = document.getElementById('break-track-desc');
  const breakPlayBtn = document.querySelector('#break-media-play span');

  if (data.title) {
    const text = `${data.title} - ${data.artist || 'Unknown'}`;
    if (display) {
      if (display.textContent !== text) {
        display.textContent = text;
        // Restart animation if text changed
        display.style.animation = 'none';
        display.offsetHeight; // trigger reflow
        display.style.animation = null;
      }
    }

    if (playBtn) {
      // Update icon based on status
      if (data.status === 'Playing') {
        playBtn.textContent = '⏸';
      } else {
        playBtn.textContent = '▶';
      }
    }

    // SESSION VIEW SYNC: Update the labels in the Stitch UI session view
    const sessionTrack = document.getElementById('current-track-name');
    const sessionDesc = document.getElementById('current-track-desc');
    const sessionPlayBtn = document.querySelector('#session-play-btn span');

    if (sessionTrack) sessionTrack.textContent = data.title;
    if (sessionDesc) sessionDesc.textContent = data.artist || 'Unknown Source';
    if (sessionPlayBtn) sessionPlayBtn.textContent = (data.status === 'Playing') ? 'pause' : 'play_arrow';

    // BREAK OVERLAY SYNC: Update break media player
    if (breakTrack) breakTrack.textContent = data.title;
    if (breakDesc) breakDesc.textContent = data.artist || 'Unknown Source';
    if (breakPlayBtn) breakPlayBtn.textContent = (data.status === 'Playing') ? 'pause' : 'play_arrow';

  } else {
    if (display) {
      display.textContent = "No media playing";
    }
    if (playBtn) {
      playBtn.textContent = '⏯';
    }
    
    const sessionTrack = document.getElementById('current-track-name');
    if (sessionTrack) sessionTrack.textContent = "No media detected";

    if (breakTrack) breakTrack.textContent = "No media detected";
  }
}

export function initMediaControls(getState) {
  // --- DASHBOARD MEDIA BAR ---
  const dashPlayBtn = document.getElementById('media-play-btn');
  const dashPrevBtn = document.getElementById('media-prev-btn');
  const dashNextBtn = document.getElementById('media-next-btn');

  if (dashPlayBtn) dashPlayBtn.addEventListener('click', () => sendMedia('play'));
  if (dashPrevBtn) dashPrevBtn.addEventListener('click', () => sendMedia('prev'));
  if (dashNextBtn) dashNextBtn.addEventListener('click', () => sendMedia('next'));

  // --- SESSION VIEW MEDIA CONTROLS ---
  const sPlay = document.getElementById('session-play-btn');
  const sPrev = document.getElementById('prev-track');
  const sNext = document.getElementById('next-track');

  if (sPlay) {
    sPlay.addEventListener('click', () => {
      sendMedia('play');
      const icon = sPlay.querySelector('span');
      if (icon) {
        icon.textContent = icon.textContent === 'pause' ? 'play_arrow' : 'pause';
      }
    });
  }

  if (sPrev) sPrev.addEventListener('click', () => sendMedia('prev'));
  if (sNext) sNext.addEventListener('click', () => sendMedia('next'));

  // --- BREAK OVERLAY MEDIA CONTROLS ---
  const bPlay = document.getElementById('break-media-play');
  const bPrev = document.getElementById('break-prev-track');
  const bNext = document.getElementById('break-next-track');

  if (bPlay) {
    bPlay.addEventListener('click', () => {
      sendMedia('play');
      const icon = bPlay.querySelector('span');
      if (icon) {
        icon.textContent = icon.textContent === 'pause' ? 'play_arrow' : 'pause';
      }
    });
  }

  if (bPrev) bPrev.addEventListener('click', () => sendMedia('prev'));
  if (bNext) bNext.addEventListener('click', () => sendMedia('next'));

  // --- VOLUME CONTROLS (UI ONLY) ---
  const volIcon = document.getElementById('volume-icon');
  const volPopover = document.getElementById('volume-popover');
  const volSlider = document.getElementById('volume-slider-vertical');
  const volFill = document.getElementById('volume-fill-vertical');
  const volText = document.getElementById('volume-percent-text');

  if (volIcon && volPopover) {
    volIcon.addEventListener('click', (e) => {
      e.stopPropagation();
      volPopover.classList.toggle('active');
    });

    // Close when clicking outside
    document.addEventListener('click', (e) => {
      if (!volPopover.contains(e.target) && e.target !== volIcon) {
        volPopover.classList.remove('active');
      }
    });
  }

  if (volSlider && volFill && volText) {
    let lastVolumeSent = -1;
    let volumeTimeout = null;

    const setRealVolume = (percent) => {
      if (percent !== lastVolumeSent) {
        lastVolumeSent = percent;
        window.electronAPI.setVolume(percent);
      }
    };

    const updateVolumeUI = (clientY) => {
      const rect = volSlider.getBoundingClientRect();
      const height = rect.height;
      const y = Math.max(0, Math.min(height, clientY - rect.top));
      const percent = Math.round(100 - (y / height * 100));
      
      volFill.style.height = `${percent}%`;
      volText.textContent = `${percent}%`;
      
      // Update icon based on volume level
      if (percent === 0) {
        volIcon.textContent = 'volume_off';
      } else if (percent < 50) {
        volIcon.textContent = 'volume_down';
      } else {
        volIcon.textContent = 'volume_up';
      }

      // Throttle the IPC calls to prevent overwhelming the backend
      if (!volumeTimeout) {
        volumeTimeout = setTimeout(() => {
          setRealVolume(percent);
          volumeTimeout = null;
        }, 100);
      }
    };

    volSlider.addEventListener('mousedown', (e) => {
      updateVolumeUI(e.clientY);
      const onMouseMove = (moveEvent) => updateVolumeUI(moveEvent.clientY);
      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        // Ensure final value is sent immediately on release
        if (volumeTimeout) clearTimeout(volumeTimeout);
        const rect = volSlider.getBoundingClientRect();
        const height = rect.height;
        const y = Math.max(0, Math.min(height, e.clientY - rect.top)); // Use e or last known is better, but this works
        // Wait, e in mouseup is the release event, so we can use it
        const finalPercent = Math.round(100 - (Math.max(0, Math.min(height, moveEvent ? moveEvent.clientY : e.clientY - rect.top)) / height * 100));
        // Actually, just sending the last UI value is easier. I'll read the text content.
        const currentPercent = parseInt(volText.textContent, 10);
        setRealVolume(currentPercent);
        volumeTimeout = null;
      };
      
      // Fix mouseup reference issue
      let lastMoveEvent = e;
      const trackedMouseMove = (moveEvent) => {
        lastMoveEvent = moveEvent;
        onMouseMove(moveEvent);
      };
      
      const trackedMouseUp = () => {
        document.removeEventListener('mousemove', trackedMouseMove);
        document.removeEventListener('mouseup', trackedMouseUp);
        if (volumeTimeout) {
          clearTimeout(volumeTimeout);
          volumeTimeout = null;
        }
        const currentPercent = parseInt(volText.textContent, 10);
        setRealVolume(currentPercent);
      };

      document.addEventListener('mousemove', trackedMouseMove);
      document.addEventListener('mouseup', trackedMouseUp);
    });

    // Sync initial system volume
    window.electronAPI.getVolume().then((percent) => {
      if (typeof percent === 'number') {
        volFill.style.height = `${percent}%`;
        volText.textContent = `${percent}%`;
        if (percent === 0) volIcon.textContent = 'volume_off';
        else if (percent < 50) volIcon.textContent = 'volume_down';
        else volIcon.textContent = 'volume_up';
        lastVolumeSent = percent;
      }
    });
  }

  // Periodic metadata update
  setInterval(() => {
    const state = getState();
    updateMediaMetadata(state);
  }, 2500);

  window.electronAPI.onOverlayMediaCommand((action) => {
    if (['play', 'next', 'prev'].includes(action)) {
      sendMedia(action);
      updateMediaMetadata(getState());
    }
  });
}
