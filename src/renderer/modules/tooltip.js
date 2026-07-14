/**
 * Onboarding Tooltip Module
 * Dynamic, high-performance, and glassmorphic onboarding tooltip helper.
 * Uses event delegation at the body level for minimal resource usage.
 */

let hoverTimeout = null;
let activeElement = null;

/**
 * Initializes global event delegation listeners for elements annotated with [data-tooltip]
 */
export function initOnboardingTooltips() {
  let tooltip = document.getElementById('feature-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'feature-tooltip';
    tooltip.className = 'feature-tooltip';
    document.body.appendChild(tooltip);
  }

  // Listen tomouseover globally
  document.body.addEventListener('mouseover', (e) => {
    const target = e.target.closest('[data-tooltip]');
    if (!target || target === activeElement) return;

    // Reset pending hovers
    clearTimeout(hoverTimeout);
    activeElement = target;

    const content = target.getAttribute('data-tooltip');
    const title = target.getAttribute('data-tooltip-title') || target.innerText || 'Feature';

    // Verify hover delay to check if user has paused for 500ms
    hoverTimeout = setTimeout(() => {
      tooltip.innerHTML = `<strong>✨ ${title.trim()}</strong>${content}`;
      tooltip.classList.add('visible');
      repositionTooltip(target, tooltip);
    }, 500);
  });

  // Track mouse coordinates/elements on moving or scrolling
  document.body.addEventListener('mouseout', (e) => {
    const target = e.target.closest('[data-tooltip]');
    if (!target || e.relatedTarget?.closest('[data-tooltip]') === target) return;

    clearTimeout(hoverTimeout);
    activeElement = null;
    tooltip.classList.remove('visible');
  });
}

/**
 * Bounds-checked coordinate math to place the tooltip card directly above the element,
 * keeping it strictly inside the viewport sides.
 */
function repositionTooltip(target, tooltip) {
  const rect = target.getBoundingClientRect();
  
  // Center horizontally relative to target element
  let left = rect.left + rect.width / 2;
  
  // Place directly above target
  let top = rect.top - 8;

  // Set visual values temporarily to read layout size
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;

  const tooltipRect = tooltip.getBoundingClientRect();
  const padding = 12;

  // Horizontal bounding checks (prevent screen bleed)
  if (left - tooltipRect.width / 2 < padding) {
    left = tooltipRect.width / 2 + padding;
  } else if (left + tooltipRect.width / 2 > window.innerWidth - padding) {
    left = window.innerWidth - tooltipRect.width / 2 - padding;
  }

  // Vertical bounding check (if it runs off the top of screen, show below target instead)
  if (top - tooltipRect.height < padding) {
    top = rect.bottom + 8;
    tooltip.style.transform = 'translate(-50%, 0) scale(1)';
  } else {
    tooltip.style.transform = 'translate(-50%, -100%) scale(1)';
  }

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}
