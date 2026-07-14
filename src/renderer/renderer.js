import { SessionStore } from './data/session-store.js';
import { ZenStore } from './data/zen-store.js';
import { initMediaControls, sendMedia, updateMediaMetadata } from './components/media-controls.js';
import { initZen, renderZenContent } from './modules/zen.js';
import { initTimer, normalizeStrictUrl } from './components/timer-ui.js';
import { initSettings } from './modules/settings.js';
import { initSessionModules } from './modules/session.js';
import { initStrictModule } from './modules/strict.js';
import { initSupportModule } from './modules/support.js';
import {
  initDashboard,
  setAppUsageData,
  loadDashboardData,
  initCharts,
  updateUsageChart,
  changeDashboardChartType,
  changeTrendRange,
  getTrendRange
} from './modules/dashboard.js';


// IPC is now handled via window.electronAPI
if (window.electronAPI && window.electronAPI.isPackaged) {
  console.log = function() {};
  console.warn = function() {};
}

// Boot sequence & Compatibility Layer for ES Modules
document.addEventListener('DOMContentLoaded', () => {
  // Initialize timer engine (Phase 5)
  initTimer();
  // Initialize Settings engine
  initSettings();
  // Initialize Session Modules (Phase 6)
  initSessionModules();
  // Initialize Strict Modules (Phase 7)
  initStrictModule();
  // Initialize Support Module
  initSupportModule();

  // Set version label dynamically from package.json
  window.electronAPI.getVersion().then(version => {
    const versionEl = document.querySelector('.brand-version');
    if (versionEl) {
      versionEl.textContent = `V ${version}`;
    }
  }).catch(err => {
    console.error('Failed to load app version for sidebar:', err);
  });

  // Bind Chart Toggles
  document.querySelectorAll('.dashboard-grid .toggle-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const type = e.target.textContent.toLowerCase().includes('focus') ? 'focus' : 'screentime';
      if (typeof changeDashboardChartType === 'function') changeDashboardChartType(type);
    });
  });

  // Bind Analytics Toggles
  document.querySelectorAll('.analytics-type-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const type = e.target.textContent.toLowerCase().includes('focus') ? 'focus' : 'screentime';
      if (typeof changeAnalyticsChartType === 'function') changeAnalyticsChartType(type);
    });
  });

  document.querySelectorAll('.analytics-range-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const days = parseInt(e.target.textContent);
      if (typeof changeAnalyticsTrendRange === 'function') changeAnalyticsTrendRange(days);
    });
  });
});

// Re-expose legacy functions for UI compatibility during transition
window.sendMedia = sendMedia;
window.changeTrendRange = changeTrendRange;
window.changeChartType = (type) => { if (typeof changeDashboardChartType === 'function') changeDashboardChartType(type); };
window.changeAnalyticsChartType = (type) => { if (typeof changeAnalyticsChartType === 'function') changeAnalyticsChartType(type); };
window.changeAnalyticsTrendRange = (days) => { if (typeof changeAnalyticsTrendRange === 'function') changeAnalyticsTrendRange(days); };
window.switchView = (viewId) => { if (typeof switchView === 'function') switchView(viewId); };
window.loadDashboardData = () => { if (typeof loadDashboardData === 'function') loadDashboardData(); };
window.trackFeatureUsage = trackFeatureUsage;

// Navigation — sidebar-driven
const allViews = () => document.querySelectorAll('.view');
const allNavBtns = () => document.querySelectorAll('.sidebar-btn');
const setupView = document.getElementById('setup-view');
const dashView = document.getElementById('dash-view');
const strictView = document.getElementById('strict-view');
const zenView = document.getElementById('zen-view');
const analyticsView = document.getElementById('analytics-view');
const historyView = document.getElementById('history-view');
const timerView = document.getElementById('timer-view');
const appShell = document.getElementById('app-shell');

// Inputs
const startBtn = document.getElementById('start-btn');
const focusInput = document.getElementById('focus-input');
const breakInput = document.getElementById('break-input');
const taskInput = document.getElementById('task-input');
const estCyclesInput = document.getElementById('est-cycles-input');

// Strict Inputs
const startStrictBtn = document.getElementById('start-strict-btn');
const strictFocusInput = document.getElementById('strict-focus-input');
const strictBreakInput = document.getElementById('strict-break-input');
const strictTaskInput = document.getElementById('strict-task-input');
const strictEstCyclesInput = document.getElementById('strict-est-cycles-input');
const strictUrlInput = document.getElementById('strict-url-input');

// Dashboard metrics
const statAccuracy = document.getElementById('stat-accuracy');
const statFocusScore = document.getElementById('stat-focus-score');
const statTodayScreenTime = document.getElementById('stat-today-screen-time');
const statTodayTime = document.getElementById('stat-today-time');
const statCycles = document.getElementById('stat-cycles');
const statBlocked = document.getElementById('stat-blocked');
const historyBody = document.getElementById('history-body');
const dailyScreentimeBody = document.getElementById('daily-screentime-body');
const statAvgScreenTime = document.getElementById('stat-avg-screen-time');

// Bubble/Checklist
const pauseBtn = document.getElementById('pause-btn');
const stopBtn = document.getElementById('stop-btn');
const checklistBtn = document.getElementById('checklist-btn');
const checklistPopover = document.getElementById('checklist-popover');
const subTaskList = document.getElementById('sub-task-list');
const newSubTaskInput = document.getElementById('new-sub-task');
const webview = document.getElementById('immersive-browser');

// Active Session View Elements
const activeSessionView = document.getElementById('active-session-view');
const sessionTimeDisplay = document.getElementById('session-time-display');
const sessionProgressBar = document.getElementById('timer-progress-bar');
const sessionTaskList = document.getElementById('session-task-list');
const sessionStatusLabel = document.getElementById('session-status-label');
const sessionPauseBtn = document.getElementById('session-pause-btn');
const sessionStopBtn = document.getElementById('session-stop-btn');
const sessionPlayBtn = document.getElementById('session-play-btn');
const sessionChecklistProgress = document.getElementById('checklist-progress-fill');
const sessionChecklistCount = document.getElementById('checklist-count');

// ── UTILITIES ──
let selectedNoteColor = "transparent";

// Global Chart instances
let trendChart = null;
let usageChart = null;

// URL validation (used by session start handlers - will move to Phase 6/7)
function isValidUrl(urlString) {
  if (!urlString) return true; // Empty is fine (loads about:blank)
  return normalizeStrictUrl(urlString) !== null;
}

function getStrictVideoId(urlString) {
  if (!urlString) return null;
  const match = String(urlString).match(/(?:v=|\/shorts\/|\/embed\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

// Helper for local date string consistency
function getLocalDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function appendTextCell(row, value) {
  const cell = document.createElement('td');
  cell.textContent = value;
  row.appendChild(cell);
  return cell;
}

function formatTimeDisplay(totalSeconds) {
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) {
    return `${totalMinutes}m`;
  } else {
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return `${hours}h ${mins}m`;
  }
}

function formatTimeMins(totalMinutes) {
  if (totalMinutes < 60) {
    return `${totalMinutes} mins`;
  } else {
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    if (mins === 0) {
      return `${hours} hr`;
    }
    return `${hours} hr ${mins} mins`;
  }
}

// BUG-4 FIX: Data now comes from main process (screentime.json), not stale localStorage
let appUsageData = {};

// --- Screen Time Logic ---
window.electronAPI.onActiveWindow((data) => {
  const appName = data.owner || "Unknown";
  // Active app display removed (or you can add it back if needed)
});

// Throttle dashboard re-renders: the tracking engine sends IPC data every 2 seconds,
// but re-rendering the entire dashboard (DOM updates, chart redraws, table rebuilds)
// on every tick causes visible jank. Limit to once every 5 seconds.
let _lastDashRender = 0;
const DASH_RENDER_THROTTLE_MS = 5000;

window.electronAPI.onScreenTimeData((data) => {
  if (data && typeof data === 'object') {
    appUsageData = { ...appUsageData, ...data };
    setAppUsageData(appUsageData); // Sync dashboard module cache (cheap object assignment)
    
    // Only re-render dashboard DOM elements and charts if the dashboard view is active
    // AND enough time has passed since the last render
    const now = Date.now();
    const dashView = document.getElementById('dash-view');
    if (dashView && dashView.classList.contains('active') && (now - _lastDashRender >= DASH_RENDER_THROTTLE_MS)) {
      _lastDashRender = now;
      requestAnimationFrame(() => {
        loadDashboardData();
        if (typeof updateUsageChart === 'function') updateUsageChart();
      });
    }
  }
});

// --- Daily Reset Listener ---
window.electronAPI.onDailyReset((data) => {
  console.log(`[Daily Reset Event] Received from main process: ${data.newDate}`);
  console.log(`[Daily Reset Event] Previous day (${data.previousDate}) data archived`);

  // Refresh dashboard to show new day stats
  appUsageData = {}; // Clear old cache
  setAppUsageData({}); // Sync dashboard module cache
  loadDashboardData();
  initCharts();
});

// --- Dashboard & Charts ---
// Note: All dashboard, charts, usage data, and daily goal locking features have been refactored
// and are now imported from modules/dashboard.js. The duplicate implementations here are removed
// to avoid syntax conflicts and runtime issues.


// --- Timer Sequence ---
// ── Timer Engine ──
// Now extracted to components/timer-ui.js
// Functions exposed to window: startTimerSequence, endCurrentSession, skipBreak, syncSessionTasks



// --- Event Listeners ---
// Now handled by modules/session.js (initSessionModules)

// ── END SESSION & UI CONTROLS ──
// Now handled by timer-ui.js module (exposed to window)
// stopBtn and pauseBtn listeners are set up by initTimer()

checklistBtn.addEventListener('click', () => checklistPopover.classList.toggle('active'));

newSubTaskInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && newSubTaskInput.value.trim()) {
    const li = document.createElement('li');
    const check = document.createElement('input');
    check.type = 'checkbox';
    const span = document.createElement('span');
    span.textContent = newSubTaskInput.value; // FIX: XSS protection

    const delBtn = document.createElement('button');
    delBtn.className = 'sub-task-delete-btn';
    delBtn.title = 'Remove';
    delBtn.innerHTML = '&times;';
    delBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      li.remove();
      if (typeof window.syncSessionTasks === 'function') window.syncSessionTasks();
    });

    li.appendChild(check);
    li.appendChild(span);
    li.appendChild(delBtn);

    check.addEventListener('change', (ev) => {
      li.style.opacity = ev.target.checked ? 0.4 : 1;
      if (typeof window.syncSessionTasks === 'function') window.syncSessionTasks();
    });
    subTaskList.appendChild(li);
    if (typeof window.syncSessionTasks === 'function') window.syncSessionTasks();
    newSubTaskInput.value = '';
  }
});
// ── SIDEBAR NAVIGATION ENGINE ──
async function switchView(viewId) {
  allViews().forEach(v => v.classList.remove('active'));
  allNavBtns().forEach(b => b.classList.remove('active'));
  const target = document.getElementById(viewId);
  if (target) target.classList.add('active');
  const navBtn = document.querySelector(`.sidebar-btn[data-view="${viewId}"]`);
  if (navBtn) navBtn.classList.add('active');



  // Scroll main content to top immediately
  const mainContent = document.getElementById('main-content');
  if (mainContent) mainContent.scrollTop = 0;

  // View-specific hooks - Defer slightly to let the CSS fadeIn animation finish smoothly
  setTimeout(async () => {
    if (viewId === 'dash-view') await changeTrendRange(getTrendRange());
    if (viewId === 'zen-view') renderZenContent();
    if (viewId === 'analytics-view') await loadAnalyticsView();
    if (viewId === 'history-view') await loadHistoryView();
  }, 150);
}

document.querySelectorAll('.sidebar-btn').forEach(btn => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

// Protocol card shortcuts on Focus Studio page
const protocolStandard = document.getElementById('protocol-standard');
const protocolStrict = document.getElementById('protocol-strict-shortcut');
if (protocolStandard) protocolStandard.addEventListener('click', () => {
  document.getElementById('standard-config').scrollIntoView({ behavior: 'smooth' });
});
if (protocolStrict) protocolStrict.addEventListener('click', () => switchView('strict-view'));

// ── ANALYTICS CHARTS STATE ──
let analyticsFocusChart = null;
let currentAnalyticsChartType = 'focus';
let currentAnalyticsTrendRange = 1;

function changeAnalyticsChartType(type) {
  currentAnalyticsChartType = type;
  const chartToggleBtns = document.querySelectorAll('.analytics-type-btn');
  chartToggleBtns.forEach((btn, idx) => {
    btn.classList.toggle('active',
      (type === 'focus' && idx === 0) ||
      (type === 'screentime' && idx === 1)
    );
  });

  const chartTitle = document.getElementById('analytics-chart-title');
  if (chartTitle) {
    chartTitle.textContent = type === 'focus' ? 'Focus Time Over Time' : 'Screen Time Over Time';
  }

  renderAnalyticsChart();
}
window.changeAnalyticsChartType = changeAnalyticsChartType;

function changeAnalyticsTrendRange(days) {
  currentAnalyticsTrendRange = days;
  const rangeBtns = document.querySelectorAll('.analytics-range-btn');
  rangeBtns.forEach(btn => {
    const onclick = btn.getAttribute('onclick') || '';
    btn.classList.toggle('active', onclick.includes(`(${days})`));
  });
  renderAnalyticsChart();
}
window.changeAnalyticsTrendRange = changeAnalyticsTrendRange;

async function renderAnalyticsChart() {
  const focusCtx = document.getElementById('analyticsFocusChart');
  if (!focusCtx) return;

  const sessions = SessionStore.getSessions();
  const appData = await window.electronAPI.getScreenTime() || {};

  const labels = [];
  let data = [];
  const days = currentAnalyticsTrendRange;

  let chartColor = currentAnalyticsChartType === 'focus' ? '#8b5cf6' : '#2dd4bf';
  let chartLabel = currentAnalyticsChartType === 'focus' ? 'Focus Hours' : 'Screen Time (Hours)';

  if (days === 1) {
    labels.push(...[...Array(24)].map((_, i) => `${i}:00`));
    const today = getLocalDateStr();

    if (currentAnalyticsChartType === 'focus') {
      data = [...Array(24)].map((_, hour) => {
        const hourSessions = sessions.filter(s => {
          const sd = new Date(s.date);
          const sdStr = `${sd.getFullYear()}-${String(sd.getMonth() + 1).padStart(2, '0')}-${String(sd.getDate()).padStart(2, '0')}`;
          return sdStr === today && sd.getHours() === hour;
        });
        return hourSessions.reduce((sum, s) => sum + (s.actual * (s.focusMinutes || 25) * 60), 0) / 3600;
      });
    } else {
      const todayData = appData[today] || {};
      const hasHourlyData = [...Array(24)].some((_, h) => todayData[String(h).padStart(2, '0')]);

      if (hasHourlyData) {
        data = [...Array(24)].map((_, hour) => {
          const hourData = todayData[String(hour).padStart(2, '0')] || {};
          return Object.values(hourData).reduce((sum, s) => sum + (typeof s === 'number' ? s : 0), 0) / 3600;
        });
      } else {
        const activeHours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
        const appEntries = Object.entries(todayData).filter(([key]) => !/^\d{2}$/.test(key));
        const totalSec = appEntries.reduce((sum, [_, secs]) => sum + (typeof secs === 'number' ? secs : 0), 0);
        const avgPerHour = (totalSec / 3600) / Math.max(activeHours.length, 1);
        data = [...Array(24)].map((_, hour) => activeHours.includes(hour) ? avgPerHour : 0);
      }
    }
  } else {
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

      if (days === 7) {
        labels.push(`${d.toLocaleDateString('en-US', { weekday: 'short' })} ${d.getDate()}`);
      } else {
        labels.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
      }

      if (currentAnalyticsChartType === 'focus') {
        const daySec = sessions.filter(s => s.date.startsWith(ds)).reduce((sum, s) => sum + (s.actual * (s.focusMinutes || 25) * 60), 0);
        data.push(+(daySec / 3600).toFixed(2));
      } else {
        const dayData = appData[ds] || {};
        const appEntries = Object.entries(dayData).filter(([k]) => !/^\d{2}$/.test(k));
        const daySec = appEntries.reduce((sum, [_, secs]) => sum + (typeof secs === 'number' ? secs : 0), 0);
        data.push(+(daySec / 3600).toFixed(2));
      }
    }
  }

  if (analyticsFocusChart) analyticsFocusChart.destroy();
  analyticsFocusChart = new Chart(focusCtx.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: chartLabel,
        data,
        backgroundColor: chartColor,
        borderRadius: 6,
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      plugins: { 
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: function(context) {
            let label = context.dataset.label || '';
            if (label) label += ': ';
            if (context.parsed.y !== null) {
              const totalMinutes = Math.round(context.parsed.y * 60);
              label += formatTimeMins(totalMinutes);
            }
            return label;
          }
        }
      }
    },
      scales: {
        y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b' } },
        x: { grid: { display: false }, ticks: { color: '#64748b', maxRotation: days === 30 ? 45 : 0 } }
      }
    }
  });
}

// Analytics view loader
function loadAnalyticsView() {
  const sessions = SessionStore.getSessions();
  const totalSec = sessions.reduce((s, x) => s + (x.actual * (x.focusMinutes || 25) * 60), 0);
  const el = (id) => document.getElementById(id);

  // ── Stat cards ──
  el('analytics-total-focus').textContent = formatTimeDisplay(totalSec);
  const avgScore = sessions.length > 0 ? Math.round(sessions.reduce((s, x) => s + Math.min(x.actual, x.estimate || x.actual) / Math.max(x.actual, x.estimate || 1, 1), 0) / sessions.length * 100) : 0;
  el('analytics-avg-score').textContent = `${avgScore}/100`;
  el('analytics-tasks').textContent = sessions.length;
  el('analytics-ratio').textContent = `${Math.min(100, Math.round(totalSec / (8 * 3600) * 100))}%`;

  // Render the interactive chart
  renderAnalyticsChart();

  // ── Heatmap (real data: 4 weeks × 7 days) ──
  const hm = document.getElementById('heatmap-grid');
  if (hm) {
    hm.innerHTML = '';
    for (let i = 27; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const daySec = sessions.filter(s => s.date.startsWith(ds)).reduce((sum, s) => sum + (s.actual * (s.focusMinutes || 25) * 60), 0);
      const intensity = Math.min(1, daySec / (6 * 3600)); // 6h = max intensity
      const cell = document.createElement('div');
      cell.className = 'heatmap-cell';
      cell.style.background = intensity > 0 ? `rgba(139,92,246,${0.15 + intensity * 0.85})` : 'rgba(255,255,255,0.04)';
      cell.title = `${d.toLocaleDateString()}: ${Math.round(daySec / 60)}m focus`;
      hm.appendChild(cell);
    }
  }

  // ── Sessions Breakdown ──
  // Best focus day
  const dayMap = {};
  sessions.forEach(s => {
    const dayKey = s.date.substring(0, 10);
    dayMap[dayKey] = (dayMap[dayKey] || 0) + (s.actual * (s.focusMinutes || 25) * 60);
  });
  const bestDay = Object.entries(dayMap).sort((a, b) => b[1] - a[1])[0];
  if (bestDay) {
    const bd = new Date(bestDay[0]);
    el('best-focus-day').textContent = bd.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  }

  // Longest Streak calculation
  const sortedDates = Object.keys(dayMap).sort();
  let maxStreak = 0;
  let currentStreak = 0;
  let lastDate = null;

  sortedDates.forEach(dateStr => {
    const currentDate = new Date(dateStr);
    if (lastDate) {
      const diffTime = Math.abs(currentDate - lastDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays === 1) {
        currentStreak++;
      } else {
        currentStreak = 1;
      }
    } else {
      currentStreak = 1;
    }
    maxStreak = Math.max(maxStreak, currentStreak);
    lastDate = currentDate;
  });
  el('longest-streak').textContent = `${maxStreak} Day${maxStreak === 1 ? '' : 's'}`;

  // Avg daily focus
  const dayCount = Object.keys(dayMap).length || 1;
  const avgDailySec = totalSec / dayCount;
  el('avg-daily-focus').textContent = formatTimeDisplay(avgDailySec);

  // Avg screen time
  const screenEl = el('stat-avg-screen-time');
  if (screenEl) {
    let totalScreen = 0, screenDays = 0;
    for (const [date, dayData] of Object.entries(appUsageData)) {
      const appEntries = Object.entries(dayData).filter(([k]) => !/^\d{2}$/.test(k));
      const sec = appEntries.reduce((s, [_, v]) => s + (typeof v === 'number' ? v : 0), 0);
      if (sec > 0) { totalScreen += sec; screenDays++; }
    }
    const avg = screenDays > 0 ? totalScreen / screenDays : 0;
    screenEl.textContent = `${Math.floor(avg / 3600)}h ${Math.floor((avg % 3600) / 60)}m`;
  }
}

// ── HISTORY CHARTS STATE ──
let historyFocusChart = null;
let historyAppChart = null;

// History view loader
async function loadHistoryView() {
  try {
    const freshData = await window.electronAPI.getScreenTime();
    if (freshData) {
      appUsageData = freshData;
      setAppUsageData(freshData); // Sync dashboard module cache
    }
  } catch (err) {
    console.warn('[History] Failed to fetch screen time:', err);
  }
  const sessions = SessionStore.getSessions();

  // Update History Table (Bug-10 Fix)
  if (historyBody) {
    historyBody.innerHTML = '';
    sessions.slice().reverse().forEach(s => {
      const row = document.createElement('tr');
      const denom = Math.max(s.actual, s.estimate || 1);
      const acc = denom > 0 ? Math.round((Math.min(s.actual, s.estimate || s.actual) / denom) * 100) : 0;
      appendTextCell(row, new Date(s.date).toLocaleDateString());
      appendTextCell(row, s.task || 'Untitled');
      appendTextCell(row, `${typeof s.actual === 'number' ? s.actual.toFixed(2) : s.actual} cycles`);
      const accCell = appendTextCell(row, `${acc}%`);
      accCell.style.color = acc >= 80 ? '#10b981' : '#f59e0b';
      historyBody.appendChild(row);
    });
  }

  // ── Focus Time Over Time (line chart, last 14 days) ──
  const focusCtx = document.getElementById('historyFocusChart');
  if (focusCtx) {
    const labels = [];
    const data = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      labels.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
      const daySec = sessions.filter(s => s.date.startsWith(ds)).reduce((sum, s) => sum + (s.actual * (s.focusMinutes || 25) * 60), 0);
      data.push(+(daySec / 3600).toFixed(2));
    }
    if (historyFocusChart) historyFocusChart.destroy();
    historyFocusChart = new Chart(focusCtx.getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Focus Hours',
          data,
          borderColor: '#8b5cf6',
          backgroundColor: 'rgba(139,92,246,0.1)',
          fill: true,
          tension: 0.4,
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: '#8b5cf6'
        }]
      },
      options: {
        responsive: true,
        plugins: { 
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function(context) {
                let label = context.dataset.label || '';
                if (label) label += ': ';
                if (context.parsed.y !== null) {
                  const totalMinutes = Math.round(context.parsed.y * 60);
                  label += formatTimeMins(totalMinutes);
                }
                return label;
              }
            }
          }
        },
        scales: {
          y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b' } },
          x: { grid: { display: false }, ticks: { color: '#64748b', maxRotation: 45 } }
        }
      }
    });
  }

  // ── Top Apps doughnut ──
  const appCtx = document.getElementById('historyAppChart');
  if (appCtx) {
    const aggregated = {};
    for (const [date, dayData] of Object.entries(appUsageData)) {
      for (const [app, secs] of Object.entries(dayData)) {
        if (!/^\d{2}$/.test(app) && typeof secs === 'number') {
          aggregated[app] = (aggregated[app] || 0) + secs;
        }
      }
    }
    const sorted = Object.entries(aggregated).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const colors = ['#8b5cf6', '#2dd4bf', '#3b82f6', '#ec4899', '#f59e0b'];
    if (historyAppChart) historyAppChart.destroy();
    historyAppChart = new Chart(appCtx.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: sorted.map(a => a[0]),
        datasets: [{ data: sorted.map(a => Math.round(a[1] / 60)), backgroundColor: colors.slice(0, sorted.length), borderWidth: 0 }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function(context) {
                let label = context.label || '';
                if (label) label += ': ';
                if (context.parsed !== null) {
                  label += formatTimeMins(context.parsed);
                }
                return label;
              }
            }
          }
        },
        cutout: '70%'
      }
    });
    // App list
    const list = document.getElementById('history-app-list');
    if (list) {
      list.innerHTML = '';
      sorted.forEach((app, i) => {
        const secs = app[1];
        const totalMinutes = Math.round(secs / 60);
        const timeLabel = secs < 60 ? `${Math.round(secs)}s` : formatTimeMins(totalMinutes);
        const item = document.createElement('div');
        item.className = 'usage-item';
        const info = document.createElement('div');
        info.className = 'usage-app-info';
        info.innerHTML = `<div class="usage-color" style="background: ${colors[i]}"></div>`;
        const nameSpan = document.createElement('span');
        nameSpan.textContent = app[0];
        info.appendChild(nameSpan);
        item.appendChild(info);
        const timeSpan = document.createElement('span');
        timeSpan.className = 'usage-time';
        timeSpan.textContent = timeLabel;
        item.appendChild(timeSpan);
        list.appendChild(item);
      });
    }
  }

  // Reuse dashboard loader for tables
  loadDashboardData();
}

// Zen Logic moved to modules/zen.js

// Drag logic moved to timer-ui.js

// Ad Skipper, Strict Mode Lockdown, and Volume Control Bridge moved to modules/strict.js

// Boot Sequence
document.addEventListener('DOMContentLoaded', () => {
  initZen();
  initDashboard();

  // Initialize Media Controls with a getter for dynamic state
  initMediaControls(() => ({
    isInBreakMode: window.SessionState ? window.SessionState.isInBreakMode : false,
    isSessionActive: activeSessionView.classList.contains('active'),
    isDashActive: dashView.classList.contains('active')
  }));

  // Keep startup errors from trapping the app behind the loading screen.
  const loader = document.getElementById('loading-screen');
  if (loader) {
    setTimeout(() => loader.classList.add('fade-out'), 1500);
  }

  // --- Session Control Definitions (BUG-11 FIX: Missing References) ---
  const sPause = document.getElementById('session-pause-btn');
  const sStop = document.getElementById('session-stop-btn');
  const sPlay = document.getElementById('session-play-btn');
  const sPrev = document.getElementById('prev-track');
  const sNext = document.getElementById('next-track');
  const sAddTask = document.getElementById('add-session-task-btn');
  const sToggle = document.getElementById('session-sidebar-toggle');

// renderZenContent() called inside initZen()

  // Set greeting based on time of day
  const hour = new Date().getHours();
  const greetEl = document.getElementById('greeting-text');
  if (greetEl) {
    if (hour < 12) greetEl.textContent = 'Good morning';
    else if (hour < 17) greetEl.textContent = 'Good afternoon';
    else greetEl.textContent = 'Good evening';
  }

  // Update Focus Studio sidebar stats
  const sessions = SessionStore.getSessions();
  const totalSec = sessions.reduce((s, x) => s + (x.actual * (x.focusMinutes || 25) * 60), 0);
  const tdw = document.getElementById('total-deep-work');
  if (tdw) tdw.textContent = `${Math.round(totalSec / 3600)} HRS`;
  const afs = document.getElementById('avg-focus-score');
  if (afs && sessions.length > 0) {
    const avg = Math.round(sessions.reduce((s, x) => s + Math.min(x.actual, x.estimate || x.actual) / Math.max(x.actual, x.estimate || 1, 1), 0) / sessions.length * 100);
    afs.textContent = `${avg}%`;
  }

  setTimeout(async () => {
    try {
      const screenTimeData = await window.electronAPI.getScreenTime();
      if (screenTimeData && typeof screenTimeData === 'object') {
        appUsageData = screenTimeData;
        setAppUsageData(screenTimeData); // Sync dashboard module cache
      } else {
        console.warn('[Dashboard] get-screen-time returned invalid data, using empty object');
        appUsageData = {};
        setAppUsageData({});
      }
    } catch (err) {
      console.warn('[Dashboard] Failed to fetch screen time data:', err);
      appUsageData = {};
      setAppUsageData({});
    }
    loadDashboardData();
    initCharts();
    updateUsageChart();
  }, 300);

  // -- NOTE MODAL LOGIC --
  const noteModal = document.getElementById('note-modal');
  const modalBody = document.getElementById('modal-note-body');
  const modalTitle = document.getElementById('modal-note-title');
  const modalDate = document.getElementById('modal-note-date');
  const editNoteBtn = document.getElementById('edit-note-btn');
  const saveEditBtn = document.getElementById('save-edit-btn');
  const cancelEditBtn = document.getElementById('cancel-edit-btn');
  const modalFormattingToolbar = document.querySelector('.modal-formatting-toolbar');
  const modalEditActions = document.querySelector('.modal-edit-actions');
  const closeModal = document.getElementById('close-modal');

// currentEditingNote moved to modules/zen.js

  // openNoteModal moved to modules/zen.js

// Session-specific UI logic (sidebar, media, checklist) has been moved to timer-ui.js and media-controls.js
});
