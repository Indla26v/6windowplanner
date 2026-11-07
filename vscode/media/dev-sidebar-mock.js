// Dev-only: fake acquireVsCodeApi for the sidebar harness.
const state = { country: 'IN', tz: 'Asia/Kolkata', locale: 'en-IN', currency: 'INR', price: 1999, resetDay: 5, resetTime: '06:30', currentStart: '2026-10-08T17:00', targetWindows: 60,
  weeklyUsage: { utilization: 42, resetsAt: '2026-11-13T01:00:00.000Z', at: new Date(Date.now() - 300000).toISOString(), source: 'Claude Code' } };
window.__posted = [];
let uiState;
window.acquireVsCodeApi = () => ({
  getState: () => uiState,
  setState: (v) => { uiState = v; },
  postMessage(m) {
    window.__posted.push(m);
    if (m.type === 'ready') setTimeout(() => window.postMessage({ type: 'state', state }, '*'), 0);
    if (m.type === 'detect') setTimeout(() => {
      // Simulate the host: save the new reading, broadcast state, answer the request.
      state.weeklyUsage = { utilization: 55, resetsAt: '2026-11-13T01:00:00.000Z', at: new Date().toISOString(), source: 'Claude Code' };
      window.postMessage({ type: 'state', state }, '*');
      window.postMessage({ type: 'detect-result', id: m.id, ok: true, result: { resetsAt: state.weeklyUsage.resetsAt, utilization: 55 } }, '*');
    }, 600);
  },
});
