if (window.electronAPI && window.electronAPI.isPackaged) {
  console.log = function() {};
  console.warn = function() {};
}

const root = document.getElementById('overlay-root');
const bubbleButton = document.getElementById('bubble-button');
const collapseButton = document.getElementById('collapse-button');
const sessionMode = document.getElementById('session-mode');
const sessionTime = document.getElementById('session-time');
const sessionToggle = document.getElementById('session-toggle');
const trackName = document.getElementById('track-name');
const mediaPlay = document.getElementById('media-play');

let expanded = false;
let latestState = {
  active: false,
  isPaused: false,
  isFocus: true,
  isInBreakMode: false,
  timeLabel: '0:00'
};
let dragState = null;

function setExpanded(nextExpanded) {
  expanded = nextExpanded;
  root.classList.toggle('expanded', expanded);
  root.classList.toggle('collapsed', !expanded);
  window.electronAPI.setOverlayExpanded(expanded);
}

function renderState(state) {
  latestState = { ...latestState, ...state };

  if (!latestState.active) {
    setExpanded(false);
    return;
  }

  sessionMode.textContent = latestState.isInBreakMode
    ? 'Break'
    : latestState.isFocus
      ? 'Focus'
      : 'Break';
  sessionTime.textContent = latestState.timeLabel || '0:00';
  sessionToggle.textContent = latestState.isPaused ? 'Resume Session' : 'Pause Session';
  sessionToggle.disabled = Boolean(latestState.isInBreakMode);
}

async function refreshMedia() {
  try {
    const media = await window.electronAPI.getMediaMetadata();
    const playIcon = mediaPlay?.querySelector('span');

    if (!media || !media.title) {
      trackName.textContent = 'No media playing';
      if (playIcon) playIcon.textContent = 'play_arrow';
      return;
    }

    const label = `${media.title} - ${media.artist || 'Unknown'}`;
    if (trackName.textContent !== label) trackName.textContent = label;
    if (playIcon) playIcon.textContent = media.status === 'Playing' ? 'pause' : 'play_arrow';
  } catch (error) {
    trackName.textContent = 'Media unavailable';
  }
}

bubbleButton.addEventListener('click', () => {
  if (dragState?.wasDragged) return;
  setExpanded(true);
  refreshMedia();
});

collapseButton.addEventListener('click', () => setExpanded(false));

document.querySelectorAll('[data-media-action]').forEach((button) => {
  button.addEventListener('click', () => {
    window.electronAPI.sendOverlayMediaCommand(button.dataset.mediaAction);
    setTimeout(refreshMedia, 350);
  });
});

sessionToggle.addEventListener('click', () => {
  if (latestState.isInBreakMode) return;
  window.electronAPI.sendOverlaySessionCommand('toggle-pause');
});

window.electronAPI.onOverlaySessionState(renderState);

window.addEventListener('pointerdown', (event) => {
  if (event.target.closest('button') && event.target !== bubbleButton) return;

  dragState = {
    x: event.screenX,
    y: event.screenY,
    wasDragged: false,
    pointerId: event.pointerId,
    target: event.target
  };

  try {
    event.target.setPointerCapture(event.pointerId);
  } catch (e) {}
});

window.addEventListener('pointermove', (event) => {
  if (!dragState) return;

  const delta = {
    x: event.screenX - dragState.x,
    y: event.screenY - dragState.y
  };

  if (Math.abs(delta.x) > 2 || Math.abs(delta.y) > 2) {
    dragState.wasDragged = true;
    window.electronAPI.moveOverlayBy(delta);
    dragState.x = event.screenX;
    dragState.y = event.screenY;
  }
});

window.addEventListener('pointerup', (event) => {
  if (!dragState) return;
  const wasDragged = dragState.wasDragged;

  try {
    dragState.target.releasePointerCapture(dragState.pointerId);
  } catch (e) {}

  setTimeout(() => {
    if (dragState) dragState.wasDragged = wasDragged;
    dragState = null;
  }, 0);
});

setInterval(() => {
  if (expanded) refreshMedia();
}, 2500);
