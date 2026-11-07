// Webview side: bridges the shared planner UI to the extension host.
import { mountApp } from './shared/ui/app.js';

const vscode = acquireVsCodeApi();
let resolveFirst;
const firstState = new Promise((r) => { resolveFirst = r; });
const subscribers = [];
const pending = new Map();
let seq = 0;

window.addEventListener('message', (e) => {
  const m = e.data || {};
  if (m.type === 'state') {
    if (resolveFirst) { resolveFirst(m.state); resolveFirst = null; }
    else subscribers.forEach((cb) => cb(m.state));
  } else if (m.type === 'detect-result') {
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    if (m.ok) p.resolve(m.result); else p.reject(new Error(m.error));
  }
});
vscode.postMessage({ type: 'ready' });

mountApp(document.getElementById('app'), {
  storage: {
    load: () => firstState,
    save: (state) => vscode.postMessage({ type: 'save', state }),
    subscribe: (cb) => subscribers.push(cb),
  },
  hooks: {
    download: (name, text) => vscode.postMessage({ type: 'download', name, text }),
    detectReset: () => new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      vscode.postMessage({ type: 'detect', id });
    }),
    detectHint: 'Uses your local Claude Code login (~/.claude/.credentials.json) to ask api.anthropic.com for your weekly reset and usage. The token is never sent anywhere else.',
  },
});
