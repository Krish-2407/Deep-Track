/**
 * Phase 8: Dashboard Module
 * Handles metrics calculation, chart rendering, and dashboard UI updates.
 * 
 * This module isolates the dashboard-specific logic from renderer.js,
 * adhering to the "read-only" principle for dashboard data.
 */

import { SessionStore } from '../data/session-store.js';
import { SettingsStore } from '../data/settings-store.js';

// Internal State
let appUsageData = {};
let trendChart = null;
let usageChart = null;
let currentTrendRange = 1;
let currentChartType = 'focus'; // 'focus' or 'screentime'

/**
 * Helper: Get current local date string (YYYY-MM-DD)
 */
function getLocalDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Helper: Format seconds into human readable time (e.g. 1h 20m or 45m)
 */
function formatTimeDisplay(totalSeconds) {
  const totalMinutes = Math.floor(totalSeconds / 60);
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

/**
 * Helper: Append text cell to a table row
 */
function appendTextCell(row, value) {
  const cell = document.createElement('td');
  cell.textContent = value;
  row.appendChild(cell);
  return cell;
}

// --- Public API ---

/**
 * Updates the internal app usage data cache
 */
export function setAppUsageData(data) {
  appUsageData = data || {};
}

/**
 * Returns the current app usage data cache
 */
export function getAppUsageData() {
  return appUsageData;
}

/**
 * Changes the trend range (1, 7, 30 days) and refreshes views
 */
export async function changeTrendRange(days) {
  currentTrendRange = days;
  try {
    const freshData = await window.electronAPI.getScreenTime();
    if (freshData) appUsageData = freshData;
  } catch (err) {
    console.warn('[Dashboard] Failed to fetch screen time on range change:', err);
  }
  loadDashboardData();
  initCharts();
}

/**
 * Toggles between Focus Time and Screen Time charts
 */
export function changeDashboardChartType(type) {
  currentChartType = type;
  // Update the chart-toggle buttons
  const chartToggleBtns = document.querySelectorAll('#dash-view .chart-toggle .toggle-btn');
  chartToggleBtns.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.chartType === type);
  });

  // Update the chart title
  const chartTitle = document.querySelector('#dash-view .chart-card-large .card-header h3');
  if (chartTitle) {
    chartTitle.textContent = type === 'focus' ? 'Focus Time Over Time' : 'Screen Time Over Time';
  }

  initCharts();
}

/**
 * Main dashboard data loader - updates all stat cards and tables
 */
export function loadDashboardData() {
  try {
    const sessions = SessionStore.getSessions();
    const today = getLocalDateStr();
    
    if (!appUsageData) appUsageData = {};

  const rangeLabels = [...Array(currentTrendRange)].map((_, i) => {
    const d = new Date(); d.setDate(d.getDate() - i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  const filteredSessions = sessions.filter(s => rangeLabels.some(day => s.date.startsWith(day)));

  // 1. Today's Screen Time
  const todayScreenData = appUsageData[today] || {};
  const todayScreenEntries = Object.entries(todayScreenData).filter(([key]) => !/^\d{2}$/.test(key));
  const todayScreenSeconds = todayScreenEntries.reduce((sum, [_, s]) => sum + (typeof s === 'number' ? s : 0), 0);
  const statTodayScreenTime = document.getElementById('stat-today-screen-time');
  if (statTodayScreenTime) statTodayScreenTime.textContent = formatTimeDisplay(todayScreenSeconds);

  // 2. Average Daily Screen Time
  let totalScreenTime = 0;
  let daysWithData = 0;
  rangeLabels.forEach(dateStr => {
    const dayScreenData = appUsageData[dateStr] || {};
    const appEntries = Object.entries(dayScreenData).filter(([key]) => !/^\d{2}$/.test(key));
    const daySeconds = appEntries.reduce((sum, [_, s]) => sum + (typeof s === 'number' ? s : 0), 0);
    if (daySeconds > 0) {
      totalScreenTime += daySeconds;
      daysWithData++;
    }
  });
  const avgScreenSeconds = rangeLabels.length > 0 ? (totalScreenTime / rangeLabels.length) : 0;

  const statAvgScreenTime = document.getElementById('stat-avg-screen-time');
  if (statAvgScreenTime) statAvgScreenTime.textContent = formatTimeDisplay(avgScreenSeconds || 0);

  // 3. Today's Focus Hours
  const todaySeconds = sessions
    .filter(s => s.date.startsWith(today))
    .reduce((sum, s) => sum + (s.actual * (s.focusMinutes || 25) * 60), 0);

  const th = Math.floor(todaySeconds / 3600);
  const statTodayTime = document.getElementById('stat-today-time');
  if (statTodayTime) statTodayTime.textContent = formatTimeDisplay(todaySeconds);

  // 4. Today's Cycles
  const todayCycles = sessions.filter(s => s.date.startsWith(today)).reduce((sum, s) => sum + (s.actual || 0), 0);
  const statCycles = document.getElementById('stat-cycles');
  if (statCycles) statCycles.textContent = typeof todayCycles === 'number' ? todayCycles.toFixed(2) : todayCycles;

  const statBlocked = document.getElementById('stat-blocked');
  if (statBlocked) statBlocked.textContent = "0";

  // 5. Focus Score / Accuracy
  const statFocusScore = document.getElementById('stat-focus-score');
  const statAccuracy = document.getElementById('stat-accuracy');
  if (filteredSessions.length > 0) {
    const avgAcc = filteredSessions.reduce((sum, s) => {
      const denom = Math.max(s.actual, s.estimate || 1);
      return sum + (denom > 0 ? Math.min(s.actual, s.estimate || s.actual || 1) / denom : 0);
    }, 0) / filteredSessions.length;
    if (statAccuracy) statAccuracy.textContent = Math.round(avgAcc * 100) + '%';
    if (statFocusScore) statFocusScore.textContent = formatTimeDisplay(todaySeconds);
  } else {
    if (statAccuracy) statAccuracy.textContent = '0%';
    if (statFocusScore) statFocusScore.textContent = '0m';
  }

  // 5.5 Streak Calculation
  let currentStreak = 0;
  const dayMap = {};
  sessions.forEach(s => {
    const d = new Date(s.date);
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    dayMap[ds] = true;
  });
  const sortedDates = Object.keys(dayMap).sort();
  
  if (sortedDates.length > 0) {
    let tempStreak = 0;
    let lastDateObj = null;
    
    sortedDates.forEach(dateStr => {
      const [y, m, d] = dateStr.split('-');
      const currentDate = new Date(y, m - 1, d);
      if (lastDateObj) {
        const diffDays = Math.round((currentDate - lastDateObj) / (1000 * 60 * 60 * 24));
        if (diffDays === 1) tempStreak++;
        else tempStreak = 1;
      } else {
        tempStreak = 1;
      }
      lastDateObj = currentDate;
    });

    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = `${yesterdayDate.getFullYear()}-${String(yesterdayDate.getMonth() + 1).padStart(2, '0')}-${String(yesterdayDate.getDate()).padStart(2, '0')}`;
    
    const lastActiveDateStr = sortedDates[sortedDates.length - 1];
    if (lastActiveDateStr === today || lastActiveDateStr === yesterdayStr) {
      currentStreak = tempStreak;
    } else {
      currentStreak = 0;
    }
  }
  const statStreak = document.getElementById('streak-days');
  if (statStreak) statStreak.textContent = `${currentStreak} DAYS`;
    // 6. Greeting & Greeting Progress
    const greetingEl = document.getElementById('greeting-text');
    const hour = new Date().getHours();
    if (greetingEl) {
      if (hour < 12) greetingEl.textContent = "Good morning";
      else if (hour < 18) greetingEl.textContent = "Good afternoon";
      else greetingEl.textContent = "Good evening";
    }

    const target = getDailyGoalTarget();
    const percent = Math.min(100, Math.round((todaySeconds / (target * 3600)) * 100));

    const completionEl = document.getElementById('dash-completion');
    if (completionEl) {
      completionEl.textContent = `${percent}%`;
    }

    const fill = document.getElementById('daily-progress-fill');
    if (fill) {
      fill.style.width = `${percent}%`;
    }

    const progressText = document.getElementById('daily-progress-text');
    if (progressText) {
      const currentHrs = Math.floor(todaySeconds / 3600);
      const currentMins = Math.floor((todaySeconds % 3600) / 60);
      const currentTimeStr = currentHrs > 0 ? `${currentHrs}h ${currentMins}m` : `${currentMins}m`;
      progressText.textContent = percent >= 100
        ? `Goal reached! 🎉 Completed ${currentTimeStr} focus today.`
        : `Keep going! ${percent}% achieved (${currentTimeStr} / ${target}h)`;
    }

    // 7. Daily Review Text
    const reviewEl = document.getElementById('daily-review-text');
    if (reviewEl) {
      if (th >= 6) reviewEl.textContent = "Elite Focus! You're a machine today.";
      else if (th >= 3) reviewEl.textContent = "Solid progress. Keep the momentum.";
      else if (th >= 1) reviewEl.textContent = "Good start, but there's room for more.";
      else reviewEl.textContent = "Waiting for you to get in the zone...";
    }

    // 8. Tables
    const dailyScreentimeBody = document.getElementById('daily-screentime-body');
    if (dailyScreentimeBody) loadDailyScreentimeTable();

    const historyBody = document.getElementById('history-body');
    if (historyBody) {
      historyBody.innerHTML = '';
      sessions.slice().reverse().slice(0, 5).forEach(s => {
        const row = document.createElement('tr');
        const denom = Math.max(s.actual, s.estimate);
        const acc = denom > 0 ? Math.round((Math.min(s.actual, s.estimate) / denom) * 100) : 0;
        appendTextCell(row, new Date(s.date).toLocaleDateString());
        appendTextCell(row, s.task || 'Untitled');
        appendTextCell(row, typeof s.actual === 'number' ? s.actual.toFixed(2) : s.actual);
        const accCell = appendTextCell(row, `${acc}%`);
        accCell.style.color = acc >= 80 ? '#10b981' : '#f59e0b';
        historyBody.appendChild(row);
      });
    }
  } catch (err) {
    console.error('[Dashboard] Critical error in loadDashboardData:', err);
  }
}

/**
 * Renders the daily screen time summary table
 */
export function loadDailyScreentimeTable() {
  const dailyScreentimeBody = document.getElementById('daily-screentime-body');
  if (!dailyScreentimeBody) return;
  
  dailyScreentimeBody.innerHTML = '';
  const todayStr = getLocalDateStr();

  // Get all dates in appUsageData, filter for standard date keys, sort descending, and limit to 10 days
  const dates = Object.keys(appUsageData)
    .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort((a, b) => b.localeCompare(a))
    .slice(0, 10);

  dates.forEach(dateStr => {
    const dayData = appUsageData[dateStr] || {};
    const appEntries = Object.entries(dayData).filter(([key]) => !/^\d{2}$/.test(key));
    const totalSeconds = appEntries.reduce((sum, [_, secs]) => sum + (typeof secs === 'number' ? secs : 0), 0);

    if (totalSeconds === 0) return; 

    const [year, month, day] = dateStr.split('-');
    // Create Date object using local numbers (avoid timezone offsets shifting the display date)
    const d = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    const displayDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const isToday = dateStr === todayStr;

    const topApp = appEntries.sort((a, b) => b[1] - a[1])[0];
    const topAppName = topApp ? topApp[0] : 'N/A';
    const appCount = appEntries.length;

    const row = document.createElement('tr');
    appendTextCell(row, isToday ? 'Today' : displayDate);
    appendTextCell(row, formatTimeDisplay(totalSeconds));
    appendTextCell(row, topAppName);
    appendTextCell(row, `${appCount} apps`);
    dailyScreentimeBody.appendChild(row);
  });
}

/**
 * Initializes charts (Trend and Usage)
 */
export function initCharts() {
  const trendCanvas = document.getElementById('focusTrendChart');
  if (!trendCanvas) return;
  
  const trendCtx = trendCanvas.getContext('2d');
  const sessions = SessionStore.getSessions();

  let labels = [];
  let dayTotals = [];
  let chartLabel = 'Focus Hours';
  let chartColor = '#8b5cf6'; 

  if (currentChartType === 'focus') {
    labels = [...Array(24)].map((_, i) => `${i}:00`);
    const today = getLocalDateStr();
    dayTotals = [...Array(24)].map((_, hour) => {
      const hourSessions = sessions.filter(s => {
        const sessionDate = new Date(s.date);
        const sessionLocalDate = `${sessionDate.getFullYear()}-${String(sessionDate.getMonth() + 1).padStart(2, '0')}-${String(sessionDate.getDate()).padStart(2, '0')}`;
        return sessionLocalDate === today && sessionDate.getHours() === hour;
      });
      const totalSeconds = hourSessions.reduce((sum, s) => sum + (s.actual * (s.focusMinutes || 25) * 60), 0);
      return totalSeconds / 3600;
    });
    chartLabel = 'Focus Hours';
    chartColor = '#8b5cf6';
  } else {
    labels = [...Array(24)].map((_, i) => `${i}:00`);
    const today = getLocalDateStr();
    const todayData = appUsageData[today] || {};

    const hasHourlyData = [...Array(24)].some((_, h) => {
      const hourStr = String(h).padStart(2, '0');
      return todayData[hourStr] && Object.keys(todayData[hourStr]).length > 0;
    });

    if (hasHourlyData) {
      dayTotals = [...Array(24)].map((_, hour) => {
        const hourStr = String(hour).padStart(2, '0');
        const hourData = todayData[hourStr] || {};
        const totalSeconds = Object.values(hourData).reduce((sum, s) => sum + (typeof s === 'number' ? s : 0), 0);
        return totalSeconds / 3600;
      });
    } else {
      const appEntries = Object.entries(todayData).filter(([key]) => !/^\d{2}$/.test(key));
      const totalSeconds = appEntries.reduce((sum, [_, secs]) => sum + (typeof secs === 'number' ? secs : 0), 0);
      const totalHours = totalSeconds / 3600;
      const activeHours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
      const avgPerHour = totalHours / Math.max(activeHours.length, 1);
      dayTotals = [...Array(24)].map((_, hour) => activeHours.includes(hour) ? avgPerHour : 0);
    }
    chartLabel = 'Screen Time (Hours)';
    chartColor = '#2dd4bf';
  }

  if (trendChart) {
    trendChart.data.labels = labels;
    trendChart.data.datasets[0].label = chartLabel;
    trendChart.data.datasets[0].data = dayTotals;
    trendChart.data.datasets[0].backgroundColor = chartColor;
    trendChart.data.datasets[0].borderColor = chartColor;
    trendChart.update('none'); // Skip animation on data updates to prevent jank
  } else {
    trendChart = new Chart(trendCtx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: chartLabel,
          data: dayTotals,
          backgroundColor: chartColor,
          borderColor: chartColor,
          borderWidth: 0,
          borderRadius: 4
        }]
      },
      options: {
        animation: { duration: 600 }, // Short initial animation, subsequent updates use 'none'
        responsive: true,
        plugins: { 
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function(context) {
                let label = context.dataset.label || '';
                if (label) label += ': ';
                if (context.parsed.y !== null) {
                  label += Math.round(context.parsed.y * 60) + 'm';
                }
                return label;
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: { color: '#64748b' },
            title: { display: true, text: 'Hours', color: '#64748b' }
          },
          x: {
            grid: { display: false },
            ticks: { color: '#64748b' }
          }
        }
      }
    });
  }

  updateUsageChart();
}

/**
 * Renders the doughnut chart for top apps
 */
export function updateUsageChart() {
  const usageCanvas = document.getElementById('appUsageChart');
  if (!usageCanvas) return;
  const usageCtx = usageCanvas.getContext('2d');
  const usageList = document.getElementById('app-usage-list');

  const aggregatedData = {};
  const today = new Date();

  for (let i = 0; i < currentTrendRange; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dayData = appUsageData[dateStr] || {};
    for (const [app, seconds] of Object.entries(dayData)) {
      if (!/^\d{2}$/.test(app) && typeof seconds === 'number') {
        aggregatedData[app] = (aggregatedData[app] || 0) + seconds;
      }
    }
  }

  const sortedApps = Object.entries(aggregatedData)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const highContrastColors = ['#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#8b5cf6'];
  const colors = highContrastColors.slice(0, sortedApps.length);

  const data = {
    labels: sortedApps.map(a => a[0]),
    datasets: [{
      data: sortedApps.map(a => Math.round(a[1] / 60)),
      backgroundColor: colors,
      borderWidth: 0
    }]
  };

  if (usageList) {
    usageList.innerHTML = '';
    sortedApps.forEach((app, i) => {
      const secs = app[1];
      const timeLabel = formatTimeDisplay(secs);
      const item = document.createElement('div');
      item.className = 'usage-item';
      const info = document.createElement('div');
      info.className = 'usage-app-info';
      info.innerHTML = `<div class="usage-color" style="background: ${highContrastColors[i]}"></div>`;
      const nameSpan = document.createElement('span');
      nameSpan.textContent = app[0];
      info.appendChild(nameSpan);
      item.appendChild(info);
      const timeSpan = document.createElement('span');
      timeSpan.className = 'usage-time';
      timeSpan.textContent = timeLabel;
      item.appendChild(timeSpan);
      usageList.appendChild(item);
    });
  }

  if (usageChart) {
    usageChart.data.labels = sortedApps.map(a => a[0]);
    usageChart.data.datasets[0].data = sortedApps.map(a => Math.round(a[1] / 60));
    usageChart.data.datasets[0].backgroundColor = colors;
    usageChart.update('none'); // Skip animation on data updates to prevent jank
  } else {
    usageChart = new Chart(usageCtx, {
      type: 'doughnut',
      data: data,
      options: {
        animation: { duration: 600 },
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
  }
}

/** Singleton AudioContext — avoids memory leak from creating a new one per call (fix: C1) */
let _dashAudioCtx = null;

function getDashAudioContext() {
  if (!_dashAudioCtx || _dashAudioCtx.state === 'closed') {
    _dashAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (_dashAudioCtx.state === 'suspended') {
    _dashAudioCtx.resume();
  }
  return _dashAudioCtx;
}

export function getDailyGoalTarget() {
  const raw = localStorage.getItem('deepwork-daily-target');
  if (!raw) {
    try {
      const config = SettingsStore.getSettings();
      if (config && config.defaultTarget) {
        return config.defaultTarget / 60;
      }
    } catch (e) {}
    return 4; // default 4 hours (matching 240 mins in default settings)
  }
  const parsed = parseFloat(raw);
  // Clamp to valid range in case of corrupted storage (fix: C3)
  if (isNaN(parsed)) return 4;
  return Math.max(1, Math.min(12, parsed));
}

export function isDailyGoalLocked() {
  const lockedDay = localStorage.getItem('deepwork-daily-target-locked-day');
  return lockedDay === getLocalDateStr();
}

/** Helper: format hours number consistently — strips trailing .0 (fix: W2) */
function formatHours(val) {
  return Number.isInteger(val) ? String(val) : val.toFixed(1);
}

/** Helper: safely set lock button label without innerHTML (fix: C2) */
function setLockBtnContent(btn, iconName, labelText) {
  btn.innerHTML = ''; // clear
  const icon = document.createElement('span');
  icon.className = 'material-icons-outlined';
  icon.textContent = iconName;
  const label = document.createElement('span');
  label.textContent = labelText;
  btn.appendChild(icon);
  btn.appendChild(label);
}

function updateTargetControlsLockState() {
  const slider = document.getElementById('target-range-slider');
  const displayVal = document.getElementById('target-hours-val');
  const presetBtns = document.querySelectorAll('.preset-btn');
  const lockBtn = document.getElementById('lock-target-btn');

  if (!slider || !displayVal || !lockBtn) return;

  const isLocked = isDailyGoalLocked();

  if (isLocked) {
    slider.disabled = true;
    slider.setAttribute('aria-disabled', 'true'); // fix: W1
    slider.style.opacity = '0.4';
    slider.style.pointerEvents = 'none';

    presetBtns.forEach(btn => {
      btn.disabled = true;
      btn.setAttribute('aria-disabled', 'true'); // fix: W1
      btn.style.opacity = '0.4';
      btn.style.pointerEvents = 'none';
    });

    lockBtn.disabled = true;
    lockBtn.setAttribute('aria-disabled', 'true'); // fix: W1
    lockBtn.setAttribute('title', 'Daily target is locked. Resets at midnight.'); // fix: I2
    lockBtn.style.borderColor = 'rgba(139, 92, 246, 0.2)';
    lockBtn.style.background = 'rgba(139, 92, 246, 0.05)';
    lockBtn.style.color = 'var(--muted)';
    lockBtn.style.cursor = 'not-allowed';
    setLockBtnContent(lockBtn, 'lock', 'Locked Until Midnight'); // fix: C2
  } else {
    slider.disabled = false;
    slider.setAttribute('aria-disabled', 'false');
    slider.style.opacity = '';
    slider.style.pointerEvents = '';

    presetBtns.forEach(btn => {
      btn.disabled = false;
      btn.setAttribute('aria-disabled', 'false');
      btn.style.opacity = '';
      btn.style.pointerEvents = '';
    });

    lockBtn.disabled = false;
    lockBtn.setAttribute('aria-disabled', 'false');
    lockBtn.removeAttribute('title');
    lockBtn.style.borderColor = '';
    lockBtn.style.background = '';
    lockBtn.style.color = '';
    lockBtn.style.cursor = '';
    setLockBtnContent(lockBtn, 'lock', 'Lock Target'); // fix: C2
  }
}

function playSuccessSound() {
  try {
    const audioCtx = getDashAudioContext(); // fix: C1 — reuse singleton
    const freqs = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    const duration = 0.15;
    
    freqs.forEach((freq, index) => {
      const time = audioCtx.currentTime + index * 0.1;
      const osc = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, time);
      
      gainNode.gain.setValueAtTime(0.15, time);
      gainNode.gain.exponentialRampToValueAtTime(0.001, time + duration);
      
      osc.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      osc.start(time);
      osc.stop(time + duration);
    });
  } catch (e) {
    console.warn('[Dashboard Audio] Sound synthesis failed:', e);
  }
}

/**
 * Boot sequence for Dashboard module
 * NOTE: Does NOT call loadDashboardData/initCharts here — the boot sequence
 * in renderer.js triggers those after the async screen-time IPC call resolves.
 */
export function initDashboard() {
  console.log('[Dashboard Module] Initializing dashboard component...');
  
  // Bind Chart Toggles (Dashboard)
  document.querySelectorAll('#dash-view .chart-toggle .toggle-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const type = e.currentTarget.dataset.chartType || 'focus';
      changeDashboardChartType(type);
    });
  });

  // Initialize Daily Target Settings UI controls
  const slider = document.getElementById('target-range-slider');
  const displayVal = document.getElementById('target-hours-val');
  const presetBtns = document.querySelectorAll('.preset-btn');
  const lockBtn = document.getElementById('lock-target-btn'); // fix: W3 — now included in guard below

  if (slider && displayVal && lockBtn) { // fix: W3 — guard all three required elements
    const savedTarget = getDailyGoalTarget();
    slider.value = savedTarget;
    displayVal.textContent = formatHours(savedTarget); // fix: W2 — consistent format

    // Toggle active preset button if savedTarget matches a preset
    presetBtns.forEach(btn => {
      const btnHours = parseFloat(btn.dataset.hours);
      btn.classList.toggle('active', btnHours === savedTarget);
    });

    // Apply commitment lock state on load
    updateTargetControlsLockState();

    // Slider input change
    slider.addEventListener('input', () => {
      if (isDailyGoalLocked()) return;
      const val = parseFloat(slider.value);
      displayVal.textContent = formatHours(val); // fix: W2
      
      presetBtns.forEach(btn => {
        const btnHours = parseFloat(btn.dataset.hours);
        btn.classList.toggle('active', btnHours === val);
      });
    });

    // Preset button clicks
    presetBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (isDailyGoalLocked()) return;
        const hours = parseFloat(e.currentTarget.dataset.hours);
        slider.value = hours;
        displayVal.textContent = formatHours(hours); // fix: W2
        
        presetBtns.forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
      });
    });

    // Lock Target click
    lockBtn.addEventListener('click', () => {
      if (isDailyGoalLocked()) return;
      
      // Clamp finalVal to valid range before storing (fix: C3)
      const rawVal = parseFloat(slider.value);
      const finalVal = isNaN(rawVal) ? 6 : Math.max(1, Math.min(12, rawVal));
      
      localStorage.setItem('deepwork-daily-target', String(finalVal));
      localStorage.setItem('deepwork-daily-target-locked-day', getLocalDateStr());
      
      // Sync to SettingsStore
      try {
        const config = JSON.parse(localStorage.getItem('sm_settings') || '{}');
        config.defaultTarget = finalVal * 60;
        localStorage.setItem('sm_settings', JSON.stringify(config));
        
        // Update the form input if it's rendered
        const targetInput = document.getElementById('setting-defaultTarget');
        if (targetInput) {
           targetInput.value = config.defaultTarget;
           targetInput.dispatchEvent(new Event('change'));
        }
      } catch (e) {}
      
      // Play arpeggio audio tone
      playSuccessSound();

      // Success feedback — safe DOM construction, no innerHTML interpolation (fix: C2)
      lockBtn.style.borderColor = '#10b981';
      lockBtn.style.background = 'rgba(16, 185, 129, 0.12)';
      setLockBtnContent(lockBtn, 'check_circle', `Target Locked! (${formatHours(finalVal)}h)`);
      
      // Dynamic stats refresh
      loadDashboardData();

      setTimeout(() => {
        updateTargetControlsLockState();
      }, 1500); // Transitions to permanently locked UI after success feedback
    });
  }

  window.addEventListener('settings-updated', () => {
    try {
      loadDashboardData();
    } catch (e) {}
  });

  // Re-expose only what's absolutely necessary for other modules or orchestration
  window.loadDashboardData = loadDashboardData;
}

export function getTrendRange() {
  return currentTrendRange;
}

