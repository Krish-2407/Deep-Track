/**
 * Phase 10: Screen Time Module
 * Handles background tracking IPC listeners and daily data resets.
 */

/**
 * Initializes all screen time and window tracking listeners.
 */
export function initScreenTime({
  setAppUsageData = () => {},
  refreshDashboard = () => {},
  refreshCharts = () => {}
} = {}) {
  console.log('[ScreenTime Module] Initializing tracking listeners...');

  // 1. Active Window Tracking (Visual Feedback only)
  window.electronAPI.onActiveWindow((data) => {
    const appName = data.owner || "Unknown";
    // This can be used to update a 'Current App' badge in the UI if needed
  });

  // 2. Periodic Screen Time Aggregation Updates
  let localUsageData = {};
  window.electronAPI.onScreenTimeData((data) => {
    if (data && typeof data === 'object') {
      localUsageData = { ...localUsageData, ...data };
      setAppUsageData(localUsageData);
      
      // Only re-render if currently visible to save CPU
      const dashView = document.getElementById('dash-view');
      if (dashView && dashView.classList.contains('active')) {
        refreshDashboard();
        refreshCharts();
      }
    } else {
      console.warn('[ScreenTime Module] Received invalid data format:', data);
    }
  });


  // 3. Daily Reset Event (Midnight)
  window.electronAPI.onDailyReset(async (data) => {
    console.log(`[ScreenTime Module] Daily reset at ${data.newDate}`);
    
    // Clear local cache
    setAppUsageData({}); 
    
    // Re-fetch the already-accumulated data for the new day
    try {
      const freshData = await window.electronAPI.getScreenTime();
      if (freshData) setAppUsageData(freshData);
    } catch (err) {
      console.warn('[ScreenTime] Failed to re-fetch data after daily reset:', err);
    }

    // Refresh UI
    refreshDashboard();
    refreshCharts();
  });
}
