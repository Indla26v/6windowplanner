// 6-Window Planner — VS Code extension host side.
const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { pathToFileURL } = require('url');

const KEY = 'sixWindowConfig';
const DETECT_EVERY_MS = 30 * 60 * 1000;

/** @type {typeof import('./media/shared/engine.js')} */
let E;
let ctx;
let item;
let panel = null;
let sideView = null;          // the sidebar view (same content as the Chrome popup)
let lastCheck = Date.now();
let lastDetect = 0;
let lastBroadcast = '';       // last config sent to the webviews (picks up changes made in other windows)
const NOTIFIED_KEY = 'sixWindowNotified';

async function activate(context) {
  ctx = context;
  E = await import(pathToFileURL(path.join(context.extensionPath, 'media', 'shared', 'engine.js')).href);

  item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  item.command = 'sixWindow.open';
  context.subscriptions.push(item);

  context.subscriptions.push(
    vscode.commands.registerCommand('sixWindow.open', openPanel),
    vscode.commands.registerCommand('sixWindow.detect', async () => {
      try {
        const r = await detectFromClaudeCode();
        const f = E.makeFormatters(getConfig());
        vscode.window.showInformationMessage(`6-Window: weekly reset detected (${f.resetLabel()}), usage ${Math.round(r.utilization)}%.`);
      } catch (e) {
        vscode.window.showWarningMessage(`6-Window: ${e.message}`);
      }
    }),
    vscode.commands.registerCommand('sixWindow.confirmBuy', () => {
      const cfg = getConfig();
      setConfig({ ...cfg, currentStart: E.toWallInput(new Date(), cfg.tz) });
      vscode.window.showInformationMessage('6-Window: tracking a new period that started now. Remember to switch auto-renew off.');
    }),
    vscode.workspace.onDidChangeConfiguration((e) => { if (e.affectsConfiguration('sixWindow')) tick(); }),
    vscode.window.registerWebviewViewProvider('sixWindow.now', { resolveWebviewView }, { webviewOptions: { retainContextWhenHidden: true } }),
  );

  if (!context.globalState.get(KEY)) await context.globalState.update(KEY, E.normalizeConfig(null));

  const timer = setInterval(tick, 30_000);
  context.subscriptions.push({ dispose: () => clearInterval(timer) });
  tick();
  maybeAutoDetect();
}

function deactivate() {}

// ------------------------------------------------------------------ config

function getConfig() {
  return E.normalizeConfig(ctx.globalState.get(KEY));
}

async function setConfig(cfg, { from = null } = {}) {
  const next = E.normalizeConfig(cfg);
  await ctx.globalState.update(KEY, next);
  broadcast(next, from);
  tick();
  return next;
}

/** Send the config to every open webview (planner panel + sidebar), like chrome.storage.onChanged. */
function broadcast(cfg, except = null) {
  lastBroadcast = JSON.stringify(cfg);
  for (const wv of [panel && panel.webview, sideView && sideView.webview]) {
    if (wv && wv !== except) wv.postMessage({ type: 'state', state: cfg });
  }
}

// ------------------------------------------------------------------ status bar + reminders

function tick() {
  const settings = vscode.workspace.getConfiguration('sixWindow');
  const cfg = getConfig();
  const now = new Date();
  const plan = E.buildPlan(cfg, now);
  const status = E.liveStatus(plan, now);
  const f = E.makeFormatters(cfg);

  if (!settings.get('statusBar', true)) {
    item.hide();
  } else {
    const open = status.state === 'paid' && status.period.kind === 'planned' && now < status.period.windows[0].end;
    const md = new vscode.MarkdownString('', true);
    md.isTrusted = true;
    item.backgroundColor = undefined;
    if (open) {
      item.text = `$(flame) Subscribe now · ${shortDur(status.period.windows[0].end - now)} left`;
      item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      md.appendMarkdown(`**Buy window is open.** Entry sprint ends ${f.dateTime(status.period.windows[0].end)}.\n\n`);
      md.appendMarkdown('[I just subscribed](command:sixWindow.confirmBuy)');
    } else if (status.nextBuy) {
      const ms = status.nextBuy.start - now;
      item.text = status.state === 'paid'
        ? `$(pulse) W${status.windowIndex + 1}/${status.total} · subscribe in ${shortDur(ms)}`
        : `$(clock) Subscribe in ${shortDur(ms)}`;
      md.appendMarkdown(`**Optimal subscribe:** ${f.dateTime(status.nextBuy.start)}\n\n`);
      md.appendMarkdown(`Countdown: ${E.formatDuration(ms)}\n\n`);
      if (status.state === 'paid') {
        md.appendMarkdown(`Now: window ${status.windowIndex + 1} of ${status.total} (${status.window.type}), ends ${f.dateTime(status.window.end)}\n\n`);
        md.appendMarkdown(`${f.planName} ends: ${f.dateTime(status.expiresAt)}\n\n`);
      } else {
        md.appendMarkdown('Now: free-tier gap\n\n');
      }
    } else {
      item.text = '$(calendar) 6-Window: set up';
      md.appendMarkdown('Open the planner to enter your subscription.');
    }
    if (cfg.weeklyUsage && Number.isFinite(cfg.weeklyUsage.utilization)) {
      md.appendMarkdown(`\n\nWeekly usage: ${Math.round(cfg.weeklyUsage.utilization)}% (${cfg.weeklyUsage.source})`);
    }
    md.appendMarkdown(`\n\nReset: ${f.resetLabel()} · ${E.zoneLabel(cfg)}\n\n[Open planner](command:sixWindow.open)`);
    item.tooltip = md;
    item.show();
  }

  // Another VS Code window may have changed the config: refresh open views.
  const json = JSON.stringify(cfg);
  if (lastBroadcast && json !== lastBroadcast) broadcast(cfg);
  else if (!lastBroadcast) lastBroadcast = json;

  // Reminders that came due since the last tick — shown once across all VS Code windows.
  if (cfg.notify !== false) {
    // Use the plan as it stood at the previous check: once a buy moment has passed, a plan
    // rebuilt from "now" no longer contains it (Chrome schedules alarms ahead, same effect).
    const since = new Date(lastCheck);
    const due = E.upcomingEvents(E.buildPlan(cfg, since), since).filter((ev) => ev.at <= now);
    if (due.length) {
      const seen = new Set(ctx.globalState.get(NOTIFIED_KEY, []));
      const fresh = due.filter((ev) => !seen.has(`${ev.type}|${ev.at.getTime()}`));
      fresh.forEach((ev) => seen.add(`${ev.type}|${ev.at.getTime()}`));
      if (fresh.length) ctx.globalState.update(NOTIFIED_KEY, [...seen].slice(-100));
      for (const ev of fresh) {
        vscode.window.showInformationMessage(`${ev.title} — ${ev.body}`, 'Open Planner').then((pick) => {
          if (pick) openPanel();
        });
      }
    }
  }
  lastCheck = now.getTime();

  if (Date.now() - lastDetect > DETECT_EVERY_MS) maybeAutoDetect();
}

function shortDur(ms) {
  if (ms <= 0) return 'now';
  const d = Math.floor(ms / E.DAY);
  const h = Math.floor((ms % E.DAY) / E.HOUR);
  const m = Math.floor((ms % E.HOUR) / E.MINUTE);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${Math.max(m, 1)}m`;
}

// ------------------------------------------------------------------ detection via Claude Code login

function readCredentialsFile() {
  const dirs = [process.env.CLAUDE_CONFIG_DIR, path.join(os.homedir(), '.claude')].filter(Boolean);
  for (const dir of dirs) {
    const file = path.join(dir, '.credentials.json');
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  return null;
}

function readMacKeychain() {
  return new Promise((resolve) => {
    if (process.platform !== 'darwin') return resolve(null);
    execFile('security', ['find-generic-password', '-s', 'Claude Code-credentials', '-w'], { timeout: 5000 }, (err, out) => {
      if (err) return resolve(null);
      try { resolve(JSON.parse(String(out).trim())); } catch { resolve(null); }
    });
  });
}

async function detectFromClaudeCode() {
  const creds = readCredentialsFile() || (await readMacKeychain());
  const oauth = creds && (creds.claudeAiOauth || creds.claude_ai_oauth);
  if (!oauth || !oauth.accessToken) {
    throw new Error('No Claude Code login found. Run `claude` and sign in with your Claude account (/login), then try again.');
  }
  if (oauth.expiresAt && Number(oauth.expiresAt) < Date.now()) {
    throw new Error('Your Claude Code login token has expired. Run `claude` once to refresh it, then try again.');
  }
  const res = await fetch('https://api.anthropic.com/api/oauth/usage', {
    headers: {
      Authorization: `Bearer ${oauth.accessToken}`,
      'anthropic-beta': 'oauth-2025-04-20',
      'Content-Type': 'application/json',
      'User-Agent': 'six-window-planner',
    },
  });
  if (res.status === 401 || res.status === 403) throw new Error('Anthropic rejected the Claude Code login. Run `claude` and /login again.');
  if (!res.ok) throw new Error(`Usage request failed (${res.status}).`);
  const data = await res.json();
  const w = data && (data.seven_day || data.sevenDay || data.weekly);
  if (!w || !(w.resets_at || w.resetsAt)) throw new Error('No weekly limit in the usage response (is this a Pro/Max login?).');

  const result = {
    planHints: [oauth.subscriptionType, oauth.rateLimitTier].filter((x) => typeof x === 'string'),
    resetsAt: w.resets_at || w.resetsAt,
    utilization: Number(w.utilization ?? NaN),
    source: 'Claude Code',
  };
  const cfg = getConfig();
  const r = E.resetFromInstant(result.resetsAt, cfg.tz);
  if (!r) throw new Error('Could not read the reset time.');
  const planPatch = E.detectedPlanPatch(cfg, result.planHints, 'claude-code');
  await setConfig({
    ...cfg, ...r, ...planPatch,
    resetSource: 'claude-code',
    resetDetectedAt: new Date().toISOString(),
    weeklyUsage: Number.isFinite(result.utilization)
      ? { utilization: result.utilization, resetsAt: result.resetsAt, at: new Date().toISOString(), source: 'Claude Code' }
      : cfg.weeklyUsage,
  });
  lastDetect = Date.now();
  return result;
}

function maybeAutoDetect() {
  lastDetect = Date.now();
  if (!vscode.workspace.getConfiguration('sixWindow').get('autoDetectFromClaudeCode', true)) return;
  detectFromClaudeCode().catch(() => { /* quiet; the command shows errors */ });
}

// ------------------------------------------------------------------ webviews (planner panel + sidebar)

/** Messages from either webview. Mirrors the Chrome popup/planner ↔ background messages. */
async function handleMessage(webview, m) {
  if (!m) return;
  if (m.type === 'ready') webview.postMessage({ type: 'state', state: getConfig() });
  else if (m.type === 'save') await setConfig(m.state, { from: webview });
  else if (m.type === 'open') openPanel();
  else if (m.type === 'download') {
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(path.join(os.homedir(), m.name)),
      filters: { Calendar: ['ics'] },
    });
    if (uri) {
      await vscode.workspace.fs.writeFile(uri, Buffer.from(m.text, 'utf8'));
      vscode.window.showInformationMessage(`Saved ${path.basename(uri.fsPath)}. Open it to add the reminders to your calendar.`);
    }
  } else if (m.type === 'detect') {
    try {
      const result = await detectFromClaudeCode();
      webview.postMessage({ type: 'detect-result', id: m.id, ok: true, result });
    } catch (e) {
      webview.postMessage({ type: 'detect-result', id: m.id, ok: false, error: e.message });
    }
  }
}

function openPanel() {
  if (panel) { panel.reveal(); return; }
  const media = vscode.Uri.joinPath(ctx.extensionUri, 'media');
  panel = vscode.window.createWebviewPanel('sixWindowPlanner', '6-Window Planner', vscode.ViewColumn.Active, {
    enableScripts: true,
    retainContextWhenHidden: true,
    localResourceRoots: [media],
  });
  panel.iconPath = vscode.Uri.joinPath(media, 'icon.png');
  panel.webview.html = html(panel.webview, media, 'webview.js');
  panel.onDidDispose(() => { panel = null; });
  const wv = panel.webview;
  wv.onDidReceiveMessage((m) => handleMessage(wv, m));
}

/** Sidebar view: the same compact content as the Chrome toolbar popup. */
function resolveWebviewView(view) {
  sideView = view;
  const media = vscode.Uri.joinPath(ctx.extensionUri, 'media');
  view.webview.options = { enableScripts: true, localResourceRoots: [media] };
  view.webview.html = html(view.webview, media, 'sidebar.js', 'popup sidebar');
  const wv = view.webview;
  wv.onDidReceiveMessage((m) => handleMessage(wv, m));
  view.onDidDispose(() => { if (sideView === view) sideView = null; });
}

function html(webview, media, script, bodyClass = '') {
  const nonce = crypto.randomBytes(16).toString('base64');
  const uri = (...p) => webview.asWebviewUri(vscode.Uri.joinPath(media, ...p));
  const csp = [
    "default-src 'none'",
    `img-src ${webview.cspSource} data:`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `font-src ${webview.cspSource}`,
    `script-src ${webview.cspSource} 'nonce-${nonce}'`,
  ].join('; ');
  const body = script === 'sidebar.js'
    ? `<div class="wrap">
    <div class="side-actions">
      <button class="btn dark" id="open">Open full planner</button>
      <button class="btn" id="detect" title="Read your weekly reset, plan and usage from your Claude Code login">Detect reset</button>
    </div>
    <p class="note" id="msg" style="text-align:center"></p>
    <div class="hero-buy" id="buy"></div>
    <div class="card" id="now"></div>
    <div id="extra" class="side-extra"></div>
  </div>`
    : '<div id="app"></div>';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>6-Window Planner</title>
  <link rel="stylesheet" href="${uri('shared', 'ui', 'styles.css')}">
</head>
<body class="${bodyClass}">
  ${body}
  <script type="module" nonce="${nonce}" src="${uri(script)}"></script>
</body>
</html>`;
}

module.exports = { activate, deactivate };
