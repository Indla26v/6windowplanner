// 365-day calendar: paid / sprint / gap (weekend vs workday) / buy / reset markings.
import * as E from '../engine.js';
import { esc } from './widgets.js';

export const LEGEND_HTML = `
  <span class="chip"><i class="sw paid"></i>Paid</span>
  <span class="chip"><i class="sw sprint"></i>Entry / exit sprint</span>
  <span class="chip"><i class="sw shared"></i>Early re-buy (used week)</span>
  <span class="chip"><i class="sw wkend"></i>Gap · weekend rest</span>
  <span class="chip"><i class="sw work"></i>Gap · compromised workday</span>
  <span class="chip"><i class="sw buy"></i>Subscribe day</span>
  <span class="chip"><i class="sw reset"></i>Weekly reset</span>`;

/** Renders up to maxMonths months; returns the total number of months in the 365-day view. */
export function renderCalendar(el, infoEl, plan, f, now = new Date(), { maxMonths = Infinity, fromCurrentMonth = false } = {}) {
  const tz = plan.cfg.tz;
  const days = plan.calendarDays || plan.days;
  const todayStart = E.startOfDay(now, tz);
  const byKey = new Map();
  days.forEach((d, i) => {
    const w = E.wall(d.date, tz);
    byKey.set(`${w.y}-${w.mo}-${w.d}`, i);
  });
  const todayW = E.wall(now, tz);
  const todayKey = `${todayW.y}-${todayW.mo}-${todayW.d}`;

  const first = E.wall(days[0].date, tz);
  const last = E.wall(days[days.length - 1].date, tz);
  const monthCount = (last.y - first.y) * 12 + (last.mo - first.mo) + 1;
  // Monday-first headers.
  const heads = [1, 2, 3, 4, 5, 6, 0].map((i) => `<div class="wh">${esc(f.weekdayNames[i].slice(0, 2))}</div>`).join('');

  let html = '';
  // fromCurrentMonth: skip months that are entirely behind today (used by the compact sidebar).
  const skip = fromCurrentMonth ? Math.max(0, (todayW.y - first.y) * 12 + (todayW.mo - first.mo)) : 0;
  for (let m = skip; m < Math.min(monthCount, skip + maxMonths); m++) {
    const y = first.y + Math.floor((first.mo + m) / 12);
    const mo = (first.mo + m) % 12;
    const firstDay = E.fromWall(y, mo, 1, 12, 0, tz);
    const lead = (E.wall(firstDay, tz).wd + 6) % 7;
    const dim = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
    let cells = '<div></div>'.repeat(lead);
    for (let d = 1; d <= dim; d++) {
      const key = `${y}-${mo}-${d}`;
      const i = byKey.get(key);
      const cls = ['day'];
      if (i !== undefined) {
        const day = days[i];
        cls.push('in');
        if (day.date < todayStart) cls.push('past');
        if (day.status === 'paid') cls.push(day.sprint === 'shared' ? 'shared' : day.sprint ? 'sprint' : 'paid');
        else cls.push('gap', day.weekend ? 'wkend' : 'work');
        if (day.buy) cls.push('buy');
        if (day.reset) cls.push('reset');
      }
      if (key === todayKey) cls.push('today');
      cells += `<div class="${cls.join(' ')}"${i !== undefined ? ` data-i="${i}" tabindex="-1"` : ''}>${d}</div>`;
    }
    html += `<div class="month"><h3>${esc(f.month(firstDay))}</h3><div class="wk">${heads}${cells}</div></div>`;
  }
  el.innerHTML = html;

  const describe = (i) => {
    const d = days[i];
    const bits = [];
    if (d.status === 'paid') {
      bits.push(d.sprint === 'shared' ? 'Paid · entry sprint in a week whose cap is already used (early re-buy)'
        : d.sprint ? `Paid · ${d.sprint === 'entry' ? 'entry' : 'exit'} sprint` : 'Paid · full week');
    } else {
      bits.push(d.weekend ? 'Free-tier gap · weekend rest day' : 'Free-tier gap · compromised workday');
    }
    if (d.buy) bits.push(d.buy.kind === 'planned' ? `Subscribe at ${f.time(d.buy.start)}` : `Current subscription started at ${f.time(d.buy.start)}`);
    if (d.expiry) bits.push(`${f.planName} ends at ${f.time(d.expiry.end)}`);
    if (d.reset) bits.push(`Weekly reset at ${f.time(E.nextReset(d.date, plan.cfg, true))}`);
    return `<b class="num">${esc(f.date(d.date))}</b> — ${esc(bits.join(' · '))}`;
  };
  const idle = `<span class="muted">Hover or tap a day for details. ${plan.stats.gapDays} gap days in the next year: ${plan.stats.weekendGap} weekend rest days, ${plan.stats.workdayGap} compromised workdays.</span>`;
  infoEl.innerHTML = idle;
  const show = (e) => {
    const t = e.target.closest('[data-i]');
    if (t) infoEl.innerHTML = describe(Number(t.dataset.i));
  };
  el.onmouseover = show;
  el.onclick = show;
  el.onmouseleave = () => { infoEl.innerHTML = idle; };
  return monthCount;
}
