import * as E from './shared/engine.js';
import { heroBuyHTML, statusHTML, tickCountdowns, esc } from './shared/ui/widgets.js';
import { storage, inExtension, detectReset } from './storage.js';

const $ = (id) => document.getElementById(id);
let cfg = null;

function applyTheme() {
  if (cfg && cfg.theme !== 'auto') document.documentElement.setAttribute('data-theme', cfg.theme);
  else document.documentElement.removeAttribute('data-theme');
}

function render() {
  const now = new Date();
  const plan = E.buildPlan(cfg, now);
  const f = E.makeFormatters(cfg);
  const status = E.liveStatus(plan, now);
  $('buy').innerHTML = heroBuyHTML(plan, status, f, now, { compact: true });
  $('now').innerHTML = statusHTML(plan, status, f, now, { compact: true, canRefresh: inExtension });
  tickCountdowns(document.body);
}

async function init() {
  const saved = await storage.load();
  cfg = E.normalizeConfig(saved);
  if (!saved) await storage.save(cfg);
  applyTheme();
  render();
  if (!saved || !saved.currentStart) $('msg').textContent = 'Tip: enter your current subscription start in the planner.';
  setInterval(() => { if (tickCountdowns(document.body)) render(); }, 1000);
  setInterval(render, 60_000);
  storage.subscribe((next) => { if (next) { cfg = E.normalizeConfig(next); applyTheme(); render(); } });
}

$('open').addEventListener('click', () => {
  if (inExtension) chrome.tabs.create({ url: chrome.runtime.getURL('planner.html') });
  else location.href = 'planner.html';
});

$('detect').addEventListener('click', async () => {
  const btn = $('detect');
  btn.disabled = true;
  $('msg').textContent = 'Reading your Claude account…';
  try {
    const r = await detectReset();
    const f = E.makeFormatters(cfg);
    $('msg').innerHTML = `Weekly reset detected: <b>${esc(f.dateTime(new Date(r.resetsAt)))}</b>`;
  } catch (e) {
    $('msg').textContent = e.message || String(e);
  } finally {
    btn.disabled = false;
  }
});

document.body.addEventListener('click', async (e) => {
  const r = e.target.closest('[data-action="usage-refresh"]');
  if (r) {
    r.classList.add('spinning');
    r.disabled = true;
    try {
      await detectReset(); // background saves it; storage.subscribe re-renders
    } catch (err) {
      $('msg').textContent = err.message || String(err);
      r.classList.remove('spinning');
      r.disabled = false;
    }
    return;
  }
  const a = e.target.closest('[data-action="confirm-buy"]');
  if (!a) return;
  cfg = E.normalizeConfig({ ...cfg, currentStart: E.toWallInput(new Date(), cfg.tz) });
  await storage.save(cfg);
  render();
});

init();
