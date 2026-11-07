# 6-Window Planner for Claude

Plans when to buy Claude Pro or Max so that each monthly period touches **6 weekly quota windows**: a 24h entry sprint, 4 full weeks, and a 24h exit sprint. Unofficial tool, not affiliated with Anthropic.

## In VS Code
- **Sidebar (6-Window icon in the Activity Bar)** with the same content as the Chrome toolbar popup:
  - the optimal subscribe date and a live countdown
  - the current window and this week's usage
  - the complete-rest alert
  - **Open full planner**, **Detect reset** and **I've subscribed** buttons
  - collapsible sections that use the rest of the sidebar: the window strip filled by usage, your next 4 purchases (plus Download 365.ics), a 365-day summary with the − / + windows counter, and a calendar for this month and next
- **Status bar countdown** to the optimal subscribe time, e.g. `Subscribe in 4d 9h`, or `W3/6 · subscribe in 25d` while you're subscribed. It switches to `Subscribe now` when the buy window is open.
- **Planner panel** (`6-Window: Open Planner`) with:
  - live window status and this week's usage
  - complete-rest alerts
  - yearly vs planned comparison with − / + counters
  - a calendar
  - the purchase plan, which you can download as `365.ics`
- **Reminders** for subscribing, turning auto-renew off, the exit sprint and expiry.
- **Auto-detect** of your weekly reset, your plan and this week's usage %, read from your local Claude Code login.

## Commands
- `6-Window: Open Planner`
- `6-Window: Detect Weekly Reset from Claude Code Login`
- `6-Window: I Just Subscribed (Track This Period)`

## Settings
- `sixWindow.autoDetectFromClaudeCode` (default on): reads `~/.claude/.credentials.json`, or the "Claude Code-credentials" Keychain item on macOS, and asks `api.anthropic.com` for your usage. The token isn't stored or sent anywhere else. Detection uses endpoints Anthropic doesn't document, so it may stop working; you can always set the reset by hand.
- `sixWindow.statusBar` (default on): shows or hides the countdown.

If your login token has expired, run `claude` once to refresh it.
