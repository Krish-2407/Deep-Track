
let selectedRating = 5;

/**
 * Displays a premium fluent glassmorphic toast notification.
 */
export function showToast(title, message, isError = false) {
  // Remove any existing toast
  const existingToast = document.querySelector('.glass-toast');
  if (existingToast) {
    existingToast.remove();
  }

  // Create toast elements
  const toast = document.createElement('div');
  toast.className = 'glass-toast';

  const iconWrap = document.createElement('div');
  iconWrap.className = `glass-toast-icon ${isError ? 'error' : ''}`;
  iconWrap.innerHTML = isError 
    ? '<span class="material-icons-outlined">error_outline</span>' 
    : '<span class="material-icons-outlined">check_circle_outline</span>';

  const content = document.createElement('div');
  content.className = 'glass-toast-content';

  const titleEl = document.createElement('span');
  titleEl.className = 'glass-toast-title';
  titleEl.textContent = title;

  const msgEl = document.createElement('span');
  msgEl.className = 'glass-toast-message';
  msgEl.textContent = message;

  content.appendChild(titleEl);
  content.appendChild(msgEl);
  toast.appendChild(iconWrap);
  toast.appendChild(content);
  document.body.appendChild(toast);

  // Trigger entry animation
  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  // Schedule auto-dismiss
  setTimeout(() => {
    toast.classList.add('hide');
    toast.addEventListener('transitionend', () => {
      toast.remove();
    });
  }, 4000);
}

/**
 * Populates dynamic diagnostic bundle properties in the Support view.
 */
function updateDiagnostics() {
  let osName = 'Windows';
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('macintosh') || ua.includes('mac os x')) {
    osName = 'macOS';
  } else if (ua.includes('linux')) {
    osName = 'Linux';
  }

  const osEl = document.getElementById('diag-os');
  if (osEl) osEl.textContent = osName;

  let sessionCount = 0;
  try {
    const sessions = JSON.parse(localStorage.getItem('sm_sessions') || '[]');
    sessionCount = sessions.length;
  } catch (e) {
    console.warn('Failed to parse sessions length:', e);
  }
  const sessionsEl = document.getElementById('diag-sessions');
  if (sessionsEl) sessionsEl.textContent = sessionCount;

  const uidEl = document.getElementById('diag-uid');
  if (uidEl) {
    uidEl.textContent = 'Disabled';
  }

  const versionEl = document.getElementById('diag-version');
  if (versionEl && window.electronAPI && typeof window.electronAPI.getVersion === 'function') {
    window.electronAPI.getVersion().then(version => {
      versionEl.textContent = `v${version} (Alpha)`;
    }).catch(err => {
      console.warn('Failed to retrieve version for diagnostics:', err);
    });
  }
}

/**
 * Initializes the Support & Feedback Module.
 */
export function initSupportModule() {
  console.log('[Support Module] Initializing support listeners...');

  const ratingBtns = document.querySelectorAll('.feedback-rating-row .rating-btn');
  const feedbackText = document.getElementById('feedback-text');
  const submitBtn = document.getElementById('submit-feedback-btn');

  // 1. Rating Buttons Active-State Toggle
  ratingBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      ratingBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedRating = parseInt(btn.dataset.rating) || 5;
    });
  });

  // 2. Submit Feedback Handler
  if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
      const textVal = feedbackText.value ? feedbackText.value.trim() : '';

      if (textVal.length < 5) {
        showToast('Description Too Short', 'Please describe your experience or bug report in a few more words.', true);
        return;
      }

      // XSS Sanitization using DOMPurify
      const sanitizedText = DOMPurify.sanitize(textVal);

      // System Diagnostics Package
      let osName = 'Windows';
      const ua = navigator.userAgent.toLowerCase();
      if (ua.includes('macintosh') || ua.includes('mac os x')) {
        osName = 'macOS';
      } else if (ua.includes('linux')) {
        osName = 'Linux';
      }
      
      const totalSessions = document.getElementById('diag-sessions')?.textContent || '0';
      const userId = document.getElementById('diag-uid')?.textContent || localStorage.getItem('sm_telemetry_id') || 'Not Initialized';

      const appVersion = await window.electronAPI.getVersion();

      const payload = {
        rating: selectedRating,
        feedback: sanitizedText,
        diagnostics: {
          appVersion: appVersion,
          os: osName,
          totalSessions: parseInt(totalSessions) || 0,
          userId: userId,
          timestamp: new Date().toISOString()
        }
      };

      // Construct a clean, user-friendly Clipboard backup report
      const starRating = '⭐️'.repeat(selectedRating) + '☆'.repeat(5 - selectedRating);
      const clipboardReport = `DEEP TRACK - ALPHA FEEDBACK REPORT
==================================
Date: ${payload.diagnostics.timestamp}
Rating: ${starRating} (${selectedRating}/5)

Feedback Description:
----------------------------------
${sanitizedText}

Diagnostics Details:
----------------------------------
App Version: ${appVersion}
OS Platform: ${osName}
Total Sessions: ${totalSessions}
User ID: ${userId}
User Agent: ${navigator.userAgent}
==================================`;

      let webhookSuccess = false;
      try {
        // Safe check for configurable Webhook integration
        const devWebhook = localStorage.getItem('sm_feedback_webhook');
        const isValidWebhook = devWebhook && (
          devWebhook.startsWith('https://discord.com/api/webhooks/') ||
          devWebhook.startsWith('https://discordapp.com/api/webhooks/')
        );
        if (isValidWebhook) {
          const response = await fetch(devWebhook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              embeds: [{
                title: "🚀 Alpha Release Feedback Submission",
                color: selectedRating >= 4 ? 0x8b5cf6 : 0xef4444,
                fields: [
                  { name: "Rating", value: `${starRating} (${selectedRating}/5)`, inline: true },
                  { name: "OS Platform", value: osName, inline: true },
                  { name: "Total Sessions", value: totalSessions, inline: true },
                  { name: "User ID", value: userId, inline: true },
                  { name: "Feedback", value: sanitizedText }
                ],
                footer: { text: `Deep Track Client App ${appVersion} • ${payload.diagnostics.timestamp}` }
              }]
            })
          });

          if (response.ok) {
            webhookSuccess = true;
          }
        }
      } catch (err) {
        console.warn('[Support Webhook Link Failed]:', err);
      }

      if (webhookSuccess) {
        showToast('Feedback Submitted!', 'Thank you! Your feedback has been sent directly to the development team.');
        feedbackText.value = '';
        return;
      }

      // Clipboard Fail-Safe Copy System (only if direct method failed)
      try {
        await navigator.clipboard.writeText(clipboardReport);
        showToast('✨ Report Compiled!', 'Diagnostic bundle copied to your clipboard! Share it in our Discord channel.');
        feedbackText.value = '';
      } catch (clipErr) {
        console.error('Clipboard copy failed:', clipErr);
        showToast('Feedback Submission', 'Thank you for your feedback!', false);
      }
    });
  }

  // 3. Populate initial diagnostics
  updateDiagnostics();

  // 4. Update diagnostics whenever support view is clicked or shown
  const supportBtn = document.querySelector('.sidebar-btn[data-view="support-view"]');
  if (supportBtn) {
    supportBtn.addEventListener('click', updateDiagnostics);
  }
}
