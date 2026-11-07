// Sidebar view: the Chrome toolbar popup's content, plus extra sections that use the
// sidebar's height (window strip, next purchases, 365-day summary with counter, calendar).
import * as E from './shared/engine.js';
import { heroBuyHTML, statusHTML, stripHTML, tickCountdowns, esc } from './shared/ui/widgets.js';
import { renderCalendar, LEGEND_HTML } from './shared/ui/calendar.js';

const vscode = acquireVsCodeApi();
const $ = (id) => document.getElementById(id);
let cfg = null;
let plan = null;
const pending = new Map();
let seq = 0;

// Which sections are open survives reloads of the view.
const ui = Object.assign({ open: { next: true, year: true, cal: true } }, vscode.getState() || {});
const saveUi = () => vscode.setState(ui);

function applyTheme() {
  const el = document.documentElement;
  let t = cfg ? cfg.theme : 'auto';
  if (t === 'auto') {
    const b = document.body.classList;
    if (b.contains('vscode-dark') || b.contains('vscode-high-contrast')) t = 'dark';
    else if (b.contains('vscode-light')) t = 'light';
  }
  if (t === 'auto') el.removeAttribute('data-theme'); else el.setAttribute('data-theme', t);
}

function section(id, title, sub, body) {
  return `<details class="side-sec" data-sec="${id}" ${ui.open[id] !== false ? 'open' : ''}>
    <summary><span>${title}</span>${sub ? `<em>${sub}</em>` : ''}</summary>
    <div class="side-body">${body}</div>
  </details>`;
}

function nextPurchasesHTML(f, now) {
  const planned = plan.periods.filter((p) => p.kind === 'planned');
  const upcoming = planned.filter((p) => p.end > now).slice(0, 4);
  if (!upcoming.length) return '<p class="note">No purchases planned.</p>';
  const rows = upcoming.map((p) => {
    const n = planned.indexOf(p) + 1;
    const last = p.windows[p.windows.length - 1];
    const tag = p.sharedEntry ? '<span class="tag warn">Early re-buy</span>' : '<span class="tag ok">Fresh week</span>';
    return `<li class="np-row ${p.start <= now ? 'is-active' : ''}">
      <span class="np-n">${n}</span>
      <span class="np-main">
        <b>${esc(f.shortDate(p.start))}</b> <span class="muted">${esc(f.time(p.start))}</span>
        <small>${p.windows.length} windows · exit ${last.hours}h · ends ${esc(f.shortDate(p.end))}${p.gapBefore ? ` · ${p.gapBefore.days} d gap` : ''}</small>
      </span>
      ${tag}
    </li>`;
  }).join('');
  return `<ol class="np">${rows}</ol>
    <div class="side-row"><button class="btn small" data-act="ics">Download 365.ics</button><button class="btn small" data-act="open">All ${planned.length} purchases →</button></div>`;
}

function yearHTML(f) {
  const s = plan.stats;
  const steps = E.planSteps(cfg, new Date());
  const idx = steps.findIndex((st) => st.paid === s.windowsPaid && st.charges === s.charges);
  const canDown = idx > 0;
  const canUp = idx >= 0 && idx < steps.length - 1;
  const tile = (k, v, sub, cls = '') => `<div class="ys ${cls}"><span>${k}</span><b class="num">${v}</b><small>${sub}</small></div>`;
  return `<div class="ys-grid">
      ${tile('Cash saved', esc(f.money(s.saved)), `${esc(f.money(s.cash))} vs ${esc(f.money(s.autoCash))}`, 'accent')}
      ${tile('Purchases', `${s.charges}<i> / ${s.autoCharges}</i>`, 'planned vs yearly')}
      ${tile('Paid days', `${s.paidDays}<i> / 365</i>`, `${s.gapDays} on the free tier`)}
      ${tile('Workdays lost', s.workdayGap, `${s.weekendGap} weekend rest days`, 'blue')}
    </div>
    <div class="ys-step">
      <span><b>Weekly windows</b><small>${s.windowsTouched} of ${s.weeksInHorizon} caps usable${s.sharedEntries ? ` · ${s.sharedEntries} early re-buys` : ''}</small></span>
      <div class="stepper mini">
        <button type="button" class="step" data-step="-1" ${canDown ? '' : 'disabled'} aria-label="Fewer windows">−</button>
        <b class="num">${s.windowsPaid}</b>
        <button type="button" class="step" data-step="1" ${canUp ? '' : 'disabled'} aria-label="More windows">+</button>
      </div>
    </div>`;
}

function render() {
  if (!cfg) return;
  // Keep focus/scroll stable: don't rebuild while a <summary> is being toggled.
  const now = new Date();
  plan = E.buildPlan(cfg, now);
  const f = E.makeFormatters(cfg);
  const status = E.liveStatus(plan, now);
  $('buy').innerHTML = heroBuyHTML(plan, status, f, now, { compact: true });

  const stripPeriod = status.state === 'paid' ? status.period : status.nextBuy;
  $('now').innerHTML = statusHTML(plan, status, f, now, { compact: true, canRefresh: true })
    + (stripPeriod ? `<div class="side-strip">${stripHTML(stripPeriod, now, f, cfg)}</div>` : '');

  const s = plan.stats;
  $('extra').innerHTML =
    section('next', 'Next purchases', `${s.charges} in 365 days`, nextPurchasesHTML(f, now))
    + section('year', 'Next 365 days', 'yearly vs planned', yearHTML(f))
    + section('cal', 'Calendar', 'this month + next', `<div class="legend side-legend">${LEGEND_HTML}</div><div class="months side-months" id="cal"></div><div class="day-info" id="cal-info"></div>`);
  renderCalendar($('cal'), $('cal-info'), plan, f, now, { maxMonths: 2, fromCurrentMonth: true });

  if (!cfg.currentStart && !$('msg').dataset.sticky) $('msg').textContent = 'Tip: enter your current subscription start in the planner.';
  tickCountdowns(document.body);
}

function save(next) {
  cfg = E.normalizeConfig(next);
  vscode.postMessage({ type: 'save', state: cfg });
  render();
}

window.addEventListener('message', (e) => {
  const m = e.data || {};
  if (m.type === 'state') {
    cfg = E.normalizeConfig(m.state);
    applyTheme();
    render();
  } else if (m.type === 'detect-result') {
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    if (m.ok) p.resolve(m.result); else p.reject(new Error(m.error));
  }
});

$('open').addEventListener('click', () => vscode.postMessage({ type: 'open' }));

function detect() {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    vscode.postMessage({ type: 'detect', id });
  });
}

$('detect').addEventListener('click', async () => {
  const btn = $('detect');
  btn.disabled = true;
  $('msg').dataset.sticky = '1';
  $('msg').textContent = 'Reading your Claude Code login…';
  try {
    const r = await detect();
    const f = E.makeFormatters(cfg);
    // Show the reset as saved (rounded to the minute), e.g. 06:29:59.9 → 6:30 am.
    const at = new Date(Math.round(new Date(r.resetsAt).getTime() / E.MINUTE) * E.MINUTE);
    $('msg').innerHTML = `Weekly reset detected: <b>${esc(f.dateTime(at))}</b>`
      + (Number.isFinite(r.utilization) ? ` · ${Math.round(r.utilization)}% used` : '');
  } catch (err) {
    $('msg').textContent = err.message || String(err);
  } finally {
    btn.disabled = false;
  }
});

document.body.addEventListener('click', (e) => {
  if (!cfg) return;
  if (e.target.closest('[data-action="confirm-buy"]')) {
    save({ ...cfg, currentStart: E.toWallInput(new Date(), cfg.tz), startSource: 'confirmed' });
    return;
  }
  const refresh = e.target.closest('[data-action="usage-refresh"]');
  if (refresh && !refresh.disabled) {
    refresh.classList.add('spinning');
    refresh.disabled = true;
    detect().catch((err) => {
      $('msg').dataset.sticky = '1';
      $('msg').textContent = err.message || String(err);
      refresh.classList.remove('spinning');
      refresh.disabled = false;
    });
    return;
  }
  const act = e.target.closest('[data-act]');
  if (act && act.dataset.act === 'open') { vscode.postMessage({ type: 'open' }); return; }
  if (act && act.dataset.act === 'ics') {
    vscode.postMessage({ type: 'download', name: '365.ics', text: E.icsForPlan(plan, new Date()) });
    return;
  }
  const step = e.target.closest('[data-step]');
  if (step && !step.disabled) {
    const steps = E.planSteps(cfg, new Date());
    const idx = steps.findIndex((st) => st.paid === plan.stats.windowsPaid && st.charges === plan.stats.charges);
    const next = steps[Math.max(0, Math.min(steps.length - 1, (idx < 0 ? 0 : idx) + Number(step.dataset.step)))];
    if (next) save({ ...cfg, targetWindows: next.paid });
  }
});

// Remember open/closed sections.
document.body.addEventListener('toggle', (e) => {
  const d = e.target.closest && e.target.closest('details[data-sec]');
  if (!d) return;
  ui.open[d.dataset.sec] = d.open;
  saveUi();
}, true);

new MutationObserver(applyTheme).observe(document.body, { attributes: true, attributeFilter: ['class'] });
setInterval(() => { if (tickCountdowns(document.body)) render(); }, 1000);
setInterval(() => {
  // Don't re-render under the pointer while someone is reading the calendar details.
  if (!document.querySelector('#cal:hover')) render();
}, 60_000);
vscode.postMessage({ type: 'ready' });
