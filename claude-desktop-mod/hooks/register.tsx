// 6-Window Planner for Claude Code Desktop: a pane beside the chat with the optimal
// subscribe countdown, the current quota window, live weekly usage (straight from
// Claude Code's own rate-limit readings), rest alerts, next purchases and setup.
// The planning engine is the same one the Chrome and VS Code extensions use.
import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { LimitReading, PlannerConfig } from '../types'
import * as E from './lib/engine.js'
import { COUNTRIES, countryByCode } from './lib/countries.js'

const PANE = 'six-window'
const TITLE = '6-Window Planner'
const ACCENT = '#d97757'
const GREEN = '#788c5d'
const BLUE = '#6a9bcc'
const TRACK = '#b0aea5'

const config = atom({ plugin: 'six-window-planner', key: 'config' } as const, null as PlannerConfig | null, { shape: 'config-1' })
const limits = atom({ plugin: 'six-window-planner', key: 'limits' } as const, [] as LimitReading[])
const tick = atom({ plugin: 'six-window-planner', key: 'tick' } as const, 0)
const notice = atom({ plugin: 'six-window-planner', key: 'notice' } as const, '')

let timer: { cancel: () => void } | null = null

// ------------------------------------------------------------------ settings

async function saveConfig($: any, change: (c: any) => any) {
  await update($, config, (c) => E.normalizeConfig(change(E.normalizeConfig(c))) as PlannerConfig)
  await $.store.set('config', await read($, config))
}

/** Feed Claude Code's own rate-limit readings into the plan: weekly usage + exact reset. */
async function applyLimits($: any, rateLimits: readonly LimitReading[] | undefined) {
  const list = (rateLimits ?? []).map((l) => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt }))
  await update($, limits, () => list)
  const week = list.find((l) => l.kind === 'seven_day')
  if (!week || !week.resetsAt) return
  const resetsAt = week.resetsAt
  await saveConfig($, (c) => {
    const prev = c.weeklyUsage
    const r = E.resetFromInstant(resetsAt, c.tz) ?? {}
    const same = prev && prev.utilization === week.percentUsed && prev.resetsAt === resetsAt
      && c.resetSource === 'claude-code' && (r as any).resetTime === c.resetTime && (r as any).resetDay === c.resetDay
    if (same) return c
    const at = new Date().toISOString()
    return {
      ...c, ...r,
      resetSource: 'claude-code', resetDetectedAt: at,
      weeklyUsage: { utilization: week.percentUsed, resetsAt, at, source: 'Claude Code' },
    }
  })
}

// ------------------------------------------------------------------ small helpers

function dur(ms: number): string {
  if (ms <= 0) return 'now'
  const d = Math.floor(ms / E.DAY)
  const h = Math.floor((ms % E.DAY) / E.HOUR)
  const m = Math.floor((ms % E.HOUR) / E.MINUTE)
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  return `${Math.max(m, 1)}m`
}

function ringSvg(total: number, idx: number, progress: number, label: string, sub: string): string {
  const cx = 60, cy = 60, r = 46, sw = 11
  const gap = total > 1 ? 6 : 0
  const rad = (a: number) => ((a - 90) * Math.PI) / 180
  const arc = (a0: number, a1: number) => {
    const x0 = cx + r * Math.cos(rad(a0)), y0 = cy + r * Math.sin(rad(a0))
    const x1 = cx + r * Math.cos(rad(a1)), y1 = cy + r * Math.sin(rad(a1))
    return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`
  }
  let segs = ''
  for (let i = 0; i < total; i++) {
    const a0 = (i * 360) / total + gap / 2
    const a1 = ((i + 1) * 360) / total - gap / 2
    segs += `<path d="${arc(a0, a1)}" stroke="${TRACK}" stroke-opacity=".35" stroke-width="${sw}" fill="none" stroke-linecap="round"/>`
    if (i < idx) segs += `<path d="${arc(a0, a1)}" stroke="${ACCENT}" stroke-opacity=".5" stroke-width="${sw}" fill="none" stroke-linecap="round"/>`
    if (i === idx) segs += `<path d="${arc(a0, Math.max(a0 + 0.5, a0 + progress * (a1 - a0)))}" stroke="${ACCENT}" stroke-width="${sw}" fill="none" stroke-linecap="round"/>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">${segs}`
    + `<text x="60" y="64" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="24" font-weight="700" fill="${ACCENT}">${label}</text>`
    + `<text x="60" y="82" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="9" letter-spacing="1.5" fill="${TRACK}">${sub}</text></svg>`
}

const TYPE_LABEL: Record<string, string> = { entry: 'Entry sprint', full: 'Full week', exit: 'Exit sprint' }

/** Pace + "complete rest" text for this week's usage (same rules as the extensions). */
function paceAndRest(plan: any, status: any, f: any, now: Date, pct: number | null) {
  let pace = ''
  let tone = TRACK
  let rest = ''
  if (status.state === 'gap') {
    return { pace: `Free tier now. Next paid window starts ${f.dateTime(status.nextBuy.start)}.`, tone, rest: `Complete rest until ${f.dateTime(status.nextBuy.start)} · in ${dur(status.nextBuy.start - now.getTime())}` }
  }
  if (status.state !== 'paid') return { pace, tone, rest }
  const isLast = status.windowIndex === status.total - 1
  const weekStart = E.prevReset(now, plan.cfg)
  const start = new Date(Math.max(status.window.start, weekStart.getTime()))
  const end = status.window.end
  const frac = Math.min(1, Math.max(0, (now.getTime() - start.getTime()) / (end - start.getTime())))
  const nextFresh = isLast ? (status.nextBuy ? status.nextBuy.start : null) : end
  const until = nextFresh ? `until ${f.dateTime(nextFresh)}` : 'for now'
  if (pct !== null) {
    if (pct >= 99.5) {
      tone = ACCENT
      pace = `Cap used up. Next reset ${f.dateTime(E.nextReset(now, plan.cfg))}.`
      rest = `Cap used up: complete rest ${until}${nextFresh ? ` · in ${dur(nextFresh - now.getTime())}` : ''}`
    } else if (frac > 0.05 && pct > 0) {
      const projected = pct / frac
      if (projected > 105) {
        const capAt = new Date(start.getTime() + (now.getTime() - start.getTime()) * (100 / pct))
        tone = ACCENT
        pace = `Ahead of pace: cap reached around ${f.dateTime(capAt)}.`
        rest = `At this pace you'll be resting from ${f.dateTime(capAt)}, then ${until}.`
      } else if (projected < 90) {
        tone = BLUE
        pace = `Behind pace: about ${Math.round(100 - projected)}% would be left unused when ${isLast ? `${f.planName} ends` : 'the week resets'}.`
      } else {
        tone = GREEN
        pace = 'On pace to use the full weekly cap.'
      }
    }
  }
  if (!rest && isLast) rest = `Complete rest from ${f.dateTime(status.expiresAt)} (${f.planName} ends) · in ${dur(status.expiresAt - now.getTime())}`
  return { pace, tone, rest }
}

function parseStart(text: string): string | null {
  const m = /^\s*(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T]+(\d{1,2}):(\d{2}))?\s*$/.exec(text)
  if (!m) return null
  const p = (n: string) => n.padStart(2, '0')
  return `${m[1]}-${p(m[2] ?? '1')}-${p(m[3] ?? '1')}T${p(m[4] ?? '0')}:${p(m[5] ?? '00')}`
}

function rezone(c: any, nextTz: string) {
  if (nextTz === c.tz) return {}
  const patch: any = { tz: nextTz, ...E.convertReset(c, c.tz, nextTz) }
  const cs = E.parseWall(c.currentStart, c.tz)
  if (cs) patch.currentStart = E.toWallInput(cs, nextTz)
  return patch
}

// ------------------------------------------------------------------ register

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    const stored = await $.store.get('config')
    if (!(await read($, config))) {
      await update($, config, () => E.normalizeConfig(stored ?? null) as PlannerConfig)
      if (!stored) await $.store.set('config', await read($, config))
    }
    await $.command.register({
      name: 'six-window',
      description: 'Open the 6-Window Planner pane (also: start 2026-10-08 17:00 · subscribed · plan max5 · windows 60 · price 1999)',
    })
    try { await applyLimits($, (await $.session.usage()).rateLimits as LimitReading[]) } catch { /* no reading yet */ }
    timer?.cancel()
    timer = $.clock.every(30_000, () => update($, tick, (n) => (n ?? 0) + 1)) as any
    void $.ui.open({ id: PANE, title: TITLE })

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    timer?.cancel()
    timer = null
    return next(e)
  })

  // Pushed by Claude Code whenever a rate-limit window moves a whole point.
  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) await applyLimits($, e.rateLimits as LimitReading[])
    return next(e)
  })

  on('command.run', { command: 'six-window' }, async ($, e) => {
    const [verb = '', ...rest] = e.args.trim().split(/\s+/)
    const arg = rest.join(' ')
    const done = async (text: string) => { await $.ui.open({ id: PANE, title: TITLE }); return { text } }
    switch (verb.toLowerCase()) {
      case '':
        return done('6-Window Planner pane opened.')
      case 'start': {
        const v = parseStart(arg)
        if (!v) return { text: 'Use: /six-window start YYYY-MM-DD HH:MM (e.g. 2026-10-08 17:00)' }
        await saveConfig($, (c) => ({ ...c, currentStart: v, startSource: 'manual' }))
        return done(`Current subscription start set to ${v.replace('T', ' ')}.`)
      }
      case 'clear':
        await saveConfig($, (c) => ({ ...c, currentStart: '' }))
        return done('Current subscription cleared (not subscribed).')
      case 'subscribed':
        await saveConfig($, (c) => ({ ...c, currentStart: E.toWallInput(new Date(), c.tz), startSource: 'confirmed' }))
        return done('Tracking a new period that started now. Remember to switch auto-renew off.')
      case 'plan': {
        const p = E.PLANS.find((x) => x.id === arg.toLowerCase() || x.name.toLowerCase().replace(/\s+/g, '') === arg.toLowerCase().replace(/\s+/g, ''))
        if (!p) return { text: `Use: /six-window plan ${E.PLANS.map((x) => x.id).join(' | ')}` }
        await saveConfig($, (c) => ({ ...c, plan: p.id, planSource: 'manual', price: E.planPrice(c.country, p.id), priceSource: 'plan' }))
        return done(`Plan set to Claude ${p.name}.`)
      }
      case 'windows': {
        const n = Number(arg)
        if (!Number.isFinite(n) || n < 0) return { text: 'Use: /six-window windows 60' }
        await saveConfig($, (c) => ({ ...c, targetWindows: Math.round(n) }))
        return done(`Planned windows set to ${Math.round(n)} (snaps to the nearest useful step).`)
      }
      case 'price': {
        const n = Number(arg)
        if (!(n > 0)) return { text: 'Use: /six-window price 1999' }
        await saveConfig($, (c) => ({ ...c, price: n, priceSource: 'manual' }))
        return done(`Monthly price set to ${n}.`)
      }
      default:
        return { text: 'Use: /six-window [start YYYY-MM-DD HH:MM | subscribed | clear | plan pro|max5|max20 | windows N | price N]' }
    }
  })

  // ---------------------------------------------------------------- the pane
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const T: any = $.ui.resolve(e)
    const { Box, Text, Button } = T
    await read($, tick) // redraw every 30 s
    const cfg = E.normalizeConfig(await read($, config))
    const lims = await read($, limits)
    const msg = await read($, notice)
    const now = new Date()
    const plan = E.buildPlan(cfg, now)
    const f = E.makeFormatters(cfg)
    const status = E.liveStatus(plan, now)
    const s = plan.stats
    const canSvg = !!T.Svg
    const canInput = !!T.Input && !!T.Select

    const set = (change: (c: any) => any, text = '') => async () => {
      await saveConfig($, change)
      await update($, notice, () => text)
    }

    // ---------- building blocks (one visual language for every section)
    const SOFT = `${TRACK}1f`
    const LINE = `${TRACK}40`
    const ROUND = e.surface !== 'terminal'
    const rnd = (color: string) => (ROUND ? { borderStyle: 'round', borderColor: color } : {})
    const Section = (props: { title: string; right?: any; accent?: boolean; children?: any }) => (
      <Box flexDirection="column" borderStyle="round" borderColor={props.accent ? ACCENT : LINE} paddingX={1} paddingY={1} gap={1}>
        <Box flexDirection="row" justifyContent="space-between" alignItems="center">
          <Text size="caption" weight="semibold" color={props.accent ? ACCENT : TRACK}>{props.title}</Text>
          {props.right ?? null}
        </Box>
        {props.children}
      </Box>
    )
    const Pill = (props: { text: string; color: string }) => (
      <Text size="caption" weight="semibold" color={props.color}>{props.text}</Text>
    )
    const Dot = () => <Text size="caption" dimColor> · </Text>
    const Bar = (props: { value: number | null; color: string }) => (
      <Box width="100%" height={1} backgroundColor={`${TRACK}33`} overflow="hidden">
        {props.value !== null && props.value > 0 && <Box width={`${Math.round(Math.max(0, Math.min(100, props.value)))}%`} height={1} backgroundColor={props.color} />}
      </Box>
    )
    const Stat = (props: { k: string; v: string; sub?: string; color?: string }) => (
      <Box flexDirection="column" flexGrow={1} width="47%" backgroundColor={SOFT} {...rnd(SOFT)} paddingX={1} paddingY={1} gap={0}>
        <Text size="caption" color={TRACK}>{props.k}</Text>
        <Text size="heading" weight="bold" color={props.color} tabular>{props.v}</Text>
        {props.sub && <Text size="caption" dimColor>{props.sub}</Text>}
      </Box>
    )

    // ---------- 1. optimal subscribe date
    const openNow = status.state === 'paid' && status.period.kind === 'planned' && now < status.period.windows[0].end
    const target = openNow ? status.period : status.nextBuy
    const buyCard = !target
      ? <Section title="OPTIMAL SUBSCRIBE DATE"><Text dimColor>Nothing to buy in the next 365 days.</Text></Section>
      : (
        <Section title={openNow ? 'BUY WINDOW IS OPEN' : 'OPTIMAL SUBSCRIBE DATE'} accent>
          <Box flexDirection="column" gap={0}>
            <Text size="heading" weight="semibold">{openNow ? 'Subscribe now' : `${f.shortDate(target.start)} · ${f.time(target.start)}`}</Text>
            <Text size="title" weight="bold" color={ACCENT} tabular>{dur((openNow ? target.windows[0].end : target.start) - now.getTime())}</Text>
            <Text size="caption" dimColor>
              {openNow ? `left in the entry sprint · ends ${f.dateTime(target.windows[0].end)}` : `until you subscribe · 24h before the ${f.resetLabel()} reset`}
            </Text>
          </Box>
          <Text>
            <Pill text={`${target.windows.length} windows`} color={target.windows.length >= 6 ? GREEN : ACCENT} /><Dot />
            <Text size="caption" dimColor>ends {f.shortDate(target.end)}</Text><Dot />
            <Pill text={target.sharedEntry ? 'Early re-buy' : 'Fresh week'} color={target.sharedEntry ? ACCENT : GREEN} />
          </Text>
          {openNow && <Button key="confirm" label="I've subscribed — track it" variant="primary"
            onPress={set((c) => ({ ...c, currentStart: E.toWallInput(new Date(), c.tz), startSource: 'confirmed' }), 'Tracking the new period. Switch auto-renew off.')} />}
        </Section>
      )

    // ---------- 2. right now: window, usage, rest
    const week = lims.find((l) => l.kind === 'seven_day')
    const five = lims.find((l) => l.kind === 'five_hour')
    const pct = week ? week.percentUsed : (cfg.weeklyUsage && Number.isFinite(cfg.weeklyUsage.utilization) && Date.parse(cfg.weeklyUsage.resetsAt) > now.getTime() ? cfg.weeklyUsage.utilization : null)
    const { pace, tone, rest } = paceAndRest(plan, status, f, now, pct)
    const toneColor = tone === TRACK ? ACCENT : tone
    let title = 'No upcoming period'
    let detail: string[] = []
    let big = ''
    let ring = { total: 6, idx: -1, progress: 0, label: '—', sub: '' }
    if (status.state === 'paid') {
      const w = status.window
      const isLast = status.windowIndex === status.total - 1
      title = TYPE_LABEL[w.type] ?? 'Window'
      big = dur(w.end - now.getTime())
      detail = [
        isLast ? `until ${f.planName} ends` : 'until the weekly reset',
        isLast ? `${f.planName} ends ${f.dateTime(status.expiresAt)}` : `${f.planName} ends ${f.dateTime(status.expiresAt)}`,
      ]
      ring = { total: status.total, idx: status.windowIndex, progress: status.windowProgress, label: `${status.windowIndex + 1}/${status.total}`, sub: 'WINDOW' }
    } else if (status.state === 'gap') {
      title = 'Free tier'
      detail = [
        status.lastEnd ? `${f.planName} ended ${f.dateTime(status.lastEnd)}` : 'Not subscribed',
        `Next reset ${f.dateTime(status.nextReset)}`,
      ]
      ring = { total: 6, idx: -1, progress: 0, label: 'GAP', sub: 'FREE TIER' }
    }

    const stripPeriod = status.state === 'paid' ? status.period : status.nextBuy
    const strip = stripPeriod && (
      <Box flexDirection="column" gap={0}>
        <Text size="caption" color={TRACK}>{status.state === 'paid' ? 'THIS PERIOD' : 'NEXT PERIOD'} · {f.shortDate(stripPeriod.start)} → {f.shortDate(stripPeriod.end)}</Text>
        <Box flexDirection="row" gap={1} width="100%">
          {stripPeriod.windows.map((w: any, i: number) => {
            const future = now.getTime() < w.start
            const used = future ? null : E.usageForWeek(cfg, E.prevReset(w.start, cfg))
            const cur = now.getTime() >= w.start && now.getTime() < w.end
            return (
              <Box key={`w${i}`} flexGrow={Math.max(w.hours, 12)} flexDirection="column" gap={0}>
                <Box width="100%" height={1} backgroundColor={cur ? `${ACCENT}55` : w.type === 'full' ? `${TRACK}33` : `${ACCENT}33`} overflow="hidden">
                  {used !== null && used > 0 && <Box width={`${Math.round(Math.max(0, Math.min(100, used)))}%`} height={1} backgroundColor={ACCENT} />}
                </Box>
                <Text size="caption" color={cur ? ACCENT : undefined} dimColor={!cur} wrap="truncate">{used !== null ? `${Math.round(used)}%` : `${w.hours}h`}</Text>
              </Box>
            )
          })}
        </Box>
      </Box>
    )

    const nowCard = (
      <Section title="RIGHT NOW" right={status.state === 'paid' ? <Pill text={`Window ${status.windowIndex + 1} of ${status.total}`} color={ACCENT} /> : <Pill text="Free tier" color={BLUE} />}>
        <Box flexDirection="row" gap={1} alignItems="center">
          {canSvg
            ? <T.Svg source={ringSvg(ring.total, ring.idx, ring.progress, ring.label, ring.sub)} alt={title} width={64} height={64} />
            : <Text color={ACCENT} weight="bold">{ring.label}</Text>}
          <Box flexDirection="column" flexGrow={1} gap={0}>
            <Text weight="semibold">{title}</Text>
            {big && <Text size="heading" weight="bold" color={ACCENT} tabular>{big}</Text>}
            {detail.map((l) => <Text size="caption" dimColor>{l}</Text>)}
          </Box>
        </Box>

        <Box flexDirection="column" gap={0}>
          <Box flexDirection="row" justifyContent="space-between">
            <Text size="caption" color={TRACK}>WEEKLY USAGE</Text>
            <Text size="caption" weight="bold" color={toneColor}>{pct === null ? '—' : `${Math.round(pct)}%`}</Text>
          </Box>
          <Bar value={pct} color={toneColor} />
          <Text size="caption" dimColor>{pace || (pct === null ? 'Send a message in this session to get a reading.' : week ? 'Live from Claude Code' : `From ${cfg.weeklyUsage?.source ?? 'last reading'}`)}</Text>
        </Box>
        {five && (
          <Box flexDirection="column" gap={0}>
            <Box flexDirection="row" justifyContent="space-between">
              <Text size="caption" color={TRACK}>5-HOUR SESSION</Text>
              <Text size="caption" weight="bold" color={five.percentUsed >= 80 ? ACCENT : undefined}>{Math.round(five.percentUsed)}%</Text>
            </Box>
            <Bar value={five.percentUsed} color={five.percentUsed >= 80 ? ACCENT : BLUE} />
            {five.resetsAt && <Text size="caption" dimColor>Resets {f.time(new Date(five.resetsAt))}</Text>}
          </Box>
        )}

        {status.state === 'paid' && rest && (
          <Box backgroundColor={`${BLUE}26`} {...rnd(`${BLUE}40`)} paddingX={1} paddingY={1}>
            <Text size="footnote">☾ {rest}</Text>
          </Box>
        )}
        {strip}
      </Section>
    )

    // ---------- 3. next purchases
    const planned = plan.periods.filter((p: any) => p.kind === 'planned')
    const upcoming = planned.filter((p: any) => p.end > now.getTime()).slice(0, 4)
    const nextCard = (
      <Section title="NEXT PURCHASES" right={<Text size="caption" dimColor>{s.charges} in 365 days</Text>}>
        {upcoming.map((p: any, i: number) => {
          const last = p.windows[p.windows.length - 1]
          return (
            <Box key={`p${p.index}`} flexDirection="row" gap={1} alignItems="center" paddingTop={i === 0 ? 0 : 1}>
              <Box width={3}><Text weight="bold" color={ACCENT}>{planned.indexOf(p) + 1}</Text></Box>
              <Box flexDirection="column" flexGrow={1} gap={0}>
                <Text weight="semibold">{f.shortDate(p.start)} <Text dimColor weight="regular">{f.time(p.start)}</Text></Text>
                <Text size="caption" dimColor>{p.windows.length} windows · exit {last.hours}h{p.gapBefore ? ` · ${p.gapBefore.days}d gap` : ''}</Text>
              </Box>
              <Pill text={p.sharedEntry ? 'Early' : 'Fresh'} color={p.sharedEntry ? ACCENT : GREEN} />
            </Box>
          )
        })}
      </Section>
    )

    // ---------- 4. next 365 days
    const steps = E.planSteps(cfg, now)
    const idx = steps.findIndex((st) => st.paid === s.windowsPaid && st.charges === s.charges)
    const step = (d: number) => async () => {
      const n = steps[Math.max(0, Math.min(steps.length - 1, (idx < 0 ? 0 : idx) + d))]
      if (n) await saveConfig($, (c) => ({ ...c, targetWindows: n.paid }))
    }
    const yearCard = (
      <Section title="NEXT 365 DAYS" right={<Text size="caption" dimColor>vs yearly sub</Text>}>
        <Box flexDirection="row" flexWrap="wrap" gap={1}>
          <Stat k="Cash saved" v={f.money(s.saved)} sub={`${f.money(s.cash)} vs ${f.money(s.autoCash)}`} color={ACCENT} />
          <Stat k="Purchases" v={`${s.charges} / ${s.autoCharges}`} sub="planned vs yearly" />
          <Stat k="Paid days" v={`${s.paidDays}`} sub={`${s.gapDays} on the free tier`} />
          <Stat k="Workdays lost" v={`${s.workdayGap}`} sub={`${s.weekendGap} weekend rest`} color={BLUE} />
        </Box>
        <Box flexDirection="row" alignItems="center" justifyContent="space-between" backgroundColor={`${ACCENT}1a`} {...rnd(`${ACCENT}40`)} paddingX={1} paddingY={1}>
          <Box flexDirection="column" gap={0}>
            <Text weight="semibold">Weekly windows</Text>
            <Text size="caption" dimColor>{`${s.windowsPaid} paid · ${s.windowsTouched} of ${s.weeksInHorizon} usable`}</Text>
          </Box>
          <Box flexDirection="row" alignItems="center" gap={1}>
            <Button key="minus" label="−" onPress={step(-1)} dimColor={idx <= 0} />
            <Text size="heading" weight="bold" color={ACCENT} tabular>{s.windowsPaid}</Text>
            <Button key="plus" label="+" onPress={step(1)} dimColor={idx >= steps.length - 1} />
          </Box>
        </Box>
      </Section>
    )

    // ---------- 5. setup
    const resetSrc = cfg.resetSource === 'claude-code' ? '✓ from Claude Code' : cfg.resetSource === 'manual' ? 'set by you' : 'default'
    const setupCard = (
      <Section title="SETUP" right={<Text size="caption" dimColor>{E.zoneLabel(cfg, now)}</Text>}>
        <Box flexDirection="column" gap={0}>
          <Text size="footnote">Weekly reset <Text weight="semibold">{f.resetLabel()}</Text> <Text color={cfg.resetSource === 'claude-code' ? GREEN : TRACK} size="caption">{resetSrc}</Text></Text>
          <Text size="footnote">Subscribe <Text weight="semibold">{f.buyLabel()}</Text> <Text size="caption" dimColor>(24h before reset)</Text></Text>
        </Box>
        {!cfg.currentStart && (
          <Box backgroundColor={`${ACCENT}1a`} {...rnd(`${ACCENT}40`)} paddingX={1} paddingY={1}>
            <Text size="footnote">Subscribed right now? Enter when it started below so the plan tracks your current windows.</Text>
          </Box>
        )}
        {canInput ? (
          <Box flexDirection="column" gap={1}>
            <Box flexDirection="column" gap={0}>
              <Text size="caption" color={TRACK}>CURRENT SUBSCRIPTION STARTED</Text>
              {plan.current
                ? <Text size="footnote"><Text weight="semibold">{f.dateTime(plan.current.start)}</Text> <Text dimColor>→ ends {f.dateTime(plan.current.end)}</Text></Text>
                : <Text size="footnote" dimColor>Not set: you're treated as not subscribed.</Text>}
            </Box>
            <T.Input key="start" placeholder="YYYY-MM-DD HH:MM, e.g. 2026-10-08 17:00" submitLabel="Set"
              value={cfg.currentStart ? String(cfg.currentStart).replace('T', ' ') : ''}
              onSubmit={async (v: string) => {
                if (!v.trim()) { await saveConfig($, (c) => ({ ...c, currentStart: '' })); await update($, notice, () => 'Cleared: not subscribed.'); return }
                const iso = parseStart(v)
                if (!iso) { await update($, notice, () => 'Use YYYY-MM-DD HH:MM, e.g. 2026-10-08 17:00'); return }
                await saveConfig($, (c) => ({ ...c, currentStart: iso, startSource: 'manual' }))
                await update($, notice, () => `Start set to ${iso.replace('T', ' ')}.`)
              }} />
            <Box flexDirection="row" gap={1} flexWrap="wrap">
              <T.Select key="plan" label="Plan" value={cfg.plan}
                options={E.PLANS.map((p) => ({ value: p.id, label: `Claude ${p.name}` }))}
                onSelect={(v: string) => saveConfig($, (c) => ({ ...c, plan: v, planSource: 'manual', price: E.planPrice(c.country, v), priceSource: 'plan' }))} />
              <T.Select key="country" label="Country" value={cfg.country}
                options={[...COUNTRIES].sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ value: c.code, label: c.name }))}
                onSelect={(code: string) => saveConfig($, (c) => {
                  const k = countryByCode(code)
                  const tz = k.zones.includes(c.tz) ? c.tz : k.zones[0]
                  return { ...c, country: k.code, locale: k.locale, currency: k.currency, price: E.planPrice(k.code, c.plan), ...rezone(c, tz), countrySource: 'manual' }
                })} />
            </Box>
            <Text size="caption" color={TRACK}>{`MONTHLY PRICE · ${cfg.currency} · Claude ${E.planById(cfg.plan).name}`}</Text>
            <T.Input key="price" value={String(cfg.price)} submitLabel="Set"
              onSubmit={async (v: string) => {
                const n = Number(v)
                if (!(n > 0)) { await update($, notice, () => 'Price must be a positive number.'); return }
                await saveConfig($, (c) => ({ ...c, price: n, priceSource: 'manual' }))
                await update($, notice, () => `Price set to ${f.money(n)}.`)
              }} />
          </Box>
        ) : (
          <Text size="caption" dimColor>/six-window start YYYY-MM-DD HH:MM · plan pro|max5|max20 · price N</Text>
        )}
        <Box flexDirection="row" gap={1} flexWrap="wrap">
          <Button key="refresh" label="↻ Refresh usage" onPress={async () => {
            try { await applyLimits($, (await $.session.usage()).rateLimits as LimitReading[]); await update($, notice, () => 'Usage refreshed from Claude Code.') }
            catch { await update($, notice, () => 'No usage reading yet: send a message first.') }
          }} />
          {status.state !== 'paid' && status.nextBuy && status.nextBuy.start - now.getTime() < E.DAY && <Button key="sub" label="I've subscribed" onPress={set((c) => ({ ...c, currentStart: E.toWallInput(new Date(), c.tz), startSource: 'confirmed' }), 'Tracking the new period. Switch auto-renew off.')} />}
        </Box>
        {msg && <Text size="caption" color={GREEN}>{msg}</Text>}
        {cfg.startSource === 'confirmed' && plan.current && now.getTime() - plan.current.start < E.DAY && (
          <Button key="undo-start" label="Undo: I didn't subscribe just now" plain dimColor
            onPress={set((c) => ({ ...c, currentStart: '', startSource: 'manual' }), 'Start cleared. Enter when your subscription really started.')} />
        )}
      </Section>
    )

    return (
      <Box flexDirection="column" gap={1} paddingX={1} paddingY={1}>
        {buyCard}
        {nowCard}
        {nextCard}
        {yearCard}
        {setupCard}
        <Text size="caption" dimColor>Unofficial tool · not affiliated with Anthropic</Text>
      </Box>
    )
  })
}
