// 6-Window planning engine — pure functions, no DOM.
// All wall-clock math happens in the configured IANA time zone (cfg.tz), so the
// plan is correct for the user's country regardless of the machine's own zone.

import { countryByCode, detectCountry, canonicalZone, planById, planFromHints as planFromHintsLocal, planPrice as planPriceLocal } from './countries.js';
export { PLANS, planById, planPrice, planFromHints } from './countries.js';

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
export const ENTRY_HOURS = 24;            // buy this many hours before a weekly reset
export const HORIZON_DAYS = 365;
export const TARGET_WINDOWS = 6;


// ---------------------------------------------------------------- config

export function defaultConfig() {
  const { country, tz } = detectCountry();
  // Default reset (Fri 06:30 IST) re-expressed in the detected zone.
  const r = convertReset({ resetDay: 5, resetTime: '06:30' }, 'Asia/Kolkata', tz);
  return {
    country: country.code,
    tz,
    locale: country.locale,
    currency: country.currency,
    plan: 'pro',               // 'pro' | 'max5' | 'max20'
    price: country.price,
    currentStart: '',          // 'YYYY-MM-DDTHH:MM' wall time in cfg.tz, '' = not subscribed
    resetDay: r.resetDay,      // 0 = Sunday … 6 = Saturday
    resetTime: r.resetTime,    // 'HH:MM'
    resetSource: 'default',    // 'default' | 'manual' | 'claude.ai' | 'claude-code'
    // Where the other setup values came from (shown as badges in Your setup):
    // 'detected' (browser) | 'country' (follows country) | 'plan' (plan default) | 'claude.ai' | 'claude-code' | 'manual' | 'default'
    countrySource: 'detected',
    tzSource: 'detected',
    currencySource: 'country',
    planSource: 'default',
    priceSource: 'plan',
    startSource: 'manual',
    resetDetectedAt: null,     // ISO
    weeklyUsage: null,         // { utilization, resetsAt, at, source }
    targetWindows: 60,         // planned weekly windows to pay for in 365 days; 0 = fresh weeks only
    notify: true,
    theme: 'auto',
  };
}

export function normalizeConfig(c) {
  const base = defaultConfig();
  const cfg = { ...base, ...(c || {}) };
  cfg.tz = canonicalZone(cfg.tz);
  if (!isValidZone(cfg.tz)) cfg.tz = base.tz;
  if (!cfg.locale) cfg.locale = countryByCode(cfg.country).locale;
  if (!cfg.currency) cfg.currency = countryByCode(cfg.country).currency;
  cfg.resetDay = clampInt(cfg.resetDay, 0, 6, base.resetDay);
  if (!/^\d{2}:\d{2}$/.test(cfg.resetTime || '')) cfg.resetTime = base.resetTime;
  cfg.plan = planById(cfg.plan).id;
  cfg.price = Number(cfg.price) > 0 ? Number(cfg.price) : base.price;
  cfg.targetWindows = clampInt(cfg.targetWindows, 0, 99, base.targetWindows);
  delete cfg.skipShortMonths;
  delete cfg.overlapBudget;
  cfg.usageHistory = recordUsage(cfg);
  return cfg;
}

/** Config patch for a plan found during detection (planSource is set even when the plan is unchanged). */
export function detectedPlanPatch(cfg, planHints, source) {
  const id = planFromHintsLocal(planHints);
  if (!id) return {};
  const src = /code/i.test(source || '') ? 'claude-code' : 'claude.ai';
  return id === cfg.plan
    ? { planSource: src }
    : { plan: id, planSource: src, price: planPriceLocal(cfg.country, id), priceSource: 'plan' };
}

// ---------------------------------------------------------------- usage history
//
// usageHistory: { "<week start ISO>": { pct, at } } — one reading per quota week,
// kept from detections and manual entries so past windows can show what was used.

function recordUsage(cfg) {
  const hist = cfg.usageHistory && typeof cfg.usageHistory === 'object' && !Array.isArray(cfg.usageHistory)
    ? { ...cfg.usageHistory } : {};
  const u = cfg.weeklyUsage;
  const end = u ? Date.parse(u.resetsAt || '') : NaN;
  if (u && Number.isFinite(u.utilization) && Number.isFinite(end)) {
    let key;
    try { key = addDays(new Date(end), -7, cfg.tz).toISOString(); } catch { key = new Date(end - 7 * DAY).toISOString(); }
    const prev = hist[key];
    if (!prev || Date.parse(u.at || 0) >= Date.parse(prev.at || 0)) {
      hist[key] = { pct: Math.max(0, Math.min(100, Number(u.utilization))), at: u.at || null };
    }
  }
  const keys = Object.keys(hist).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - 80))) delete hist[k];
  return hist;
}

/** Usage % recorded for the quota week starting at weekStart (±3h tolerance), or null. */
export function usageForWeek(cfg, weekStart) {
  const t = weekStart.getTime();
  for (const [k, v] of Object.entries(cfg.usageHistory || {})) {
    if (Math.abs(Date.parse(k) - t) <= 3 * HOUR) return v.pct;
  }
  return null;
}

// ---------------------------------------------------------------- counter steps
//
// "Early re-buys" come back within 7 days of expiry, so their entry sprint lands in
// the week the previous exit sprint already used: more paid windows (and paid days),
// same number of usable weekly caps. For each purchase count only the step with the
// most paid windows is worth offering — the others cost the same and give less.

const stepCache = new Map();

export function planSteps(rawCfg, now = new Date()) {
  const cfg = normalizeConfig(rawCfg);
  const { targetWindows, theme, notify, weeklyUsage, resetDetectedAt, resetSource, countrySource, tzSource, currencySource, planSource, priceSource, startSource, usageHistory, ...rest } = cfg;
  const key = JSON.stringify(rest) + toWallInput(now, cfg.tz).slice(0, 13);
  if (stepCache.has(key)) return stepCache.get(key);

  const counts = (budget) => {
    const pp = planPeriods(cfg, now, budget);
    const planned = pp.periods.filter((p) => p.kind === 'planned' && p.start >= pp.horizonStart && p.start < pp.horizonEnd);
    let paid = 0;
    const weeks = new Set();
    for (const p of pp.periods) {
      for (const w of p.windows) {
        if (overlap(w.start, w.end, pp.horizonStart, pp.horizonEnd) <= 0) continue;
        paid++;
        weeks.add(prevReset(new Date(Math.max(w.start, pp.horizonStart)), cfg).getTime());
      }
    }
    return { budget, charges: planned.length, paid, usable: weeks.size, shared: planned.filter((p) => p.sharedEntry).length };
  };

  const max = counts(40).shared;
  const best = new Map();
  for (let b = 0; b <= max; b++) {
    const c = counts(b);
    const prev = best.get(c.charges);
    if (!prev || c.paid > prev.paid || (c.paid === prev.paid && c.usable > prev.usable)) best.set(c.charges, c);
  }
  const steps = [...best.values()].sort((a, b) => a.charges - b.charges || a.paid - b.paid);
  if (stepCache.size > 50) stepCache.clear();
  stepCache.set(key, steps);
  return steps;
}

/** The step closest to cfg.targetWindows (0 = fresh weeks only, no early re-buys). */
export function chooseStep(cfg, now = new Date()) {
  if (!cfg.targetWindows) return { budget: 0, fresh: true };
  const steps = planSteps(cfg, now);
  let pick = steps[0];
  for (const s of steps) {
    if (Math.abs(s.paid - cfg.targetWindows) < Math.abs(pick.paid - cfg.targetWindows)) pick = s;
  }
  return pick || { budget: 0 };
}

function clampInt(v, lo, hi, dflt) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= lo && n <= hi ? n : dflt;
}

function isValidZone(tz) {
  if (!tz) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

// ---------------------------------------------------------------- time-zone wall clock

const partsCache = new Map();
function partsFormatter(tz) {
  let f = partsCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', weekday: 'short',
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric',
    });
    partsCache.set(tz, f);
  }
  return f;
}
const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Wall-clock parts of an instant in tz. mo is 0-based, wd 0 = Sunday. */
export function wall(date, tz) {
  const p = {};
  for (const { type, value } of partsFormatter(tz).formatToParts(date)) p[type] = value;
  return {
    y: +p.year, mo: +p.month - 1, d: +p.day,
    h: +p.hour % 24, mi: +p.minute, s: +p.second, wd: WD[p.weekday],
  };
}

function offsetAt(ms, tz) {
  const w = wall(new Date(ms), tz);
  return Date.UTC(w.y, w.mo, w.d, w.h, w.mi, w.s) - Math.floor(ms / 1000) * 1000;
}

/** Instant for a wall-clock time in tz (overflowing fields roll over, like Date.UTC). */
export function fromWall(y, mo, d, h = 0, mi = 0, tz) {
  const guess = Date.UTC(y, mo, d, h, mi);
  const off1 = offsetAt(guess, tz);
  let t = guess - off1;
  const off2 = offsetAt(t, tz);
  if (off2 !== off1) t = guess - off2;
  return new Date(t);
}

export function addDays(date, n, tz) {
  const w = wall(date, tz);
  return fromWall(w.y, w.mo, w.d + n, w.h, w.mi, tz);
}

/** Same day-of-month next month, same wall time; clamped to the month's last day. */
export function addMonth(date, tz) {
  const w = wall(date, tz);
  const lastDay = new Date(Date.UTC(w.y, w.mo + 2, 0)).getUTCDate();
  return fromWall(w.y, w.mo + 1, Math.min(w.d, lastDay), w.h, w.mi, tz);
}

export function startOfDay(date, tz) {
  const w = wall(date, tz);
  return fromWall(w.y, w.mo, w.d, 0, 0, tz);
}

export function parseWall(str, tz) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(str || '');
  if (!m) return null;
  return fromWall(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), tz);
}

export function toWallInput(date, tz) {
  const w = wall(date, tz);
  const p = (n) => String(n).padStart(2, '0');
  return `${w.y}-${p(w.mo + 1)}-${p(w.d)}T${p(w.h)}:${p(w.mi)}`;
}

function parseHM(t) {
  const [h, m] = String(t).split(':').map(Number);
  return [h || 0, m || 0];
}

// ---------------------------------------------------------------- resets & periods

/** First weekly reset after t (or at t when inclusive). */
export function nextReset(t, cfg, inclusive = false) {
  const [h, m] = parseHM(cfg.resetTime);
  const w = wall(t, cfg.tz);
  let r = fromWall(w.y, w.mo, w.d + ((cfg.resetDay - w.wd + 7) % 7), h, m, cfg.tz);
  if (inclusive ? r < t : r <= t) r = addDays(r, 7, cfg.tz);
  return r;
}

/** Latest weekly reset at or before t. */
export function prevReset(t, cfg) {
  return addDays(nextReset(t, cfg, false), -7, cfg.tz);
}

/** Re-express a reset day/time from one zone in another (same instant). */
export function convertReset({ resetDay, resetTime }, fromTz, toTz) {
  const probe = { resetDay, resetTime, tz: fromTz };
  const r = nextReset(new Date(), probe);
  const w = wall(r, toTz);
  const p = (n) => String(n).padStart(2, '0');
  return { resetDay: w.wd, resetTime: `${p(w.h)}:${p(w.mi)}` };
}

/** Reset day/time (in tz) from a detected reset instant (ISO string or Date). */
export function resetFromInstant(instant, tz) {
  const raw = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(raw.getTime())) return null;
  // Round to the nearest minute: APIs may report e.g. 00:59:59.999Z for a 01:00 reset.
  const d = new Date(Math.round(raw.getTime() / MINUTE) * MINUTE);
  const w = wall(d, tz);
  const p = (n) => String(n).padStart(2, '0');
  return { resetDay: w.wd, resetTime: `${p(w.h)}:${p(w.mi)}` };
}

/** One billing period: start → addMonth(start), split at weekly resets. */
export function periodFor(start, cfg, kind = 'planned') {
  const end = addMonth(start, cfg.tz);
  const bounds = [start];
  for (let r = nextReset(start, cfg); r < end; r = addDays(r, 7, cfg.tz)) bounds.push(r);
  bounds.push(end);
  const windows = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const s = bounds[i];
    const e = bounds[i + 1];
    if (e > s) windows.push({ start: s, end: e, hours: Math.round(((e - s) / HOUR) * 10) / 10 });
  }
  const n = windows.length;
  windows.forEach((w, i) => {
    if (w.hours >= 167) w.type = 'full';
    else if (i === 0) w.type = 'entry';
    else if (i === n - 1) w.type = 'exit';
    else w.type = 'full';
  });
  return { kind, start, end, days: Math.round((end - start) / DAY), windows };
}

/** Earliest buy moment (a reset minus ENTRY_HOURS) at or after t. */
export function buyMomentAtOrAfter(t, cfg) {
  const r = nextReset(new Date(t.getTime() + ENTRY_HOURS * HOUR), cfg, true);
  return new Date(r.getTime() - ENTRY_HOURS * HOUR);
}

/**
 * The next purchase must land in a later quota week than the previous period's
 * last window, otherwise its entry sprint shares an already-used weekly cap.
 * So: wait for the first reset at/after expiry, then take the next buy moment.
 */
export function earliestFreshBuy(prevEnd, cfg) {
  return buyMomentAtOrAfter(nextReset(prevEnd, cfg, true), cfg);
}

// ---------------------------------------------------------------- plan

/**
 * Periods only (no day/stat work): current period + planned purchases.
 * budget = how many re-buys may come back early (gap < 7 days) and so start
 * their entry sprint in the week the previous exit sprint already used.
 */
export function planPeriods(cfg, now, budget = 0) {
  const tz = cfg.tz;
  const horizonStart = startOfDay(now, tz);
  const horizonEnd = addDays(horizonStart, HORIZON_DAYS, tz);
  const periods = [];
  const weekOf = (t) => prevReset(t, cfg).getTime();
  const nextBound = (end) => {
    const fresh = earliestFreshBuy(end, cfg);
    const quick = buyMomentAtOrAfter(end, cfg);
    return budget > 0 && quick < fresh ? quick : fresh;
  };

  let current = null;
  let lowerBound = now;
  const cs = parseWall(cfg.currentStart, tz);
  if (cs) {
    current = periodFor(cs, cfg, 'current');
    periods.push(current);
    const b = nextBound(current.end);
    if (b > lowerBound) lowerBound = b;
  }

  let prevEnd = current ? current.end : null;
  let guard = 0;
  while (guard++ < 60) {
    const P = buyMomentAtOrAfter(lowerBound, cfg);
    if (P >= horizonEnd) break;
    const p = periodFor(P, cfg, 'planned');
    p.short = p.windows.length < TARGET_WINDOWS;
    p.gapBefore = prevEnd && prevEnd < P
      ? { start: prevEnd, end: P, days: Math.round(((P - prevEnd) / DAY) * 10) / 10 }
      : null;
    p.sharedEntry = !!prevEnd && weekOf(P) === weekOf(new Date(prevEnd - 1));
    if (p.sharedEntry) budget--;
    periods.push(p);
    prevEnd = p.end;
    lowerBound = nextBound(p.end);
  }
  periods.forEach((p, i) => { p.index = i; });
  return { periods, current, horizonStart, horizonEnd };
}

export function buildPlan(rawCfg, now = new Date()) {
  const cfg = normalizeConfig(rawCfg);
  const step = chooseStep(cfg, now);
  const plan = { cfg, now, step, ...planPeriods(cfg, now, step.budget) };
  plan.days = classifyDays(plan);
  // Calendar view also shows the current subscription's days before today.
  plan.calendarDays = plan.days;
  if (plan.current && plan.current.start < plan.horizonStart) {
    const from = startOfDay(plan.current.start, cfg.tz);
    let n = 0;
    for (let d = from; d < plan.horizonStart && n < 62; d = addDays(d, 1, cfg.tz)) n++;
    plan.calendarDays = [...classifyDays(plan, from, n), ...plan.days];
  }
  plan.stats = computeStats(plan);
  return plan;
}

// ---------------------------------------------------------------- days

export function classifyDays(plan, from = plan.horizonStart, count = HORIZON_DAYS) {
  const { cfg, periods } = plan;
  const tz = cfg.tz;
  const days = [];
  let dayStart = from;
  for (let i = 0; i < count; i++) {
    const dayEnd = addDays(dayStart, 1, tz);
    const len = dayEnd - dayStart;
    let covered = 0;
    let sprint = null;
    let buy = null;
    let expiry = null;
    let reset = false;
    for (const p of periods) {
      const ov = overlap(p.start, p.end, dayStart, dayEnd);
      if (ov > 0) {
        covered += ov;
        for (const w of p.windows) {
          if (w.type !== 'full' && overlap(w.start, w.end, dayStart, dayEnd) >= len / 2) {
            sprint = sprint || (w.type === 'entry' && p.sharedEntry ? 'shared' : w.type);
          }
        }
      }
      if (p.start >= dayStart && p.start < dayEnd) buy = p;
      if (p.end >= dayStart && p.end < dayEnd) expiry = p;
    }
    const r = nextReset(dayStart, cfg, true);
    if (r < dayEnd) reset = true;
    const wd = wall(dayStart, tz).wd;
    const paid = covered >= len / 2;
    days.push({
      date: dayStart, wd,
      weekend: wd === 0 || wd === 6,
      status: paid ? 'paid' : 'gap',
      sprint: paid ? sprint : null,
      coveredHours: Math.round((covered / HOUR) * 10) / 10,
      buy, expiry, reset,
    });
    dayStart = dayEnd;
  }
  return days;
}

function overlap(a1, a2, b1, b2) {
  return Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
}

// ---------------------------------------------------------------- stats

export function computeStats(plan) {
  const { cfg, periods, days, horizonStart, horizonEnd, current, now } = plan;
  const tz = cfg.tz;
  const planned = periods.filter((p) => p.kind === 'planned');
  const inHorizon = planned.filter((p) => p.start >= horizonStart && p.start < horizonEnd);

  let paid = 0, full = 0, entry = 0, exit = 0, plannedWindows = 0;
  const weeksSeen = new Set();
  for (const p of periods) {
    for (const w of p.windows) {
      if (overlap(w.start, w.end, horizonStart, horizonEnd) <= 0) continue;
      paid++;
      weeksSeen.add(prevReset(new Date(Math.max(w.start, horizonStart)), cfg).getTime());
      if (w.type === 'full') full++;
      else if (w.type === 'entry') entry++;
      else exit++;
    }
  }
  for (const p of inHorizon) plannedWindows += p.windows.length;
  const sharedEntries = inHorizon.filter((p) => p.sharedEntry).length;
  const freshPlanned = plannedWindows - sharedEntries;

  let weeks = 1;
  for (let r = nextReset(horizonStart, cfg); r < horizonEnd; r = addDays(r, 7, tz)) weeks++;

  // Model A: keep auto-renewing (from the current start, or from now if none).
  let autoCharges = 0;
  if (current) {
    for (let d = addMonth(current.start, tz); d < horizonEnd; d = addMonth(d, tz)) if (d >= horizonStart) autoCharges++;
  } else {
    for (let d = now; d < horizonEnd; d = addMonth(d, tz)) autoCharges++;
  }

  const gapDays = days.filter((d) => d.status === 'gap');
  const weekendGap = gapDays.filter((d) => d.weekend).length;
  const gaps = planned.filter((p) => p.gapBefore).map((p) => p.gapBefore.days);

  const cash = inHorizon.length * cfg.price;
  const autoCash = autoCharges * cfg.price;
  return {
    charges: inHorizon.length,
    cash,
    paidDays: days.length - gapDays.length,
    gapDays: gapDays.length,
    weekendGap,
    workdayGap: gapDays.length - weekendGap,
    windowsTouched: weeksSeen.size,       // distinct weekly caps you can actually use
    windowsPaid: paid,                    // windows you pay for (shared ones counted twice)
    weeksInHorizon: weeks,
    untouchedWeeks: Math.max(0, weeks - weeksSeen.size),
    sharedEntries,
    fullWindows: full,
    entryWindows: entry,
    exitWindows: exit,
    plannedWindows,
    freshPlannedWindows: freshPlanned,
    costPerWindow: freshPlanned ? cash / freshPlanned : 0,
    typicalGap: mode(gaps),
    shortPeriods: inHorizon.filter((p) => p.short).length,
    autoCharges,
    autoCash,
    autoWindows: weeks,
    autoCostPerWindow: weeks ? autoCash / weeks : 0,
    saved: autoCash - cash,
  };
}

function mode(arr) {
  if (!arr.length) return 0;
  const counts = new Map();
  for (const v of arr) counts.set(v, (counts.get(v) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

// ---------------------------------------------------------------- live status

export function liveStatus(plan, now = new Date()) {
  const { periods, cfg } = plan;
  const reset = nextReset(now, cfg);
  const nextBuy = periods.find((p) => p.kind === 'planned' && p.start > now) || null;
  const active = periods.find((p) => p.start <= now && now < p.end) || null;
  if (active) {
    const idx = active.windows.findIndex((w) => w.start <= now && now < w.end);
    const w = active.windows[idx];
    return {
      state: 'paid', period: active, windowIndex: idx, window: w,
      total: active.windows.length, expiresAt: active.end, nextReset: reset, nextBuy,
      windowProgress: (now - w.start) / (w.end - w.start),
      periodProgress: (now - active.start) / (active.end - active.start),
    };
  }
  const last = [...periods].reverse().find((p) => p.end <= now) || null;
  if (nextBuy) {
    const from = last ? last.end : now;
    const span = nextBuy.start - from;
    return {
      state: 'gap', nextBuy, lastEnd: last ? last.end : null, nextReset: reset,
      gapProgress: span > 0 ? (now - from) / span : 0,
    };
  }
  return { state: 'idle', nextReset: reset, nextBuy: null };
}

// ---------------------------------------------------------------- reminders

export function upcomingEvents(plan, after = new Date()) {
  const out = [];
  const add = (at, type, title, body) => { if (at > after) out.push({ at, type, title, body }); };
  const f = makeFormatters(plan.cfg);
  for (const p of plan.periods) {
    if (p.kind === 'planned') {
      add(new Date(p.start - 12 * HOUR), 'buy-soon', 'Subscribe in 12 hours',
        `Optimal subscribe time: ${f.dateTime(p.start)}.`);
      add(p.start, 'buy', `Subscribe to ${f.product} now`,
        `Entry sprint runs until the reset at ${f.dateTime(p.windows[0].end)}. Then switch auto-renew off.`);
      add(new Date(p.start.getTime() + 15 * MINUTE), 'cancel-renew', 'Turn off auto-renew',
        `Lock this period to one month — it ends ${f.dateTime(p.end)}.`);
    }
    const last = p.windows[p.windows.length - 1];
    if (last && last.type === 'exit') {
      add(last.start, 'exit', 'Exit sprint started',
        `The weekly meter just reset. You have ${last.hours}h until the plan ends at ${f.dateTime(p.end)}.`);
    }
    add(new Date(p.end - 2 * HOUR), 'expiry-soon', `${f.product} ends in 2 hours`, `Finish running agent tasks before ${f.time(p.end)}.`);
  }
  return out.sort((a, b) => a.at - b.at);
}

// ---------------------------------------------------------------- formatting

export function makeFormatters(cfg) {
  const { locale, tz, currency } = cfg;
  const mk = (o) => { try { return new Intl.DateTimeFormat(locale, { timeZone: tz, ...o }); } catch { return new Intl.DateTimeFormat('en-US', { timeZone: tz, ...o }); } };
  const dateF = mk({ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const shortDateF = mk({ weekday: 'short', day: 'numeric', month: 'short' });
  const timeF = mk({ hour: 'numeric', minute: '2-digit' });
  const monthF = mk({ month: 'long', year: 'numeric' });
  const wdF = mk({ weekday: 'short' });
  const wdLongF = mk({ weekday: 'long' });
  let money;
  try {
    money = new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 });
  } catch {
    money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  }
  let money2;
  try { money2 = new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 2 }); } catch { money2 = money; }
  const num = new Intl.NumberFormat(locale);
  // A fixed Sunday-based week for weekday names in this locale.
  const sunday = fromWall(2024, 0, 7, 12, 0, tz); // 7 Jan 2024 was a Sunday
  const weekdayNames = Array.from({ length: 7 }, (_, i) => wdF.format(addDays(sunday, i, tz)));
  const weekdayLong = Array.from({ length: 7 }, (_, i) => wdLongF.format(addDays(sunday, i, tz)));
  const plan = planById(cfg.plan);
  return {
    planName: plan.name,
    product: `Claude ${plan.name}`,
    date: (d) => dateF.format(d),
    shortDate: (d) => shortDateF.format(d),
    time: (d) => timeF.format(d),
    dateTime: (d) => `${shortDateF.format(d)}, ${timeF.format(d)}`,
    month: (d) => monthF.format(d),
    money: (v) => money.format(v),
    money2: (v) => money2.format(v),
    num: (v) => num.format(v),
    weekdayNames,
    weekdayLong,
    resetLabel: () => {
      const [h, m] = parseHM(cfg.resetTime);
      const ref = fromWall(2024, 0, 7 + cfg.resetDay, h, m, tz);
      return `${weekdayLong[cfg.resetDay]} ${timeF.format(ref)}`;
    },
    buyLabel: () => {
      const [h, m] = parseHM(cfg.resetTime);
      const ref = new Date(fromWall(2024, 0, 7 + cfg.resetDay, h, m, tz).getTime() - ENTRY_HOURS * HOUR);
      return `${wdLongF.format(ref)} ${timeF.format(ref)}`;
    },
  };
}

export function formatDuration(ms, { short = false } = {}) {
  if (ms <= 0) return short ? 'now' : '0m';
  const d = Math.floor(ms / DAY);
  const h = Math.floor((ms % DAY) / HOUR);
  const m = Math.floor((ms % HOUR) / MINUTE);
  const s = Math.floor((ms % MINUTE) / 1000);
  if (short) {
    if (d >= 1) return `${d}d`;
    if (h >= 1) return `${h}h`;
    return `${Math.max(m, 1)}m`;
  }
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

export function zoneLabel(cfg, at = new Date()) {
  try {
    const p = new Intl.DateTimeFormat(cfg.locale, { timeZone: cfg.tz, timeZoneName: 'short' }).formatToParts(at);
    const n = p.find((x) => x.type === 'timeZoneName');
    return `${cfg.tz.replace(/_/g, ' ')}${n ? ` (${n.value})` : ''}`;
  } catch {
    return cfg.tz;
  }
}

// ---------------------------------------------------------------- calendar export (.ics)

/** One calendar file for the whole 365-day plan: buy, exit-sprint and expiry events for every period. */
export function icsForPlan(plan, now = new Date()) {
  const { cfg } = plan;
  const f = makeFormatters(cfg);
  const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const text = (t) => String(t).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  const fold = (line) => {
    const out = [];
    let rest = line;
    while (rest.length > 74) { out.push(rest.slice(0, 74)); rest = ' ' + rest.slice(74); }
    out.push(rest);
    return out.join('\r\n');
  };
  const dtstamp = stamp(new Date());
  const events = [];
  const ev = (at, mins, summary, desc, uid) => {
    if (at < now) return;
    events.push(
      'BEGIN:VEVENT',
      `UID:${uid}-${at.getTime()}@six-window-planner`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART:${stamp(at)}`,
      `DTEND:${stamp(new Date(at.getTime() + mins * MINUTE))}`,
      `SUMMARY:${text(summary)}`,
      `DESCRIPTION:${text(desc)}`,
      'BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', `DESCRIPTION:${text(summary)}`, 'END:VALARM',
      'END:VEVENT',
    );
  };
  const planned = plan.periods.filter((p) => p.kind === 'planned');
  for (const p of plan.periods) {
    const n = planned.indexOf(p) + 1;
    const label = p.kind === 'planned' ? `purchase ${n} of ${planned.length}` : 'current period';
    if (p.kind === 'planned') {
      ev(p.start, 30, `Subscribe to ${f.product} (${label})`,
        `Entry sprint until the reset at ${f.dateTime(p.windows[0].end)}. Turn off auto-renew right after buying. ${p.windows.length} windows · ends ${f.dateTime(p.end)}.`
          + (p.sharedEntry ? ' Early re-buy: this entry sprint shares the week your last exit sprint used.' : ''), 'buy');
    }
    const last = p.windows[p.windows.length - 1];
    if (last && last.type === 'exit') {
      ev(last.start, 30, `Exit sprint starts (${label})`, `Weekly meter just reset. ${last.hours}h left until ${f.product} ends at ${f.dateTime(p.end)}.`, 'exit');
    }
    ev(p.end, 15, `${f.product} ends (${label})`, 'Free-tier gap starts until the next planned purchase.', 'end');
  }
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//6-Window Planner//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${text(`${f.product} 6-window plan`)}`,
    ...events,
    'END:VCALENDAR',
  ].map(fold).join('\r\n');
}
