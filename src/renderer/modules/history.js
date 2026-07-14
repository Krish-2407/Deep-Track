/**
 * Phase 10: History Module
 * Handles session logs, historical charts, and past data tables.
 */

import { SessionStore } from '../data/session-store.js';

// Internal State
let historyFocusChart = null;
let historyAppChart = null;

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

function appendTextCell(row, value) {
  const cell = document.createElement('td');
  cell.textContent = value;
  row.appendChild(cell);
  return cell;
}

function getDateStr(d) {
  if (!d) d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Loads the History view table and charts
 */
export async function loadHistoryView() {
  let appData = {};
  try {
    const freshData = await window.electronAPI.getScreenTime();
    if (freshData) appData = freshData;
  } catch (err) {
    console.warn('[History] Failed to fetch screen time:', err);
  }
  
  const sessions = SessionStore.getSessions();
  const historyBody = document.getElementById('history-body');

  // History sessions table
  if (historyBody) {
    historyBody.innerHTML = '';
    sessions.slice().reverse().slice(0, 10).forEach(s => {
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

  // Focus Time Over Time (line chart, last 14 days)
  const focusCtx = document.getElementById('historyFocusChart');
  if (focusCtx) {
    const labels = [];
    const data = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const ds = getDateStr(d);
      labels.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
      const daySec = sessions.filter(s => s.date.startsWith(ds)).reduce((sum, s) => sum + (s.actual * (s.focusMinutes || 25) * 60), 0);
      data.push(+(daySec / 3600).toFixed(2));
    }
    if (historyFocusChart) {
      historyFocusChart.data.labels = labels;
      historyFocusChart.data.datasets[0].data = data;
      historyFocusChart.update();
    } else {
      historyFocusChart = new Chart(focusCtx.getContext('2d'), {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Focus Hours', data,
            borderColor: '#8b5cf6', backgroundColor: 'rgba(139,92,246,0.1)',
            fill: true, tension: 0.4, borderWidth: 2, pointRadius: 3, pointBackgroundColor: '#8b5cf6'
          }]
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b' } },
            x: { grid: { display: false }, ticks: { color: '#64748b', maxRotation: 45 } }
          }
        }
      });
    }
  }

  // Top Apps doughnut (all-time aggregation)
  const appCtx = document.getElementById('historyAppChart');
  if (appCtx) {
    const aggregated = {};
    for (const [date, dayData] of Object.entries(appData)) {
      for (const [app, secs] of Object.entries(dayData)) {
        if (!/^\d{2}$/.test(app) && typeof secs === 'number') {
          aggregated[app] = (aggregated[app] || 0) + secs;
        }
      }
    }
    const sorted = Object.entries(aggregated).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const colors = ['#8b5cf6', '#2dd4bf', '#3b82f6', '#ec4899', '#f59e0b'];
    if (historyAppChart) {
      historyAppChart.data.labels = sorted.map(a => a[0]);
      historyAppChart.data.datasets[0].data = sorted.map(a => Math.round(a[1] / 60));
      historyAppChart.data.datasets[0].backgroundColor = colors.slice(0, sorted.length);
      historyAppChart.update();
    } else {
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
                    // context.parsed is in minutes
                    const hours = Math.floor(context.parsed / 60);
                    const mins = context.parsed % 60;
                    if (context.parsed < 60) {
                      label += `${context.parsed} mins`;
                    } else if (mins === 0) {
                      label += `${hours} hr`;
                    } else {
                      label += `${hours} hr ${mins} mins`;
                    }
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

    const list = document.getElementById('history-app-list');
    if (list) {
      list.innerHTML = '';
      sorted.forEach((app, i) => {
        const secs = app[1];
        const timeLabel = formatTimeDisplay(secs);
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
}

/**
 * Boot sequence for History module
 */
export function initHistory() {
  console.log('[History Module] Initializing session history...');
  window.loadHistoryView = loadHistoryView;
}
