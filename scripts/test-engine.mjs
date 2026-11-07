// node scripts/test-engine.mjs — engine checks (no dependencies).
import assert from 'node:assert/strict';
import * as E from '../shared/engine.js';

const IST = 'Asia/Kolkata';
// targetWindows: 0 = fresh-week rule only (no early re-buys); the app default is 60.
const base = (extra = {}) => E.normalizeConfig({
  country: 'IN', tz: IST, locale: 'en-IN', currency: 'INR', price: 1999,
  resetDay: 5, resetTime: '06:30', targetWindows: 0, ...extra,
});
const at = (s, tz = IST) => E.parseWall(s, tz);
const hours = (p) => p.windows.map((w) => w.hours);
const planned = (plan) => plan.periods.filter((p) => p.kind === 'planned');
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

console.log('engine');

test('addMonth clamps to month end', () => {
  assert.equal(E.toWallInput(E.addMonth(at('2027-01-31T10:00'), IST), IST), '2027-02-28T10:00');
  assert.equal(E.toWallInput(E.addMonth(at('2026-12-15T06:30'), IST), IST), '2027-01-15T06:30');
});

test('30-day period → 24 / 4×168 / 24', () => {
  const p = E.periodFor(at('2026-11-05T06:30'), base()); // Thu
  assert.deepEqual(hours(p), [24, 168, 168, 168, 168, 24]);
  assert.deepEqual(p.windows.map((w) => w.type), ['entry', 'full', 'full', 'full', 'full', 'exit']);
});

test('31-day period → exit window is 48h', () => {
  const p = E.periodFor(at('2026-12-03T06:30'), base());
  assert.deepEqual(hours(p), [24, 168, 168, 168, 168, 48]);
});

test('28-day February period only fits 5 windows (kept, flagged short)', () => {
  const p = E.periodFor(at('2027-02-11T06:30'), base());
  assert.equal(p.windows.length, 5);
  const plan = E.buildPlan(base({ currentStart: '2027-01-01T10:00' }), at('2026-12-15T12:00'));
  const first = planned(plan)[0];
  assert.equal(E.toWallInput(first.start, IST), '2027-02-11T06:30');
  assert.equal(first.short, true);
});

test('fresh rule: gap after a Fri 06:30 reset is Sat 06:30 → Thu 06:30 (12 days)', () => {
  const plan = E.buildPlan(base({ currentStart: '2026-11-05T06:30' }), at('2026-11-07T12:00'));
  const first = planned(plan)[0];
  assert.equal(E.toWallInput(first.start, IST), '2026-12-17T06:30');
  assert.equal(E.wall(first.start, IST).wd, 4);
  assert.equal(E.wall(plan.current.end, IST).wd, 6);
  assert.equal(first.gapBefore.days, 12);
});

test('fresh rule: every entry sprint is in a fresh quota week', () => {
  const plan = E.buildPlan(base({ currentStart: '2026-11-05T06:30' }), at('2026-11-07T12:00'));
  for (let i = 1; i < plan.periods.length; i++) {
    const prev = plan.periods[i - 1];
    const lastWeekStart = E.prevReset(new Date(prev.end - 1), plan.cfg);
    const entryWeekStart = E.prevReset(plan.periods[i].start, plan.cfg);
    assert.ok(entryWeekStart > lastWeekStart, `period ${i} shares a quota week`);
  }
  assert.equal(plan.stats.sharedEntries, 0);
});

test('Mon 10:00 reset moves every buy to 24h before a Mon 10:00 reset', () => {
  const plan = E.buildPlan(base({ resetDay: 1, resetTime: '10:00', currentStart: '2026-11-02T09:00', targetWindows: 60 }), at('2026-11-07T12:00'));
  for (const p of planned(plan)) {
    const r = E.wall(new Date(p.start.getTime() + E.ENTRY_HOURS * E.HOUR), IST);
    assert.deepEqual([r.wd, r.h, r.mi], [1, 10, 0]);
  }
});

test('works in a DST zone (America/New_York)', () => {
  const NY = 'America/New_York';
  const cfg = base({ tz: NY, locale: 'en-US', currency: 'USD', price: 20, resetDay: 4, resetTime: '21:00', currentStart: '2026-10-20T08:00', targetWindows: 60 });
  const plan = E.buildPlan(cfg, E.parseWall('2026-11-07T12:00', NY));
  for (const p of planned(plan)) {
    const w = E.wall(p.windows[0].end, NY);
    assert.deepEqual([w.wd, w.h], [4, 21]);
  }
});

test('convertReset keeps the same instant across zones', () => {
  assert.deepEqual(E.convertReset({ resetDay: 5, resetTime: '06:30' }, IST, 'UTC'), { resetDay: 5, resetTime: '01:00' });
});

test('day counts add up', () => {
  for (const t of [0, 60]) {
    const plan = E.buildPlan(base({ currentStart: '2026-11-05T06:30', targetWindows: t }), at('2026-11-07T12:00'));
    const s = plan.stats;
    assert.equal(plan.days.length, 365);
    assert.equal(s.weekendGap + s.workdayGap, s.gapDays);
    assert.equal(s.paidDays + s.gapDays, 365);
    assert.ok(s.windowsTouched <= s.weeksInHorizon);
  }
});

test('counter steps: one per purchase count, the one with the most paid windows', () => {
  const c = base({ currentStart: '2026-10-08T17:00' });
  const steps = E.planSteps(c, at('2026-11-07T12:00'));
  for (let i = 1; i < steps.length; i++) {
    assert.ok(steps[i].charges > steps[i - 1].charges);
    assert.ok(steps[i].paid > steps[i - 1].paid);
  }
  console.log(`    steps: ${steps.map((s) => `${s.paid} (${s.charges} buys)`).join(' → ')}`);
});

test('default target = 60 reproduces the PDF plan (10 charges, 60 paid windows)', () => {
  const c = E.normalizeConfig({ ...base({ currentStart: '2026-10-08T17:00' }), targetWindows: undefined });
  assert.equal(c.targetWindows, 60);
  const plan = E.buildPlan(c, at('2026-11-07T12:00'));
  const s = plan.stats;
  assert.equal(s.windowsPaid, 60);
  assert.equal(s.charges, 10);
  assert.ok(s.sharedEntries > 0);
  for (const p of planned(plan).filter((x) => x.sharedEntry)) assert.ok((p.gapBefore ? p.gapBefore.days : 0) < 7);
  console.log(`    60-plan: ${s.charges} charges, ₹${s.cash}, ${s.windowsPaid} paid / ${s.windowsTouched} usable, ` +
    `${s.paidDays} Pro days, ${s.gapDays} gap days (${s.weekendGap} weekend / ${s.workdayGap} workdays)`);
});

test('target snaps to the nearest available step', () => {
  const c = base({ currentStart: '2026-10-08T17:00' });
  const steps = E.planSteps(c, at('2026-11-07T12:00'));
  const plan = E.buildPlan({ ...c, targetWindows: steps[steps.length - 1].paid + 5 }, at('2026-11-07T12:00'));
  assert.equal(plan.stats.windowsPaid, steps[steps.length - 1].paid);
});

test('live status during a paid window and in a gap', () => {
  const plan = E.buildPlan(base({ currentStart: '2026-11-05T06:30' }), at('2026-11-07T12:00'));
  const paid = E.liveStatus(plan, at('2026-11-07T12:00'));
  assert.equal(paid.state, 'paid');
  assert.equal(paid.windowIndex, 1);
  const gap = E.liveStatus(plan, at('2026-12-08T12:00'));
  assert.equal(gap.state, 'gap');
  assert.equal(E.toWallInput(gap.nextBuy.start, IST), '2026-12-17T06:30');
});

test('reset detected from an ISO instant', () => {
  assert.deepEqual(E.resetFromInstant('2026-11-13T01:00:00Z', IST), { resetDay: 5, resetTime: '06:30' });
  assert.deepEqual(E.resetFromInstant('2026-11-13T00:59:59.999Z', IST), { resetDay: 5, resetTime: '06:30' });
  assert.deepEqual(E.resetFromInstant('2026-11-13T01:00:00Z', 'America/New_York'), { resetDay: 4, resetTime: '20:00' });
});

console.log(`\n${passed} passed`);
