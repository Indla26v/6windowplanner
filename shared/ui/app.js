// Full planner UI. Host-agnostic: the Chrome page and the VS Code webview pass
// a storage adapter and optional host hooks.
//
// storage: { load(): Promise<cfg|null>, save(cfg): void, subscribe?(cb) }
// hooks:   { download?(name, text, mime), detectReset?(): Promise<{resetsAt, utilization?, source}>,
//            detectHint?: string }

import * as E from '../engine.js';
import { COUNTRIES, countryByCode, detectCountry } from '../countries.js';
import { esc, heroBuyHTML, statusHTML, tickCountdowns, stripHTML } from './widgets.js';
import { renderCalendar, LEGEND_HTML } from './calendar.js';
import { openInfo } from './info.js';

export async function mountApp(root, { storage, hooks = {} }) {
  let saved = null;
  try { saved = await storage.load(); } catch { /* start fresh */ }
  let cfg = E.normalizeConfig(saved);
  let plan = null;
  let f = null;

  root.innerHTML = skeleton(hooks);
  const $ = (sel) => root.querySelector(sel);
  const els = {
    zone: $('#zone'), theme: $('#theme'), info: $('#info'), plan: $('#plan'), priceLabel: $('#price-label'),
    heroBuy: $('#hero-buy'), heroNow: $('#hero-now'),
    country: $('#country'), tz: $('#tz'), start: $('#start'), startHint: $('#start-hint'), clear: $('#clear-start'),
    pills: $('#pills'), resetTime: $('#reset-time'), resetHint: $('#reset-hint'),
    detect: $('#detect'), detectMsg: $('#detect-msg'),
    price: $('#price'), currency: $('#currency'), notify: $('#notify'),
    stats: $('#stats'), calendar: $('#calendar'), dayInfo: $('#day-info'), timeline: $('#timeline'),
    planNote: $('#plan-note'),
  };

  const CAL_PREVIEW_MONTHS = 4;
  let calExpanded = false;

  // ------------------------------------------------------------ helpers
  let saveTimer = null;
  const persist = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { try { storage.save({ ...cfg }); } catch { /* ignore */ } }, 200);
  };
  const update = (patch, { refill = false } = {}) => {
    cfg = E.normalizeConfig({ ...cfg, ...patch });
    persist();
    if (refill) fillSetup();
    renderAll();
  };

  function applyTheme() {
    const el = document.documentElement;
    let t = cfg.theme;
    if (t === 'auto' && document.body) {
      const b = document.body.classList;
      if (b.contains('vscode-dark') || b.contains('vscode-high-contrast')) t = 'dark';
      else if (b.contains('vscode-light')) t = 'light';
    }
    if (t === 'auto') el.removeAttribute('data-theme'); else el.setAttribute('data-theme', t);
    els.theme.textContent = { auto: '◐', light: '☀', dark: '☾' }[cfg.theme];
    els.theme.title = `Theme: ${cfg.theme}`;
  }

  /** Move zone-dependent wall times so they keep pointing at the same instants. */
  function rezone(nextTz) {
    if (nextTz === cfg.tz) return {};
    const patch = { tz: nextTz, ...E.convertReset(cfg, cfg.tz, nextTz) };
    const cs = E.parseWall(cfg.currentStart, cfg.tz);
    if (cs) patch.currentStart = E.toWallInput(cs, nextTz);
    return patch;
  }

  // ------------------------------------------------------------ setup form
  function fillSetup() {
    const country = countryByCode(cfg.country);
    els.country.innerHTML = [...COUNTRIES].sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => `<option value="${c.code}" ${c.code === cfg.country ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
    const zones = country.zones.includes(cfg.tz) ? country.zones : [cfg.tz, ...country.zones];
    els.tz.innerHTML = zones.map((z) => `<option value="${esc(z)}" ${z === cfg.tz ? 'selected' : ''}>${esc(z.replace(/_/g, ' '))}</option>`).join('');
    const currencies = [...new Set([cfg.currency, ...COUNTRIES.map((c) => c.currency)])].sort();
    els.currency.innerHTML = currencies.map((c) => `<option ${c === cfg.currency ? 'selected' : ''}>${c}</option>`).join('');
    els.start.value = cfg.currentStart || '';
    els.resetTime.value = cfg.resetTime;
    els.price.value = cfg.price;
    els.plan.innerHTML = E.PLANS.map((p) => `<option value="${p.id}" ${p.id === cfg.plan ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
    els.plan.title = E.planById(cfg.plan).usage;
    els.priceLabel.textContent = `Monthly price · ${E.planById(cfg.plan).name}`;
    els.notify.checked = cfg.notify !== false;
    const fmt = E.makeFormatters(cfg);
    els.pills.innerHTML = fmt.weekdayNames.map((n, i) =>
      `<button type="button" class="pill" data-day="${i}" aria-pressed="${i === cfg.resetDay}" aria-label="${esc(fmt.weekdayLong[i])}">${esc(n.slice(0, 3))}</button>`).join('');
    applyTheme();
  }

  els.country.addEventListener('change', () => {
    const c = countryByCode(els.country.value);
    const nextTz = c.zones.includes(cfg.tz) ? cfg.tz : c.zones[0];
    update({ country: c.code, locale: c.locale, currency: c.currency, price: E.planPrice(c.code, cfg.plan), ...rezone(nextTz),
      countrySource: 'manual', tzSource: nextTz === cfg.tz ? cfg.tzSource : 'country', currencySource: 'country', priceSource: 'plan' }, { refill: true });
  });
  els.tz.addEventListener('change', () => update({ ...rezone(els.tz.value), tzSource: 'manual' }, { refill: true }));
  els.plan.addEventListener('change', () => update({ plan: els.plan.value, planSource: 'manual', price: E.planPrice(cfg.country, els.plan.value), priceSource: 'plan' }, { refill: true }));
  els.start.addEventListener('change', () => update({ currentStart: els.start.value, startSource: 'manual' }));
  els.clear.addEventListener('click', () => { els.start.value = ''; update({ currentStart: '' }); });
  els.pills.addEventListener('click', (e) => {
    const b = e.target.closest('[data-day]');
    if (!b) return;
    els.pills.querySelectorAll('.pill').forEach((p) => p.setAttribute('aria-pressed', String(p === b)));
    update({ resetDay: Number(b.dataset.day), resetSource: 'manual' });
  });
  els.resetTime.addEventListener('change', () => { if (els.resetTime.value) update({ resetTime: els.resetTime.value, resetSource: 'manual' }); });
  els.price.addEventListener('input', () => { if (Number(els.price.value) > 0) update({ price: Number(els.price.value), priceSource: 'manual' }); });
  els.currency.addEventListener('change', () => update({ currency: els.currency.value, currencySource: 'manual' }));
  els.notify.addEventListener('change', () => update({ notify: els.notify.checked }));
  els.theme.addEventListener('click', () => {
    const order = ['auto', 'light', 'dark'];
    update({ theme: order[(order.indexOf(cfg.theme) + 1) % 3] });
    applyTheme();
  });
  els.info.addEventListener('click', () => openInfo(plan, f));

  if (hooks.detectReset) {
    els.detect.addEventListener('click', async () => {
      els.detect.disabled = true;
      els.detectMsg.textContent = 'Reading your Claude account…';
      try {
        const res = await hooks.detectReset();
        applyDetection(res);
      } catch (err) {
        els.detectMsg.innerHTML = `<span style="color:var(--accent-ink)">${esc(err && err.message ? err.message : String(err))}</span>`;
      } finally {
        els.detect.disabled = false;
      }
    });
  }

  async function refreshUsage(btn) {
    btn.classList.add('spinning');
    btn.disabled = true;
    try {
      applyDetection(await hooks.detectReset());
    } catch (err) {
      const note = root.querySelector('[data-usage-note]');
      if (note) note.innerHTML = `<span style="color:var(--accent-ink)">${esc(err && err.message ? err.message : String(err))}</span>`;
      btn.classList.remove('spinning');
      btn.disabled = false;
    }
  }

  function applyDetection(res) {
    if (!res || !res.resetsAt) throw new Error('No weekly reset found in the response.');
    const r = E.resetFromInstant(res.resetsAt, cfg.tz);
    if (!r) throw new Error('Could not read the reset time.');
    const planPatch = E.detectedPlanPatch(cfg, res.planHints, res.source || 'claude.ai');
    update({
      ...r,
      ...planPatch,
      resetSource: /code/i.test(res.source || '') ? 'claude-code' : 'claude.ai',
      resetDetectedAt: new Date().toISOString(),
      weeklyUsage: Number.isFinite(res.utilization)
        ? { utilization: res.utilization, resetsAt: res.resetsAt, at: new Date().toISOString(), source: res.source || 'claude.ai' }
        : cfg.weeklyUsage,
    }, { refill: true });
  }

  // Manual weekly usage (when the account isn't connected, or to correct it).
  root.addEventListener('change', (e) => {
    const inp = e.target.closest('[data-usage-input]');
    if (!inp) return;
    const v = inp.value === '' ? NaN : Number(inp.value);
    inp.blur();
    if (!Number.isFinite(v)) { update({ weeklyUsage: null }); return; }
    const now = new Date();
    update({
      weeklyUsage: {
        utilization: Math.max(0, Math.min(100, v)),
        resetsAt: E.nextReset(now, cfg).toISOString(),
        at: now.toISOString(),
        source: 'manual',
      },
    });
  });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.closest('[data-usage-input]')) e.target.blur();
  });

  // Delegated actions inside rendered sections.
  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-action]');
    if (!a) return;
    if (a.dataset.action === 'ics-all') {
      download('365.ics', E.icsForPlan(plan, new Date()), 'text/calendar');
    } else if (a.dataset.action === 'step') {
      const { steps, idx } = stepState();
      const next = steps[Math.max(0, Math.min(steps.length - 1, (idx < 0 ? 0 : idx) + Number(a.dataset.dir)))];
      if (next && next.paid !== cfg.targetWindows) update({ targetWindows: next.paid });
    } else if (a.dataset.action === 'cal-toggle') {
      calExpanded = !calExpanded;
      renderAll();
      tickCountdowns(root);
      if (!calExpanded) root.querySelector('#calendar').closest('.card').scrollIntoView({ block: 'start', behavior: 'smooth' });
    } else if (a.dataset.action === 'redetect-locale') {
      const { country: c, tz } = detectCountry();
      update({
        country: c.code, locale: c.locale, currency: c.currency,
        price: cfg.priceSource === 'manual' ? cfg.price : E.planPrice(c.code, cfg.plan),
        ...rezone(tz), countrySource: 'detected', tzSource: 'detected', currencySource: 'country',
      }, { refill: true });
    } else if (a.dataset.action === 'usage-refresh' && hooks.detectReset) {
      refreshUsage(a);
    } else if (a.dataset.action === 'confirm-buy') {
      update({ currentStart: E.toWallInput(new Date(), cfg.tz), startSource: 'confirmed' }, { refill: true });
    }
  });

  function download(name, text, mime) {
    if (hooks.download) return hooks.download(name, text, mime);
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // ------------------------------------------------------------ rendering
  function renderAll() {
    const now = new Date();
    plan = E.buildPlan(cfg, now);
    f = E.makeFormatters(cfg);
    const s = plan.stats;
    const status = E.liveStatus(plan, now);

    els.zone.innerHTML = `<i class="dot"></i>${esc(E.zoneLabel(cfg, now))}`;
    els.heroBuy.innerHTML = heroBuyHTML(plan, status, f, now);
    // Don't rebuild the status block while someone is typing a usage % into it.
    if (!els.heroNow.contains(document.activeElement)) els.heroNow.innerHTML = statusHTML(plan, status, f, now, { canRefresh: !!hooks.detectReset });

    // setup hints
    if (plan.current) {
      const c = plan.current;
      els.startHint.innerHTML = `Ends <b>${esc(f.dateTime(c.end))}</b> · ${c.days} days · ${c.windows.length} windows`;
    } else {
      els.startHint.textContent = 'Leave empty if you are not subscribed right now.';
    }
    els.resetHint.innerHTML = `Resets every <b>${esc(f.resetLabel())}</b> → subscribe <b>${esc(f.buyLabel())}</b>`;
    if (els.detectMsg && !els.detect.disabled) {
      els.detectMsg.innerHTML = '<span class="src">Fills in your weekly reset, your plan and this week\'s usage %</span>';
    }
    renderBadges(now);

    // stats: every tile compares a yearly (auto-renew) subscription with the planned one
    els.stats.innerHTML = statsHTML(s);

    const totalMonths = renderCalendar(els.calendar, els.dayInfo, plan, f, now, { maxMonths: calExpanded ? Infinity : CAL_PREVIEW_MONTHS });
    const calBtn = root.querySelector('#cal-toggle');
    calBtn.hidden = totalMonths <= CAL_PREVIEW_MONTHS;
    calBtn.setAttribute('aria-expanded', String(calExpanded));
    calBtn.innerHTML = calExpanded
      ? `Show first ${CAL_PREVIEW_MONTHS} months only <span aria-hidden="true">▴</span>`
      : `Show all ${totalMonths} months <span aria-hidden="true">▾</span>`;
    renderTimeline(now);
    els.planNote.textContent = `${plan.periods.filter((p) => p.kind === 'planned').length} purchases · usually ${s.typicalGap || '—'}-day gaps`
      + (s.sharedEntries ? ` · ${s.sharedEntries} early re-buy${s.sharedEntries > 1 ? 's' : ''}` : ' · 6-week cycle');
    tickCountdowns(root);
  }

  // ------------------------------------------------------------ where each setup value came from
  function badge(src, at, now) {
    const when = at ? ` · ${relTime(new Date(at), now)}` : '';
    const B = {
      detected: ['ok', '✓ Auto-detected', 'Detected from this browser'],
      'claude.ai': ['ok', `✓ From claude.ai${when}`, 'Read from your claude.ai account'],
      'claude-code': ['ok', `✓ From Claude Code${when}`, 'Read from your Claude Code login'],
      confirmed: ['ok', '✓ Confirmed', 'Set when you pressed "I\'ve subscribed"'],
      country: ['', 'Follows country', 'Changes with the country you pick'],
      plan: ['', `${E.planById(cfg.plan).name} default`, 'Default price for this plan in your country'],
      manual: ['', 'Set by you', ''],
      default: ['', 'Default', ''],
    }[src] || ['', 'Set by you', ''];
    return `<span class="sb ${B[0]}" title="${esc(B[2])}">${esc(B[1])}</span>`;
  }

  function renderBadges(now) {
    const set = (k, html) => { const el = root.querySelector(`[data-src="${k}"]`); if (el) el.innerHTML = html; };
    const redetect = cfg.countrySource !== 'detected' || cfg.tzSource !== 'detected'
      ? ' <button type="button" class="linkbtn sb-link" data-action="redetect-locale">Re-detect</button>' : '';
    set('country', badge(cfg.countrySource) + redetect);
    set('tz', badge(cfg.tzSource));
    set('currency', badge(cfg.currencySource));
    set('price', badge(cfg.priceSource));
    set('reset', badge(cfg.resetSource, cfg.resetDetectedAt, now));
    set('start', cfg.currentStart
      ? badge(cfg.startSource || 'manual')
      : '<span class="sb" title="Store purchases (Google Play / App Store) are not visible to claude.ai, so this cannot be read from your account">Not set</span>');
    const planSrc = { 'claude.ai': 'detected from claude.ai', 'claude-code': 'detected from Claude Code', manual: 'set by you' }[cfg.planSource] || 'default';
    els.plan.title = `${E.planById(cfg.plan).usage} · ${planSrc}`;
    els.plan.classList.toggle('is-detected', cfg.planSource === 'claude.ai' || cfg.planSource === 'claude-code');
  }

  // ------------------------------------------------------------ stat tiles + counters
  /** Counter steps (one per purchase count) and where the current plan sits. */
  function stepState() {
    const steps = E.planSteps(cfg, new Date());
    const idx = steps.findIndex((st) => st.paid === plan.stats.windowsPaid && st.charges === plan.stats.charges);
    return { steps, idx };
  }

  /** dir: +1 = more purchases / paid windows; -1 = fewer. */
  function stepper(value, dir, label) {
    const { steps, idx } = stepState();
    const canUp = idx >= 0 && idx < steps.length - 1;
    const canDown = idx > 0;
    const minusOk = dir > 0 ? canDown : canUp;
    const plusOk = dir > 0 ? canUp : canDown;
    return `<div class="stepper mini" role="group" aria-label="${esc(label)}">
      <button type="button" class="step" data-action="step" data-dir="${-dir}" ${minusOk ? '' : 'disabled'} aria-label="Decrease ${esc(label)}">−</button>
      <b class="num">${value}</b>
      <button type="button" class="step" data-action="step" data-dir="${dir}" ${plusOk ? '' : 'disabled'} aria-label="Increase ${esc(label)}">+</button>
    </div>`;
  }

  function statsHTML(s) {
    const cmp = ({ k, cls = '', yearly, planned, sub = '' }) => `
      <div class="tile cmp-tile ${cls}">
        <div class="k">${k}</div>
        <div class="pair">
          <div class="side"><span class="lbl">Yearly sub</span><b class="num">${yearly}</b></div>
          <div class="side plan"><span class="lbl">Planned</span>${planned}</div>
        </div>
        ${sub ? `<div class="s">${sub}</div>` : ''}
      </div>`;
    const val = (v) => `<b class="num">${v}</b>`;
    const over = s.windowsPaid - s.weeksInHorizon;
    return [
      cmp({
        k: 'Cash · next 365 days', cls: 'accent wide',
        yearly: esc(f.money(s.autoCash)), planned: val(esc(f.money(s.cash))),
        sub: `You save <b class="num" style="color:var(--accent-ink)">${esc(f.money(s.saved))}</b> by buying ${s.charges} times instead of ${s.autoCharges}`,
      }),
      cmp({
        k: 'Purchases', yearly: s.autoCharges, planned: stepper(s.charges, 1, 'purchases'),
        sub: 'Each step adds the most windows for one more purchase',
      }),
      cmp({
        k: 'Weekly windows', cls: over > 0 ? 'over' : '',
        yearly: s.autoWindows, planned: stepper(s.windowsPaid, 1, 'weekly windows'),
        sub: `${s.windowsTouched} of ${s.weeksInHorizon} weekly caps usable`
          + (s.sharedEntries ? ` · ${s.sharedEntries} entry sprint${s.sharedEntries > 1 ? 's' : ''} re-buy within 7 days into an already-used week` : ''),
      }),
      cmp({
        k: 'Cost per usable window',
        yearly: esc(f.money2(s.autoCostPerWindow)), planned: val(esc(f.money2(s.costPerWindow))),
        sub: 'cash ÷ distinct weekly caps you can use',
      }),
      cmp({
        k: 'Paid days', yearly: 365, planned: val(s.paidDays),
        sub: `${s.gapDays} days on the free tier`,
      }),
      cmp({
        k: '<i class="bar" style="background:var(--green)"></i>Weekend rest days', cls: 'green',
        yearly: 0, planned: val(s.weekendGap), sub: 'Sat/Sun on the free tier',
      }),
      cmp({
        k: '<i class="bar" style="background:var(--blue)"></i>Compromised workdays', cls: 'blue',
        yearly: 0, planned: stepper(s.workdayGap, -1, 'compromised workdays'),
        sub: 'Weekdays on the free tier',
      }),
    ].join('');
  }

  function renderTimeline(now) {
    let n = 0;
    const rows = plan.periods.map((p) => {
      const planned = p.kind === 'planned';
      const done = p.end <= now;
      const active = p.start <= now && now < p.end;
      const last = p.windows[p.windows.length - 1];
      const exit = last && last.type !== 'full' ? `exit ${last.hours}h` : `last ${last.hours}h`;
      const total = p.windows.reduce((t, w) => t + w.hours, 0);
      const strip = p.windows.map((w) => `<i class="${w.type !== 'full' ? 'sprint' : ''}" style="flex:${(w.hours / total).toFixed(4)}"></i>`).join('');
      let note;
      if (!planned) note = '<span class="tag">Current</span>';
      else if (p.sharedEntry) note = '<span class="tag warn" title="Re-buy within 7 days: the entry sprint uses a weekly cap the last exit sprint already used">Early re-buy</span>';
      else note = '<span class="tag ok" title="Entry sprint starts on a fresh weekly cap">Fresh week</span>';
      const gap = p.gapBefore ? `${p.gapBefore.days} d` : (planned ? '0 d' : '—');
      return `<div class="pp-row ${planned ? '' : 'is-current'} ${done ? 'is-done' : ''} ${active ? 'is-active' : ''}" role="row">
        <span class="c-num" role="cell">${planned ? ++n : 'C'}</span>
        <span class="c-sub" role="cell"><b>${esc(f.shortDate(p.start))}</b> <span class="muted">${esc(f.time(p.start))}</span></span>
        <span class="c-end" role="cell"><span class="lbl-m">Ends </span>${esc(f.shortDate(p.end))} <span class="muted">${esc(f.time(p.end))}</span></span>
        <span class="c-win" role="cell"><span class="pp-strip">${strip}</span><span class="pp-wtxt"${p.short ? ` title="${p.days}-day month only fits ${p.windows.length} windows"` : ''}><b class="${p.short ? 'short' : ''}">${p.windows.length}</b> · ${exit}</span></span>
        <span class="c-meta">
          <span class="c-days" role="cell"><span class="lbl-m">Length </span>${p.days} d</span>
          <span class="c-gap" role="cell"><span class="lbl-m">Gap before </span>${gap}</span>
          <span class="c-note" role="cell">${note}</span>
        </span>
      </div>`;
    });
    els.timeline.innerHTML = rows.length
      ? `<div class="pp-row pp-head" role="row">
          <span role="columnheader">#</span><span role="columnheader">Subscribe</span><span role="columnheader">Ends</span>
          <span role="columnheader">Windows</span>
          <span class="c-meta"><span role="columnheader">Length</span><span role="columnheader">Gap before</span><span role="columnheader">Week</span></span>
        </div>${rows.join('')}`
      : '<p class="note">No periods yet.</p>';
  }

  // ------------------------------------------------------------ live updates
  fillSetup();
  renderAll();
  tickCountdowns(root);
  let lastMinute = new Date().getMinutes();
  setInterval(() => {
    const expired = tickCountdowns(root);
    const m = new Date().getMinutes();
    if (expired || m !== lastMinute) { lastMinute = m; renderAll(); tickCountdowns(root); }
  }, 1000);

  if (storage.subscribe) {
    storage.subscribe((next) => {
      if (!next) return;
      const incoming = JSON.stringify(E.normalizeConfig(next));
      if (incoming === JSON.stringify(cfg)) return;
      cfg = E.normalizeConfig(next);
      fillSetup();
      renderAll();
    });
  }
  if (document.body) {
    new MutationObserver(applyTheme).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }

  // Persist detected defaults (country, zone) on first run.
  if (!saved) persist();

  return { applyDetection: (res) => applyDetection(res), getConfig: () => ({ ...cfg }) };
}

function relTime(d, now) {
  const ms = now - d;
  if (ms < 2 * E.MINUTE) return 'just now';
  if (ms < E.HOUR) return `${Math.round(ms / E.MINUTE)} min ago`;
  if (ms < E.DAY) return `${Math.round(ms / E.HOUR)} h ago`;
  return `${Math.round(ms / E.DAY)} days ago`;
}

function skeleton(hooks) {
  return `
  <div class="app">
    <header class="topbar">
      <div class="brand">
        <div class="logo" aria-hidden="true">6</div>
        <div>
          <h1>6-Window Planner</h1>
          <p>Claude <select class="plan-pick" id="plan" aria-label="Claude plan"></select> quota tracker · 24h entry / 24h exit</p>
        </div>
      </div>
      <div class="top-actions">
        <span class="chip" id="zone"></span>
        <button class="icon-btn" id="theme" aria-label="Toggle theme">◐</button>
        <button class="icon-btn info" id="info" aria-label="Recurring subscription vs 6-window plan" title="Recurring subscription vs 6-window plan">i</button>
      </div>
    </header>

    <main class="grid">
      <section class="card hero span-12" aria-live="polite">
        <div class="hero-now" id="hero-now"></div>
        <div class="hero-buy" id="hero-buy"></div>
      </section>

      <section class="card span-5">
        <div class="card-head"><div><h2>Your setup</h2><p>Changes update the plan instantly</p></div></div>
        <div class="stack">
          <div class="row">
            <label class="field"><span class="flab">Country <em class="src-badge" data-src="country"></em></span><select class="input" id="country"></select></label>
            <label class="field"><span class="flab">Time zone <em class="src-badge" data-src="tz"></em></span><select class="input" id="tz"></select></label>
          </div>
          <div class="field">
            <span class="flab">Current subscription started <em class="src-badge" data-src="start"></em></span>
            <div style="display:flex;gap:8px">
              <input class="input" type="datetime-local" id="start">
              <button class="btn small" id="clear-start" type="button" title="I'm not subscribed now">Clear</button>
            </div>
            <small id="start-hint"></small>
          </div>
          <div class="field">
            <span class="flab">Weekly reset <em class="src-badge" data-src="reset"></em></span>
            <div class="pills" id="pills" role="group" aria-label="Reset day"></div>
            <input class="input" type="time" id="reset-time" aria-label="Reset time" style="margin-top:6px">
            <small id="reset-hint"></small>
          </div>
          <div class="detect ${hooks.detectReset ? '' : 'hidden'}">
            <div>
              <p><b class="head" style="font-size:.85rem">Auto-detect from your Claude account</b></p>
              <p id="detect-msg"></p>
            </div>
            <button class="btn primary small" id="detect" type="button">Detect reset</button>
          </div>
          ${hooks.detectHint ? `<p class="note">${hooks.detectHint}</p>` : ''}
          <div class="row-3">
            <label class="field"><span class="flab"><span id="price-label">Monthly price</span> <em class="src-badge" data-src="price"></em></span><input class="input" type="number" min="1" step="1" id="price"></label>
            <label class="field"><span class="flab">Currency <em class="src-badge" data-src="currency"></em></span><select class="input" id="currency"></select></label>
          </div>
          <label class="switch"><span class="label">Reminders<small>Subscribe, auto-renew off, exit sprint, expiry</small></span><input type="checkbox" id="notify"></label>
        </div>
      </section>

      <section class="card span-7">
        <div class="card-head"><div><h2>Next 365 days at a glance</h2><p>Yearly subscription (auto-renew) vs your planned purchases. Use − / + to change the plan.</p></div></div>
        <div class="stats" id="stats"></div>
      </section>

      <section class="card span-12">
        <div class="card-head">
          <div><h2>Calendar</h2><p>From your current subscription · expand for all 365 days. Gap days are colored by type: weekend rest vs compromised workday</p></div>
          <div class="legend">${LEGEND_HTML}</div>
        </div>
        <div class="months" id="calendar"></div>
        <div class="cal-more"><button type="button" class="btn" id="cal-toggle" data-action="cal-toggle" aria-controls="calendar"></button></div>
        <div class="day-info" id="day-info"></div>
      </section>

      <section class="card span-12">
        <div class="card-head"><div><h2>Purchase plan</h2><p id="plan-note"></p></div><button type="button" class="btn small" data-action="ics-all" title="Every purchase, exit sprint and expiry in the next 365 days, with reminders">Download 365.ics</button></div>
        <div class="pp" id="timeline" role="table" aria-label="Purchase plan"></div>
      </section>
    </main>
    <footer class="foot">Unofficial tool — not affiliated with Anthropic. All times shown in the selected time zone.</footer>
  </div>`;
}

export { stripHTML };
