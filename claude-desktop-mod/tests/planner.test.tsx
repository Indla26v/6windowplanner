import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const PANE = {
  plugin: 'six-window-planner',
  component: 'Pane',
  requestId: 'six-window',
  props: {
    title: '6-Window Planner',
    isFocused: false,
    bodyColumns: 44,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 60 },
    view: {},
  },
} as const

const CFG = {
  country: 'IN', tz: 'Asia/Kolkata', locale: 'en-IN', currency: 'INR', price: 1999,
  resetDay: 5, resetTime: '06:30', currentStart: '2026-10-08T17:00', targetWindows: 60,
}

/** The engine beneath the mod: store, clock, and the calls it makes at start. */
function world(on: On, store: Record<string, unknown> = { config: CFG }) {
  mock.store(on, store)
  mock.clock(on, { now: Date.now() })
  on('command.register', () => ({ value: { command: 'six-window' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }) as any)
  on('session.measure', (_, e) => ({ changed: e.changed }))
}

test('the pane draws every section on every surface', async ($, on) => {
  world(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  for (const surface of ['desktop', 'terminal', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    for (const heading of [/^(OPTIMAL SUBSCRIBE DATE|BUY WINDOW IS OPEN)$/, /^RIGHT NOW$/, /^WEEKLY USAGE$/, /^NEXT PURCHASES$/, /^NEXT 365 DAYS$/, /^SETUP$/]) {
      expect(await ui.find({ type: 'Text', text: heading })).toBeTruthy()
    }
    await ui.unmount()
  }
})

test('live usage from Claude Code fills both bars and sets the reset', async ($, on) => {
  world(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const resetsAt = new Date(Date.now() + 3 * 86400000).toISOString()
  await $.session.measure({
    context: { window: 200000 } as any,
    rateLimits: [
      { kind: 'seven_day', percentUsed: 42, resetsAt },
      { kind: 'five_hour', percentUsed: 18, resetsAt },
    ],
    changed: ['rateLimits'],
  })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /^42%$/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /^5-HOUR SESSION$/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /^18%$/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /from Claude Code/ })).toBeTruthy()
  await ui.unmount()
})

test('/six-window start sets the current subscription', async ($, on) => {
  world(on, {})
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const r = await $.command.run({ command: 'six-window', args: 'start 2026-10-08 17:00' })
  expect(String((r as any).text)).toContain('2026-10-08 17:00')
})

test('the windows counter steps the plan', async ($, on) => {
  world(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const read = async () => (await ui.find({ type: 'Text', text: /^\d+ paid · / }))?.text
  const before = await read()
  await ui.press({ key: 'plus' })
  const after = await read()
  expect(before).toBeTruthy()
  expect(after).not.toBe(before)
  await ui.unmount()
})
