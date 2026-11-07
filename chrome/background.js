// Service worker: live countdown badge, reminders, and reset detection relay.
import * as E from './shared/engine.js';

const KEY = 'sixWindowConfig';
const ACCENT = '#d97757';
const DARK = '#141413';

async function loadConfig() {
  const { [KEY]: cfg } = await chrome.storage.local.get(KEY);
  return cfg ? E.normalizeConfig(cfg) : null;
}

async function saveConfig(cfg) {
  // normalize records the weekly usage reading into usageHistory
  await chrome.storage.local.set({ [KEY]: E.normalizeConfig(cfg) });
}

// ------------------------------------------------------------------ badge

async function updateBadge() {
  const cfg = await loadConfig();
  if (!cfg) {
    await chrome.action.setBadgeText({ text: 'SET' });
    await chrome.action.setBadgeBackgroundColor({ color: DARK });
    await chrome.action.setTitle({ title: '6-Window Planner: set up your plan' });
    return;
  }
  const now = new Date();
  const plan = E.buildPlan(cfg, now);
  const status = E.liveStatus(plan, now);
  const f = E.makeFormatters(cfg);
  let text = '';
  let color = ACCENT;
  let title = '6-Window Planner';

  const openPlanned = status.state === 'paid' && status.period.kind === 'planned' && now < status.period.windows[0].end;
  if (openPlanned) {
    text = 'BUY';
    title = `Subscribe now: the buy window is open until ${f.dateTime(status.period.windows[0].end)}`;
  } else if (status.nextBuy) {
    const ms = status.nextBuy.start - now;
    text = E.formatDuration(ms, { short: true });
    color = status.state === 'gap' ? ACCENT : DARK;
    title = `Optimal subscribe: ${f.dateTime(status.nextBuy.start)} (in ${E.formatDuration(ms)})`;
    if (status.state === 'paid') title += `\nNow: window ${status.windowIndex + 1} of ${status.total}, next reset ${f.dateTime(status.nextReset)}`;
  }
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color });
  if (chrome.action.setBadgeTextColor) await chrome.action.setBadgeTextColor({ color: '#ffffff' });
  await chrome.action.setTitle({ title });
}

// ------------------------------------------------------------------ reminders

async function scheduleReminders() {
  const all = await chrome.alarms.getAll();
  await Promise.all(all.filter((a) => a.name.startsWith('ev|')).map((a) => chrome.alarms.clear(a.name)));
  const cfg = await loadConfig();
  if (!cfg || cfg.notify === false) return;
  const plan = E.buildPlan(cfg, new Date());
  for (const ev of E.upcomingEvents(plan, new Date()).slice(0, 30)) {
    chrome.alarms.create(`ev|${ev.at.getTime()}|${ev.type}`, { when: ev.at.getTime() });
  }
}

async function fireReminder(name) {
  const [, at, type] = name.split('|');
  const cfg = await loadConfig();
  if (!cfg || cfg.notify === false) return;
  const plan = E.buildPlan(cfg, new Date(Number(at) - 60_000));
  const ev = E.upcomingEvents(plan, new Date(Number(at) - 60_000)).find((e) => e.type === type && Math.abs(e.at - Number(at)) < 60_000);
  if (!ev) return;
  chrome.notifications.create(name, {
    type: 'basic',
    iconUrl: 'icons/128.png',
    title: ev.title,
    message: ev.body,
    priority: 2,
  });
}

// ------------------------------------------------------------------ detection

async function applyDetected(result) {
  if (!result || !result.resetsAt) return null;
  const cfg = (await loadConfig()) || E.normalizeConfig(null);
  const r = E.resetFromInstant(result.resetsAt, cfg.tz);
  if (!r) return null;
  const planPatch = E.detectedPlanPatch(cfg, result.planHints, result.source || 'claude.ai');
  const next = {
    ...cfg, ...r, ...planPatch,
    resetSource: result.source || 'claude.ai',
    resetDetectedAt: new Date().toISOString(),
    weeklyUsage: Number.isFinite(result.utilization)
      ? { utilization: result.utilization, resetsAt: result.resetsAt, at: new Date().toISOString(), source: result.source || 'claude.ai' }
      : cfg.weeklyUsage,
  };
  await saveConfig(next);
  return next;
}

function waitForTabComplete(tabId, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { chrome.tabs.onUpdated.removeListener(onUpd); reject(new Error('claude.ai took too long to load.')); }, timeoutMs);
    function onUpd(id, info) {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(onUpd);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(onUpd);
  });
}

async function askTab(tabId) {
  for (let i = 0; i < 8; i++) {
    try {
      const res = await chrome.tabs.sendMessage(tabId, { type: 'six-window:detect-now' });
      if (res) return res;
    } catch { /* content script not ready yet */ }
    await new Promise((r) => setTimeout(r, 750));
  }
  throw new Error('Could not reach claude.ai. Reload the claude.ai tab and try again.');
}

async function detectNow() {
  let tabs = await chrome.tabs.query({ url: 'https://claude.ai/*' });
  let opened = null;
  if (!tabs.length) {
    opened = await chrome.tabs.create({ url: 'https://claude.ai/settings/usage', active: false });
    await waitForTabComplete(opened.id);
    tabs = [opened];
  }
  try {
    const res = await askTab(tabs[0].id);
    if (!res.ok) throw new Error(res.error);
    await applyDetected(res.result);
    return res.result;
  } finally {
    if (opened) chrome.tabs.remove(opened.id).catch(() => {});
  }
}

// ------------------------------------------------------------------ wiring

async function refreshAll() {
  await updateBadge();
  await scheduleReminders();
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('badge', { periodInMinutes: 1 });
  refreshAll();
});
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create('badge', { periodInMinutes: 1 });
  refreshAll();
});

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === 'badge') updateBadge();
  else if (a.name.startsWith('ev|')) fireReminder(a.name).then(updateBadge);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[KEY]) refreshAll();
});

chrome.notifications.onClicked.addListener((id) => {
  chrome.tabs.create({ url: chrome.runtime.getURL('planner.html') });
  chrome.notifications.clear(id);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return false;
  if (msg.type === 'six-window:detected' && sender.tab) {
    applyDetected(msg.result).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'six-window:detect') {
    detectNow()
      .then((result) => sendResponse({ ok: true, result }))
      .catch((e) => sendResponse({ ok: false, error: e.message || String(e) }));
    return true;
  }
  return false;
});

// Make sure the badge alarm exists even if the worker was restarted.
chrome.alarms.get('badge').then((a) => { if (!a) chrome.alarms.create('badge', { periodInMinutes: 1 }); });
updateBadge();
