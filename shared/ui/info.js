// "Info" dialog: normal recurring (auto-renew) subscription vs the 6-window plan, with live numbers.
import * as E from '../engine.js';
import { esc } from './widgets.js';

export function openInfo(plan, f) {
  const s = plan.stats;
  const cfg = plan.cfg;
  const gap = s.typicalGap || 12;
  const perChargeAuto = s.autoCharges ? (s.autoWindows / s.autoCharges).toFixed(1) : '—';
  const src = {
    default: 'the default (Friday 6:30 am IST, converted to your zone)',
    manual: 'set by you',
    'claude.ai': 'auto-detected from your claude.ai account',
    'claude-code': 'auto-detected from your Claude Code login',
  }[cfg.resetSource] || 'set by you';

  const card = (n, title, body, recurring, planned, key = false) => `
    <div class="diff ${key ? 'key' : ''}">
      <div class="n">${n}</div>
      <div>
        <h3>${esc(title)}</h3>
        ${body ? `<p>${body}</p>` : ''}
        <div class="vs"><div><b>Recurring</b>${recurring}</div><div class="new"><b>6-window plan</b>${planned}</div></div>
      </div>
    </div>`;

  const diff = (a, b, { money = false, money2 = false, invert = false } = {}) => {
    const d = b - a;
    if (Math.abs(d) < 0.005) return '<span class="muted">same</span>';
    const good = invert ? d < 0 : d > 0;
    const abs = Math.abs(d);
    const txt = money2 ? f.money2(abs) : money ? f.money(abs) : f.num(Math.round(abs));
    return `<span class="${good ? 'up' : 'down'}">${d > 0 ? '+' : '−'}${esc(txt)}</span>`;
  };
  const row = (k, a, b, fmt, opts) => `<tr><td>${esc(k)}</td><td>${fmt(a)}</td><td class="mine">${fmt(b)}</td><td>${diff(a, b, opts)}</td></tr>`;
  const n = (v) => esc(f.num(v));
  const m = (v) => esc(f.money(v));
  const m2 = (v) => esc(f.money2(v));

  const html = `
  <dialog class="info" aria-labelledby="info-title">
    <div class="info-head">
      <div>
        <h2 id="info-title" style="font-size:1.15rem">Recurring subscription vs 6-window plan</h2>
        <p class="note" style="margin-top:2px">Claude ${esc(f.planName)} · your next 365 days, recalculated live from your settings</p>
      </div>
      <button class="icon-btn" data-close aria-label="Close">✕</button>
    </div>
    <div class="info-body">
      <div class="sum">
        <div class="sum-i accent"><span>You save</span><b class="num">${m(s.saved)}</b><small>${s.charges} charges instead of ${s.autoCharges}</small></div>
        <div class="sum-i"><span>Weekly windows</span><b class="num">${s.windowsPaid} <i>vs ${s.autoWindows}</i></b><small>${s.windowsTouched} usable caps either way</small></div>
        <div class="sum-i"><span>Paid days</span><b class="num">${s.paidDays} <i>vs 365</i></b><small>${s.gapDays} days on the free tier</small></div>
      </div>

      ${card(1, 'When you pay',
        `Your weekly reset is ${esc(f.resetLabel())}, ${esc(src)}.`,
        `Auto-renews every month · ${s.autoCharges} charges a year`,
        `Buy ${esc(f.buyLabel())}, 24h before a reset, then turn auto-renew off · ${s.charges} charges`, true)}
      ${card(2, 'Windows per purchase',
        'A weekly cap resets on a fixed schedule, whatever day you pay. Starting 24h before a reset lets one month touch six of them.',
        `About ${perChargeAuto} weekly windows per charge`,
        '6 windows: 24h entry sprint · 4 full weeks · 24h exit sprint (48h in 31-day months)')}
      ${card(3, 'Between purchases',
        'The plan lets each period lapse and waits for the next buy moment. You spend those days on the free tier.',
        `Always on ${esc(f.planName)} · no gaps`,
        `${s.gapDays} free-tier days: ${s.weekendGap} weekend rest days, ${s.workdayGap} compromised workdays · usually ${gap}-day gaps`)}
      ${card(4, 'Early re-buys (the − / + counter)',
        `Buying doesn't reset the weekly meter. A re-buy within 7 days of expiry starts its entry sprint in a week your last exit sprint already used: more paid days and paid windows, but not more usable weekly caps (a year has ${s.weeksInHorizon}). Each counter step is the plan with the most windows for that number of purchases.`,
        `${s.autoWindows} windows · every week covered once`,
        `${s.windowsPaid} windows paid · ${s.sharedEntries} early re-buy${s.sharedEntries === 1 ? '' : 's'} · ${s.windowsTouched} of ${s.weeksInHorizon} caps usable`, true)}
      ${card(5, 'Billing months, currency and time',
        'Stores renew on the same date next month, so a period is 28–31 days. February periods fit only 5 windows. Prices, dates and times follow your country and time zone, including daylight saving.',
        `${m(cfg.price)} every month`,
        `${m(cfg.price)} per purchase · ${esc(E.zoneLabel(cfg))}`)}

      <h3 style="font-size:.95rem;margin-top:6px">Side by side · next 365 days</h3>
      <div class="table-wrap"><table class="cmp">
        <thead><tr><th>Metric</th><th>Recurring</th><th>6-window plan</th><th>Difference</th></tr></thead>
        <tbody>
          ${row('Purchases', s.autoCharges, s.charges, n, { invert: true })}
          ${row('Cash spent', s.autoCash, s.cash, m, { money: true, invert: true })}
          ${row('Weekly windows paid for', s.autoWindows, s.windowsPaid, n)}
          ${row('Usable weekly caps', s.autoWindows, s.windowsTouched, n)}
          ${row('Cost per usable window', s.autoCostPerWindow, s.costPerWindow, m2, { money2: true, invert: true })}
          ${row('Paid days', 365, s.paidDays, n)}
          ${row('Free-tier days', 0, s.gapDays, n, { invert: true })}
          ${row('· weekend rest days', 0, s.weekendGap, n, { invert: true })}
          ${row('· compromised workdays', 0, s.workdayGap, n, { invert: true })}
        </tbody>
      </table></div>
      <p class="note">Covers ${esc(f.date(plan.horizonStart))} → ${esc(f.date(E.addDays(plan.horizonEnd, -1, cfg.tz)))}. Your current period is already paid, so its charge isn't counted in either column. Unofficial tool, not affiliated with Anthropic.</p>
    </div>
  </dialog>`;

  const holder = document.createElement('div');
  holder.innerHTML = html.trim();
  const dlg = holder.firstElementChild;
  document.body.appendChild(dlg);
  dlg.addEventListener('close', () => dlg.remove());
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg || e.target.closest('[data-close]')) dlg.close();
  });
  dlg.showModal();
}
