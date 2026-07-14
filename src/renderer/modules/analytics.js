/**
 * Phase 9: Analytics Module
 * Handles deep-dive charts, trend analysis, and productivity insights.
 */

import { SessionStore } from '../data/session-store.js';

// Internal State
let analyticsFocusChart = null;
let currentAnalyticsChartType = 'focus';
let currentAnalyticsTrendRange = 1;

function getLocalDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatTimeDisplay(totalSeconds) {
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} mins`;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (mins === 0) return `${hours} hr`;
  return `${hours} hr ${mins} mins`;
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

export function getDateStr(d) {
  if (!d) d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Toggles between Focus and Screen Time in Analytics view
 */
export function changeAnalyticsChartType(type) {
  currentAnalyticsChartType = type;
  document.querySelectorAll('#analytics-view .analytics-type-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.chartType === type);
  });
  const title = document.getElementById('analytics-chart-title');
  if (title) title.textContent = type === 'focus' ? 'Focus Time Over Time' : 'Screen Time Over Time';
  renderAnalyticsChart();
}

/**
 * Changes the trend range (1, 7, 30 days) in Analytics view
 */
export function changeAnalyticsTrendRange(days) {
  currentAnalyticsTrendRange = days;
  document.querySelectorAll('#analytics-view .analytics-range-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.rangeDays, 10) === days);
  });
  renderAnalyticsChart();
}

/**
 * Loads the Analytics view stats and triggers chart render
 */
export async function loadAnalyticsView() {
  const sessions = SessionStore.getSessions();
  const totalSec = sessions.reduce((s, x) => s + (x.actual * (x.focusMinutes || 25) * 60), 0);
  const el = (id) => document.getElementById(id);

  if (el('analytics-total-focus')) el('analytics-total-focus').textContent = formatTimeDisplay(totalSec);
  
  const avgScore = sessions.length > 0 
    ? Math.round(sessions.reduce((s, x) => s + Math.min(x.actual, x.estimate || x.actual) / Math.max(x.actual, x.estimate || 1, 1), 0) / sessions.length * 100) 
    : 0;
    
  if (el('analytics-avg-score')) el('analytics-avg-score').textContent = `${avgScore}/100`;
  if (el('analytics-tasks')) el('analytics-tasks').textContent = sessions.length;
  if (el('analytics-ratio')) el('analytics-ratio').textContent = `${Math.min(100, Math.round(totalSec / (8 * 3600) * 100))}%`;

  // Streak Calculation
  const dayMap = {};
  sessions.forEach(s => dayMap[s.date.split('T')[0]] = true);
  const sortedDates = Object.keys(dayMap).sort();
  let maxStreak = 0, currentStreak = 0, lastDate = null;
  
  sortedDates.forEach(dateStr => {
    const currentDate = new Date(dateStr);
    if (lastDate) {
      const diff = (currentDate - lastDate) / (1000 * 60 * 60 * 24);
      if (diff === 1) currentStreak++;
      else currentStreak = 1;
    } else {
      currentStreak = 1;
    }
    maxStreak = Math.max(maxStreak, currentStreak);
    lastDate = currentDate;
  });
  
  if (el('longest-streak')) el('longest-streak').textContent = `${maxStreak} Day${maxStreak === 1 ? '' : 's'}`;
  
  const dayCount = Object.keys(dayMap).length || 1;
  if (el('avg-daily-focus')) el('avg-daily-focus').textContent = formatTimeDisplay(totalSec / dayCount);

  // Heatmap Rendering
  const hm = document.getElementById('heatmap-grid');
  if (hm) {
    hm.innerHTML = '';

    // Setup custom floating glassmorphic tooltip in document body if missing
    let tooltip = document.getElementById('heatmap-tooltip');
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'heatmap-tooltip';
      tooltip.className = 'heatmap-tooltip';
      document.body.appendChild(tooltip);
    }

    const inspector = document.getElementById('heatmap-inspector');
    if (inspector) {
      inspector.innerHTML = 'Click a cell to inspect daily focus logs';
      inspector.classList.remove('highlight');
    }

    for (let i = 27; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const ds = getDateStr(d);
      
      const daySessions = sessions.filter(s => s.date.startsWith(ds));
      const daySec = daySessions.reduce((sum, s) => sum + (s.actual * (s.focusMinutes || 25) * 60), 0);
      const completedCount = daySessions.reduce((sum, s) => sum + s.actual, 0);

      // Determine focus intensity tier parameters
      let tier = 0;
      let tierLabel = "Rest Day 💤";
      let cellColor = "rgba(255, 255, 255, 0.04)";

      if (daySec > 0 && daySec < 3600) {
        tier = 1;
        tierLabel = "Light Focus 🌱";
        cellColor = "rgba(168, 85, 247, 0.2)";
      } else if (daySec >= 3600 && daySec < 3 * 3600) {
        tier = 2;
        tierLabel = "Moderate Focus ⚡";
        cellColor = "rgba(168, 85, 247, 0.45)";
      } else if (daySec >= 3 * 3600 && daySec < 5 * 3600) {
        tier = 3;
        tierLabel = "Heavy Focus 🔥";
        cellColor = "rgba(168, 85, 247, 0.7)";
      } else if (daySec >= 5 * 3600) {
        tier = 4;
        tierLabel = "Peak Focus 👑";
        cellColor = "rgba(168, 85, 247, 0.95)";
      }

      const cell = document.createElement('div');
      cell.className = 'heatmap-cell';
      cell.style.background = cellColor;

      // Add peak tier visual drop glow shadow
      if (tier === 4) {
        cell.style.boxShadow = '0 0 6px rgba(168, 85, 247, 0.35)';
      }

      // 1. Positioned Cursor Hover Tooltip Event Listeners
      cell.addEventListener('mouseenter', () => {
        const dateFormatted = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
        const focusDurationFormatted = formatTimeDisplay(daySec);

        tooltip.innerHTML = `
          <div class="tooltip-date">${dateFormatted}</div>
          <div class="tooltip-stat-row">
            <span class="tooltip-focus-val">${focusDurationFormatted}</span>
            <span class="tooltip-divider"></span>
            <span class="tooltip-tier">${tierLabel}</span>
          </div>
        `;
        tooltip.classList.add('visible');
      });

      cell.addEventListener('mousemove', (e) => {
        tooltip.style.left = `${e.clientX}px`;
        tooltip.style.top = `${e.clientY}px`;
      });

      cell.addEventListener('mouseleave', () => {
        tooltip.classList.remove('visible');
      });

      // 2. Interactive Click Inline Inspector Event Listener
      cell.addEventListener('click', (e) => {
        e.stopPropagation();

        // Highlight selected cell
        document.querySelectorAll('.heatmap-cell').forEach(c => c.classList.remove('active-inspect'));
        cell.classList.add('active-inspect');

        if (inspector) {
          const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
          const timeStr = formatTimeDisplay(daySec);
          const cycleStr = `${completedCount} Cycle${completedCount === 1 ? '' : 's'}`;
          
          inspector.innerHTML = `${dateStr}: <span class="bold-val">${timeStr}</span> Focused (<span class="tier-tag">${tierLabel}</span>) — ${cycleStr}`;
          inspector.classList.add('highlight');
        }
      });

      hm.appendChild(cell);
    }
  }

  // Best focus day
  const dailyFocusMap = {};
  sessions.forEach(s => {
    const dayKey = s.date.substring(0, 10);
    dailyFocusMap[dayKey] = (dailyFocusMap[dayKey] || 0) + (s.actual * (s.focusMinutes || 25) * 60);
  });
  const bestDayEntry = Object.entries(dailyFocusMap).sort((a, b) => b[1] - a[1])[0];
  if (bestDayEntry && el('best-focus-day')) {
    const bd = new Date(bestDayEntry[0]);
    el('best-focus-day').textContent = bd.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  }

  await renderAnalyticsChart();
}


/**
 * Renders the main chart in the Analytics view
 */
export async function renderAnalyticsChart() {
  const focusCtx = document.getElementById('analyticsFocusChart');
  if (!focusCtx) return;

  const sessions = SessionStore.getSessions();
  const appData = await window.electronAPI.getScreenTime() || {};

  const labels = [];
  let data = [];
  const days = currentAnalyticsTrendRange;
  const today = getLocalDateStr();

  let chartColor = currentAnalyticsChartType === 'focus' ? '#8b5cf6' : '#2dd4bf';
  let chartLabel = currentAnalyticsChartType === 'focus' ? 'Focus Hours' : 'Screen Time (Hours)';

  if (days === 1) {
    labels.push(...[...Array(24)].map((_, i) => `${i}:00`));
    if (currentAnalyticsChartType === 'focus') {
      data = [...Array(24)].map((_, hour) => {
        const hourSessions = sessions.filter(s => {
          const sd = new Date(s.date);
          return getDateStr(sd) === today && sd.getHours() === hour;
        });
        return hourSessions.reduce((sum, s) => sum + (s.actual * (s.focusMinutes || 25) * 60), 0) / 3600;
      });
    } else {
      const todayData = appData[today] || {};
      data = [...Array(24)].map((_, hour) => {
        const hourStr = String(hour).padStart(2, '0');
        const hourData = todayData[hourStr] || {};
        return Object.values(hourData).reduce((sum, s) => sum + (typeof s === 'number' ? s : 0), 0) / 3600;
      });
    }
  } else {
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const ds = getDateStr(d);
      labels.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));

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

  if (analyticsFocusChart) {
    analyticsFocusChart.data.labels = labels;
    analyticsFocusChart.data.datasets[0].label = chartLabel;
    analyticsFocusChart.data.datasets[0].data = data;
    analyticsFocusChart.data.datasets[0].backgroundColor = chartColor;
    analyticsFocusChart.update();
  } else {
    analyticsFocusChart = new Chart(focusCtx.getContext('2d'), {
      type: 'bar',
      data: {
        labels,
        datasets: [{ label: chartLabel, data, backgroundColor: chartColor, borderRadius: 6, borderWidth: 0 }]
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
          x: { grid: { display: false }, ticks: { color: '#64748b' } }
        }
      }
    });
  }
}

/**
 * Boot sequence for Analytics module
 */
export function initAnalytics() {
  console.log('[Analytics Module] Initializing deep-dive components...');

  // Bind Analytics Toggles
  document.querySelectorAll('#analytics-view .analytics-type-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const type = e.currentTarget.dataset.chartType || 'focus';
      changeAnalyticsChartType(type);
    });
  });

  document.querySelectorAll('#analytics-view .analytics-range-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const days = parseInt(e.currentTarget.dataset.rangeDays, 10);
      if (!isNaN(days)) changeAnalyticsTrendRange(days);
    });
  });

  window.loadAnalyticsView = loadAnalyticsView;
}
