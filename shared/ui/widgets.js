// Shared building blocks: subscribe hero, live status, ring, window strip.
// Used by the full planner, the Chrome popup and the VS Code webview.
import * as E from '../engine.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const TYPE_LABEL = { entry: 'Entry sprint', full: 'Full week', exit: 'Exit sprint' };

/** The period whose buy is "the one to act on": the next planned one, or a planned one whose buy window is open now. */
export function actionTarget(plan, status, now = new Date()) {
  if (status.state === 'paid' && status.period.kind === 'planned') {
    const entry = status.period.windows[0];
    if (now < entry.end) return { period: status.period, open: true };
  }
  return status.nextBuy ? { period: status.nextBuy, open: false } : null;
}

// ---------------------------------------------------------------- hero: optimal subscribe date

export function heroBuyHTML(plan, status, f, now = new Date(), { compact = false } = {}) {
  const t = actionTarget(plan, status, now);
  if (!t) {
    return `<div class="eyebrow">Optimal subscribe date</div>
      <div class="hero-date">Nothing to buy in the next 365 days</div>
      <p class="hero-sub">Check your settings.</p>`;
  }
  const p = t.period;
  const entry = p.windows[0];
  if (t.open) {
    return `<div class="eyebrow">● Buy window is open</div>
      <div class="hero-date">Subscribe now</div>
      <p class="hero-sub">Every hour you wait shortens window 1. It ends at the reset on ${esc(f.dateTime(entry.end))}.</p>
      ${countdownHTML(entry.end, 'left in entry sprint')}
      <div class="hero-actions">
        <button class="btn primary buy-now" data-action="confirm-buy">I've subscribed — track it</button>
        ${compact ? '' : '<button class="btn small" data-action="ics-all">Add 365-day plan to calendar</button>'}
      </div>`;
  }
  const tags = [];
  if (p.short) tags.push(`${p.windows.length} windows (${p.days}-day month)`);
  if (p.sharedEntry) tags.push('early re-buy: entry shares a used week');
  return `<div class="eyebrow">Optimal subscribe date</div>
    <div class="hero-date">${esc(f.date(p.start))}<br><span style="color:var(--accent)">${esc(f.time(p.start))}</span></div>
    <p class="hero-sub">24h before the ${esc(f.resetLabel())} reset · ${p.windows.length} windows · ends ${esc(f.shortDate(p.end))}${tags.length ? ` · ${esc(tags.join(' · '))}` : ''}</p>
    ${countdownHTML(p.start, 'until you subscribe')}
    ${compact ? '' : `<div class="hero-actions">
      <button class="btn small" data-action="ics-all">Add 365-day plan to calendar</button>
    </div>`}`;
}

export function countdownHTML(target, label) {
  return `<div class="countdown" data-cd="${target.getTime()}" aria-label="${esc(label)}">
    <div class="cd-unit"><b data-u="d">0</b><span>days</span></div>
    <div class="cd-unit"><b data-u="h">0</b><span>hours</span></div>
    <div class="cd-unit"><b data-u="m">0</b><span>min</span></div>
    <div class="cd-unit"><b data-u="s">0</b><span>sec</span></div>
  </div>`;
}

/** Update every countdown / relative-time element under root. Returns true if one hit zero. */
export function tickCountdowns(root, now = Date.now()) {
  let expired = false;
  root.querySelectorAll('[data-cd]').forEach((el) => {
    const ms = Math.max(0, Number(el.dataset.cd) - now);
    if (ms === 0) expired = true;
    const parts = {
      d: Math.floor(ms / E.DAY),
      h: Math.floor((ms % E.DAY) / E.HOUR),
      m: Math.floor((ms % E.HOUR) / E.MINUTE),
      s: Math.floor((ms % E.MINUTE) / 1000),
    };
    for (const [u, v] of Object.entries(parts)) {
      const b = el.querySelector(`[data-u="${u}"]`);
      if (b) b.textContent = u === 'd' ? String(v) : String(v).padStart(2, '0');
    }
  });
  root.querySelectorAll('[data-rel]').forEach((el) => {
    const ms = Number(el.dataset.rel) - now;
    if (ms <= 0) expired = true;
    el.textContent = E.formatDuration(ms);
  });
  return expired;
}

// ---------------------------------------------------------------- ring

export function ringSVG(status) {
  const total = status.state === 'paid' ? status.total : E.TARGET_WINDOWS;
  const idx = status.state === 'paid' ? status.windowIndex : -1;
  const cx = 60, cy = 60, r = 48, sw = 11;
  const gapDeg = total > 1 ? 6 : 0;
  const arc = (a0, a1) => {
    const rad = (a) => ((a - 90) * Math.PI) / 180;
    const x0 = cx + r * Math.cos(rad(a0)), y0 = cy + r * Math.sin(rad(a0));
    const x1 = cx + r * Math.cos(rad(a1)), y1 = cy + r * Math.sin(rad(a1));
    return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  };
  let segs = '';
  for (let i = 0; i < total; i++) {
    const a0 = (i * 360) / total + gapDeg / 2;
    const a1 = ((i + 1) * 360) / total - gapDeg / 2;
    segs += `<path d="${arc(a0, a1)}" stroke="var(--subtle)" stroke-width="${sw}" fill="none" stroke-linecap="round"/>`;
    if (i < idx) segs += `<path d="${arc(a0, a1)}" stroke="var(--accent)" stroke-opacity=".45" stroke-width="${sw}" fill="none" stroke-linecap="round"/>`;
    if (i === idx) {
      const end = a0 + Math.max(0.02, status.windowProgress) * (a1 - a0);
      segs += `<path d="${arc(a0, Math.max(end, a0 + 0.5))}" stroke="var(--accent)" stroke-width="${sw}" fill="none" stroke-linecap="round"/>`;
    }
  }
  let big = '—', small = '';
  if (status.state === 'paid') { big = `${idx + 1}/${total}`; small = 'WINDOW'; }
  else if (status.state === 'gap') { big = 'GAP'; small = 'FREE TIER'; }
  return `<svg class="ring" viewBox="0 0 120 120" role="img" aria-label="${status.state === 'paid' ? `Window ${idx + 1} of ${total}` : 'Free-tier gap'}">
    ${segs}
    <text x="60" y="62" text-anchor="middle" font-size="22" font-weight="600">${big}</text>
    <text x="60" y="80" text-anchor="middle" font-size="8.5" letter-spacing="1.5" style="fill:var(--muted)">${small}</text>
  </svg>`;
}

// ---------------------------------------------------------------- window strip

export function stripHTML(period, now = new Date(), f, cfg = null) {
  if (!period) return '';
  const total = period.windows.reduce((n, w) => n + w.hours, 0);
  const segs = period.windows.map((w) => {
    const past = now >= w.end;
    const cur = now >= w.start && now < w.end;
    const future = now < w.start;
    const used = cfg && !future ? E.usageForWeek(cfg, E.prevReset(w.start, cfg)) : null;
    const timePct = cur ? ((now - w.start) / (w.end - w.start)) * 100 : 0;
    const grow = Math.max(w.hours / total, 0.05);
    const label = used !== null ? `${Math.round(used)}%` : `${w.hours}h`;
    const tip = `${TYPE_LABEL[w.type]}: ${w.hours}h` + (used !== null ? ` · ${Math.round(used)}% of the weekly cap used` : (future ? '' : ' · usage not recorded'));
    return `<div class="seg ${w.type !== 'full' ? 'sprint' : ''} ${past ? 'past' : ''} ${cur ? 'cur' : ''} ${used !== null ? 'has-use' : ''} ${used !== null && used >= 50 ? 'dark' : ''}" style="flex:${grow.toFixed(4)}" title="${esc(tip)}">
      ${used !== null ? `<span class="use" style="width:${used.toFixed(1)}%"></span>` : ''}${cur ? `<span class="now-mark" style="left:${timePct.toFixed(1)}%"></span>` : ''}<span class="seg-l">${label}</span></div>`;
  }).join('');
  return `<div><div class="strip">${segs}</div>
    <div class="strip-legend"><span>${esc(f.shortDate(period.start))}</span><span>${cfg ? 'fill = weekly cap used · line = now' : ''}</span><span>${esc(f.shortDate(period.end))}</span></div></div>`;
}

// ---------------------------------------------------------------- live status block

export function statusHTML(plan, status, f, now = new Date(), { compact = false, canRefresh = false } = {}) {
  const cfg = plan.cfg;
  let title, meta, cdLabel, cdTarget, cdExtra = '', tip, strip;
  if (status.state === 'paid') {
    const w = status.window;
    title = `Window ${status.windowIndex + 1} of ${status.total} · ${TYPE_LABEL[w.type]}`;
    const isLast = status.windowIndex === status.total - 1;
    cdTarget = w.end;
    cdLabel = isLast ? `until ${f.planName} ends` : 'until the weekly reset';
    cdExtra = isLast
      ? `Next reset ${f.dateTime(status.nextReset)}`
      : `${f.planName} ends ${f.dateTime(status.expiresAt)}`;
    meta = `${status.period.kind === 'planned' ? 'Planned period' : 'Current period'} · started ${f.dateTime(status.period.start)}`;
    tip = w.type === 'entry' ? 'Entry sprint — burn this week\'s cap before the reset. Run heavy autonomous tasks now.'
      : w.type === 'exit' ? 'Exit sprint — the meter just reset. Use it all before the plan expires.'
      : 'Full week — steady pace, about 14% of the weekly cap per day. Use /clear and /effort low for routine work.';
    strip = stripHTML(status.period, now, f, cfg);
  } else if (status.state === 'gap') {
    title = 'Free-tier gap';
    cdTarget = status.nextBuy.start;
    cdLabel = 'until you subscribe';
    cdExtra = `Next reset ${f.dateTime(status.nextReset)}`;
    meta = status.lastEnd ? `${f.planName} ended ${f.dateTime(status.lastEnd)}` : 'Not subscribed';
    tip = 'Use the gap for design, schema planning and rest. Buying earlier would share an already-used weekly cap.';
    strip = stripHTML(status.nextBuy, now, f, cfg);
  } else {
    title = 'No upcoming period';
    meta = 'Enter your subscription details to start tracking.';
  }

  const usage = usageHTML(plan, status, f, now, { compact, canRefresh });

  return `<div class="now-top">
      ${ringSVG(status)}
      <div style="min-width:0">
        <div class="now-title">${esc(title)}</div>
        <p class="now-meta">${esc(meta)}</p>
        ${cdTarget ? `<div class="big-cd" data-rel="${cdTarget.getTime()}">${E.formatDuration(cdTarget - now)}</div>
        <div class="now-meta">${esc(cdLabel)}: <b class="cd-when">${esc(f.dateTime(cdTarget))}</b></div>
        <div class="now-meta">${esc(cdExtra)}</div>` : ''}
      </div>
    </div>
    ${usage}
    ${compact ? '' : strip || ''}
    ${tip && !compact ? `<p class="tip">${esc(tip)}</p>` : ''}`;
}

// ---------------------------------------------------------------- weekly usage + pace

function ago(iso, now) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return '';
  const ms = now - t;
  if (ms < 2 * E.MINUTE) return 'just now';
  if (ms < E.HOUR) return `${Math.round(ms / E.MINUTE)} min ago`;
  if (ms < E.DAY) return `${Math.round(ms / E.HOUR)} h ago`;
  return `${Math.round(ms / E.DAY)} d ago`;
}

/**
 * This week's usage with a pace check. "Ideal pace" assumes you want to use the whole
 * weekly cap by the end of the paid window you're in (end of the week, or when the plan
 * expires during an exit sprint).
 */
export function usageHTML(plan, status, f, now = new Date(), { compact = false, canRefresh = false } = {}) {
  const cfg = plan.cfg;
  const weekStart = E.prevReset(now, cfg);
  const weekEnd = E.nextReset(now, cfg);
  const u = cfg.weeklyUsage;
  const SRC = { manual: 'entered by you', 'claude.ai': 'from claude.ai', 'Claude Code': 'from Claude Code' };

  let pct = null;
  let note = '';
  if (u && Number.isFinite(u.utilization)) {
    const r = Date.parse(u.resetsAt || '');
    if (Number.isFinite(r) && r <= now.getTime()) {
      pct = 0;
      note = `New week since the last reading (${ago(u.at, now)}). Detect again to refresh.`;
    } else {
      pct = Math.max(0, Math.min(100, u.utilization));
      note = `${SRC[u.source] || `from ${u.source}`} · ${ago(u.at, now)}`;
    }
  }

  const input = compact ? '' : `<label class="usage-set" title="Type the % from Settings → Usage on claude.ai or /usage in Claude Code">
      <span>Used</span><input type="number" min="0" max="100" step="1" inputmode="numeric" data-usage-input value="${pct === null ? '' : Math.round(pct)}" placeholder="—"><span>%</span></label>`;

  const head = `<div class="usage-head">
      <span class="usage-k">This week's usage</span>
      <span class="usage-sub">${esc(f.shortDate(weekStart))} → ${esc(f.dateTime(weekEnd))}</span>
      ${input}
      ${canRefresh ? `<button type="button" class="usage-refresh" data-action="usage-refresh" title="Refresh from your Claude account${u && u.at ? ` (last read ${esc(ago(u.at, now))})` : ''}" aria-label="Refresh usage">↻</button>` : ''}
    </div>`;

  if (pct === null) {
    return `<div class="usage">${head}
      <div class="usage-bar empty"><i style="width:0"></i></div>
      ${compact ? '' : '<p class="usage-note">Not connected. Use Detect reset in the extension, or type the % from claude.ai → Settings → Usage.</p>'}
      ${restAlertHTML(plan, status, f, now, null)}
    </div>`;
  }

  // Pace within the paid part of this week.
  let paceHTML = '';
  let marker = '';
  let tone = '';
  if (status.state === 'paid') {
    const start = new Date(Math.max(status.window.start, weekStart));
    const end = status.window.end;
    const span = end - start;
    const frac = span > 0 ? Math.min(1, Math.max(0, (now - start) / span)) : 1;
    const ideal = frac * 100;
    marker = `<b class="usage-ideal" style="left:${ideal.toFixed(1)}%" title="Ideal pace now: ${Math.round(ideal)}%"></b>`;
    const endLabel = status.windowIndex === status.total - 1 ? `${f.planName} ends` : 'the reset';
    if (pct >= 99.5) {
      tone = 'hot';
      paceHTML = `Cap reached. Next reset ${esc(f.dateTime(weekEnd))}.`;
    } else if (frac > 0.05 && pct > 0) {
      const projected = pct / frac;
      if (projected > 105) {
        const capAt = new Date(start.getTime() + (now - start) * (100 / pct));
        tone = 'hot';
        paceHTML = `Ahead of pace: at this rate you hit the cap around <b>${esc(f.dateTime(capAt))}</b>, before ${esc(endLabel)}.`;
      } else if (projected < 90) {
        tone = 'cool';
        paceHTML = `Behind pace: about <b>${Math.round(100 - projected)}%</b> would be left unused when ${esc(endLabel === 'the reset' ? 'the week resets' : `${f.planName} ends`)}.`;
      } else {
        tone = 'ok';
        paceHTML = 'On pace to use the full weekly cap.';
      }
    } else if (pct === 0) {
      tone = 'cool';
      paceHTML = `Nothing used yet. Ideal pace now: ${Math.round(ideal)}%.`;
    }
  } else if (status.state === 'gap') {
    paceHTML = `Free tier now. Your next paid window starts ${esc(f.dateTime(status.nextBuy.start))}.`;
  }

  const rest = restAlertHTML(plan, status, f, now, pct);
  return `<div class="usage ${tone}">${head}
    <div class="usage-bar"><i style="width:${pct.toFixed(1)}%"></i>${marker}</div>
    <div class="usage-foot"><b class="num usage-pct">${Math.round(pct)}%</b><span>${paceHTML || ''}</span></div>
    <p class="usage-note" data-usage-note>${esc(note)}</p>
    ${rest}
  </div>`;
}

/**
 * "Complete rest" alert: when you're out of usable cap (or Pro), until when, with a countdown.
 * - cap used up → rest until the next weekly reset (or the next purchase if the plan ends first)
 * - on pace to hit the cap early → you'll be resting from that time
 * - free-tier gap → rest until the next purchase
 */
export function restAlertHTML(plan, status, f, now, pct) {
  const box = (cls, title, body, until) => `<div class="rest-alert ${cls}" role="status">
      <span class="ra-i" aria-hidden="true">${cls === 'done' ? '☾' : cls === 'soon' ? '◔' : '☾'}</span>
      <div><b>${title}</b><span>${body}</span>${until ? ` <span class="ra-cd">in <span data-rel="${until.getTime()}">${esc(E.formatDuration(until - now))}</span></span>` : ''}</div>
    </div>`;

  if (status.state === 'gap') {
    return box('done', `Complete rest until ${esc(f.dateTime(status.nextBuy.start))}`,
      'Free tier until your next planned purchase.', status.nextBuy.start);
  }
  if (status.state !== 'paid') return '';

  const isLast = status.windowIndex === status.total - 1;
  const windowEnd = status.window.end;
  // When the next usable cap starts after this window.
  const nextFresh = isLast ? (status.nextBuy ? status.nextBuy.start : null) : windowEnd;
  const restUntil = nextFresh ? `until ${esc(f.dateTime(nextFresh))}` : 'for now';
  const then = isLast
    ? `${esc(f.planName)} ends ${esc(f.dateTime(status.expiresAt))}; your next planned purchase is ${nextFresh ? esc(f.dateTime(nextFresh)) : 'not set'}.`
    : `The weekly cap resets ${esc(f.dateTime(windowEnd))}.`;

  if (pct !== null && pct >= 99.5) {
    return box('done', `Cap used up: complete rest ${restUntil}`, `Nothing left to use. ${then}`, nextFresh);
  }
  if (pct !== null && pct > 0) {
    const start = new Date(Math.max(status.window.start, E.prevReset(now, plan.cfg)));
    const frac = (now - start) / (windowEnd - start);
    if (frac > 0.05) {
      const capAt = new Date(start.getTime() + (now - start) * (100 / pct));
      if (capAt < windowEnd) {
        return box('soon', `At this pace you'll be resting from ${esc(f.dateTime(capAt))}`,
          `Then complete rest ${restUntil}. ${then}`, capAt);
      }
    }
  }
  if (isLast) {
    return box('soon', `Complete rest from ${esc(f.dateTime(status.expiresAt))}`,
      `${esc(f.planName)} ends then. Next purchase ${status.nextBuy ? esc(f.dateTime(status.nextBuy.start)) : 'not planned'}.`, status.expiresAt);
  }
  return '';
}
