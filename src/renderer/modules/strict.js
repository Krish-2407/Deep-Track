/**
 * Phase 7: Strict Mode & Webview Lockdown Module
 * Handles immersive browser logic, ad-skipping, and strict session enforcement.
 * 
 * This module isolates the complex webview event listeners and security lockdowns
 * that were previously cluttering renderer.js.
 */

import { SessionState } from '../components/timer-ui.js';

export function initStrictModule() {
  console.log('[Strict Module] Initializing webview listeners...');

  const webview = document.getElementById('immersive-browser');
  const volControl = document.getElementById('volume-control');

  if (!webview) {
    console.warn('[Strict Module] immersive-browser not found');
    return;
  }

  // --- 1. Ad Skipper & UI Polisher (Immersive Mode Enhancement) ---
  webview.addEventListener('dom-ready', () => {
    // 1. Inject permanent, high-priority stylesheet and block vertical swipe/scroll gestures at the DOM event level
    webview.executeJavaScript(`
      (function() {
        // Inject layout blockers
        const style = document.createElement('style');
        style.textContent = '.ytp-next-button, .ytp-pause-overlay, .ytp-fullscreen-recommendations, .ytp-ce-element, .ytp-ce-cover-list, .ytp-ce-video, .ytp-ce-channel, .ytp-suggested-video, .ytp-cards-button, .ytp-cards-teaser, #masthead-container, #secondary, #comments, .ytp-paid-content-overlay, .ytp-more-videos-button, .ytp-more-videos, .ytp-share-button, .ytp-miniplayer-button, .ytp-remote-button, .ytp-size-button { display: none !important; visibility: hidden !important; pointer-events: none !important; }';
        document.head.appendChild(style);

        // Block trackpad two-finger vertical wheel scrolling (which slides up recommended tray)
        document.addEventListener('wheel', (e) => {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
        }, { passive: false, capture: true });

        // Block touchscreen swipe vertical gestures (which opens standard mobile recommended trays)
        document.addEventListener('touchmove', (e) => {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
        }, { passive: false, capture: true });
      })();
    `);

    // 2. Start dynamic skipper & fullscreen enforcer loop
    webview.executeJavaScript(`
      setInterval(() => {
        try {
          // 1. Click Skip Button as soon as it appears
          const skipBtn = document.querySelector('.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button');
          if (skipBtn) skipBtn.click();

          // 2. Clear Ad Overlays & Close Buttons
          const closeBtn = document.querySelector('.ytp-ad-overlay-close-button, .ytp-ad-overlay-close-container');
          if (closeBtn) closeBtn.click();
          
          const adOverlays = document.querySelectorAll('.ytp-ad-overlay-container, .ytp-ad-message-container, #player-ads, ytd-ad-slot-renderer');
          adOverlays.forEach(o => o.style.display = 'none');

          // 3. Fast-forward video if ad is showing but no skip button yet
          const video = document.querySelector('video');
          const isAd = document.querySelector('.ad-showing, .ad-interrupting');
          if (isAd && video && video.duration > 0) {
            video.currentTime = video.duration;
          }

          // 4. Force True Fullscreen once on load (respect manual exit/minimize afterwards)
          const player = document.querySelector('.html5-video-player');
          if (player && !player.classList.contains('ytp-fullscreen') && !player.dataset.autoFullscreenTriggered) {
            document.querySelector('.ytp-fullscreen-button')?.click();
            player.dataset.autoFullscreenTriggered = 'true';
          }

          // Adjust video offset since header is gone
          const container = document.querySelector('.ytd-video-primary-info-renderer');
          if (container) container.style.marginTop = '0';
        } catch (e) {
          // Silent catch for cross-origin or navigation race conditions
        }
      }, 1000);
    `);

    // Fade in once cleanup has likely occurred
    setTimeout(() => {
      webview.classList.add('ready');
    }, 1500);
  });

  // --- 2. Strict Mode Lockdown: Block all navigation after start ---
  webview.addEventListener('will-navigate', (e) => {
    if (SessionState.isStrict) {
      const current = webview.getURL();
      if (!current || current === 'about:blank' || current === '') return;
      try {
        const targetUrl = new URL(e.url);
        const ytRegex = /(?:v=|\/shorts\/|\/embed\/)([a-zA-Z0-9_-]{11})/;

        const currentMatch = webview.getURL().match(ytRegex);
        const targetMatch = e.url.match(ytRegex);

        const curV = currentMatch ? currentMatch[1] : null;
        const tarV = targetMatch ? targetMatch[1] : null;

        // Robust YouTube video lockdown: Prevent changing video IDs
        if (curV && tarV && curV !== tarV) {
          console.warn('[Strict Lockdown] Blocked navigation to different video');
          e.preventDefault();
        } else if (!tarV && targetUrl.hostname.includes('youtube.com') && !targetUrl.pathname.startsWith('/live')) {
          // Block navigation to non-video YouTube pages (home, trending, etc)
          console.warn('[Strict Lockdown] Blocked navigation to non-video page');
          e.preventDefault();
        }
      } catch (err) { }
    }
  });

  webview.addEventListener('did-navigate', (e) => {
    if (SessionState.isStrict) {
      const ytRegex = /(?:v=|\/shorts\/|\/embed\/)([a-zA-Z0-9_-]{11})/;
      const currentMatch = webview.getURL().match(ytRegex);
      const tarMatch = e.url.match(ytRegex);

      const curV = currentMatch ? currentMatch[1] : null;
      const tarV = tarMatch ? tarMatch[1] : null;

      // Failsafe: If somehow it navigated away from the target video ID, force it back
      if (curV && tarV && curV !== tarV && SessionState.immersiveUrl) {
        webview.loadURL(SessionState.immersiveUrl);
      }
    }
  });

  // --- 3. Interaction Lockdown: No right-click, no new windows ---
  webview.addEventListener('context-menu', (e) => {
    if (SessionState.isStrict) e.preventDefault();
  });

  webview.addEventListener('new-window', (e) => {
    if (SessionState.isStrict) e.preventDefault();
  });

  // --- 4. Keyboard Lockdown: Block refresh, history, and tab management ---
  webview.addEventListener('before-input-event', (event, input) => {
    if (SessionState.isStrict) {
      const isControl = input.control || input.meta;
      const isAlt = input.alt;

      if (
        (isControl && (input.key.toLowerCase() === 'r' || input.key.toLowerCase() === 'n' || input.key.toLowerCase() === 't')) ||
        (isAlt && (input.key === 'ArrowLeft' || input.key === 'ArrowRight')) ||
        (input.key === 'F5') ||
        (input.key === 'Backspace' && !['input', 'textarea'].includes(document.activeElement?.tagName.toLowerCase()))
      ) {
        console.warn(`[Strict Lockdown] Blocked key combo: ${input.key}`);
        event.preventDefault();
      }
    }
  });

  // --- 5. Volume Control Bridge ---
  if (volControl) {
    volControl.addEventListener('input', (e) => {
      const vol = e.target.value;
      if (webview && webview.src && webview.src !== 'about:blank') {
        webview.executeJavaScript(`
          (function() {
            const v = document.querySelector('video');
            if (v) v.volume = ${vol};
          })();
        `);
      }
    });
  }

  console.log('[Strict Module] Webview listeners initialized ✓');
}
