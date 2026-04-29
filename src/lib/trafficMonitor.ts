
/**
 * Traffic Monitor Utility
 * Tracks network usage to prevent excessive data consumption.
 */

const TRAFFIC_LIMIT_MB = 100;
const TRAFFIC_LIMIT_BYTES = TRAFFIC_LIMIT_MB * 1024 * 1024;
const WINDOW_MS = 60 * 60 * 1000; // 1 hour

interface TrafficState {
  totalBytes: number;
  startTime: number;
  limitReached: boolean;
}

let state: TrafficState = {
  totalBytes: 0,
  startTime: Date.now(),
  limitReached: false
};

// Load state from localStorage to persist across refreshes
const savedState = localStorage.getItem('traffic_monitor_state');
if (savedState) {
  const parsed = JSON.parse(savedState);
  if (Date.now() - parsed.startTime < WINDOW_MS) {
    state = parsed;
  } else {
    state.startTime = Date.now();
  }
}

const saveState = () => {
  localStorage.setItem('traffic_monitor_state', JSON.stringify(state));
};

export const updateTraffic = () => {
  if (state.limitReached) return;

  const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
  let newBytes = 0;
  
  resources.forEach(resource => {
    // Only count resources loaded after our last check
    // We use a simple approach: if transferSize is available, use it.
    if (resource.transferSize > 0) {
      newBytes += resource.transferSize;
    }
  });

  // Note: performance.getEntriesByType('resource') accumulates entries.
  // To avoid double counting, we should ideally clear entries or track which ones we've seen.
  // However, clearing is not always possible/reliable.
  // A better way is to just sum all current entries and compare with our previous total for this session.
  
  const currentTotal = resources.reduce((acc, r) => acc + (r.transferSize || 0), 0);
  
  // Reset if window expired
  if (Date.now() - state.startTime > WINDOW_MS) {
    state.startTime = Date.now();
    state.totalBytes = currentTotal;
  } else {
    state.totalBytes = currentTotal;
  }

  if (state.totalBytes > TRAFFIC_LIMIT_BYTES) {
    state.limitReached = true;
    console.warn('[TrafficMonitor] Traffic limit reached!');
  }
  
  saveState();
};

export const isTrafficLimitReached = () => {
  // Periodic update
  updateTraffic();
  return state.limitReached;
};

export const getTrafficStats = () => {
  return {
    usedMB: (state.totalBytes / (1024 * 1024)).toFixed(2),
    limitMB: TRAFFIC_LIMIT_MB,
    percent: ((state.totalBytes / TRAFFIC_LIMIT_BYTES) * 100).toFixed(1)
  };
};

// Start periodic monitoring
if (typeof window !== 'undefined') {
  setInterval(updateTraffic, 5000);
}
