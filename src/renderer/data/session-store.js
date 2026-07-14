// Session Data Store - The Bridge between Modules
function readStoredArray(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn(`[SessionStore] Failed to parse ${key}; resetting corrupt data.`, error);
    localStorage.removeItem(key);
    return [];
  }
}

function readStoredInteger(key) {
  const parsed = parseInt(localStorage.getItem(key) || '0', 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export const SessionStore = {
  getSessions: () => readStoredArray('sm_sessions'),

  saveSessions: (sessions) => {
    localStorage.setItem('sm_sessions', JSON.stringify(sessions));
    // Trigger a custom event so other modules know data changed
    window.dispatchEvent(new CustomEvent('session-data-updated'));
  },

  getTotalSeconds: () => readStoredInteger('sm_total_seconds'),

  saveTotalSeconds: (seconds) => {
    localStorage.setItem('sm_total_seconds', seconds);
  },

  pushSession: (sessionObj) => {
    const sessions = SessionStore.getSessions();
    sessions.push(sessionObj);
    SessionStore.saveSessions(sessions);
  },

  archiveSessions: (dateKey, sessions) => {
    localStorage.setItem(`sm_sessions_archived_${dateKey}`, JSON.stringify(sessions));
  },

  clearSessions: () => {
    localStorage.setItem('sm_sessions', '[]');
    localStorage.setItem('sm_total_seconds', '0');
    window.dispatchEvent(new CustomEvent('session-data-updated'));
  }
};
