# 6-Window Planner for Claude Pro & Max

Plans when to buy Claude Pro so that each monthly period touches **6 weekly quota windows**: a 24h entry sprint, 4 full weeks, and a 24h exit sprint. It comes as a **Chrome/Edge extension** and a **VS Code extension**, and both share one planning engine and UI.

Unofficial tool — not affiliated with Anthropic.

## Features
- **Any individual plan.** Pick Claude Pro, Max 5x or Max 20x in the header. The price follows the plan and your country, and auto-detect switches it to the plan on your account when it can tell.
- **Auto-detects your weekly reset.** Chrome reads it from your signed-in claude.ai account. VS Code reads it through your local Claude Code login. You can also set it by hand.
- **Optimal subscribe date with a live countdown.** It shows in the planner's top card, on the Chrome toolbar badge (`5d`, `13h`, `BUY`) and in the VS Code status bar.
- **Country-aware.** The currency, date/time format and time zone follow your country, including daylight-saving time. Changing the country or zone keeps your reset and subscription at the same real-world moment.
- **Yearly vs planned tiles with counters.** Purchases, weekly windows and compromised workdays are adjustable; cash, cost per window, Pro days and weekend rest days follow.
- **365-day plan.** One `365.ics` download puts every purchase, exit sprint and expiry for the next 365 days (with reminders) into any calendar.
- **Calendar view.** Paid days, entry/exit sprints and free-tier gap days, colored **green for weekend rest** and **blue for compromised workdays**.
- **Info (ⓘ) dialog.** Compares a normal recurring (auto-renew) subscription with your 6-window plan, side by side with live numbers.
- **Reminders.** Subscribe soon, subscribe now, turn off auto-renew, exit sprint started, Pro ends in 2h.

## How the plan is built
| Rule | Value |
|---|---|
| Buy moment | your weekly reset **minus 24h** (e.g. Thu 06:30 for a Fri 06:30 reset) |
| Billing period | calendar month: same date and time next month (28–31 days) |
| Windows | 24h entry · 4 × 168h · exit = 24h (30-day month) or 48h (31-day month) |
| Short months | 28/29-day February periods are kept, with 5 windows |
| Planned windows | a counter, **default 60**. Each step is the plan with the most paid windows for its number of purchases (e.g. 55 → 60 → 64 for 9 → 10 → 11 buys) |
| Early re-buys | to reach 60, most re-buys come back 4–5 days after expiry, so their entry sprint shares the week the last exit sprint used |

**Paid windows vs usable caps:** buying doesn't reset the weekly meter, so an early re-buy's entry sprint uses the same weekly cap as the previous exit sprint. A year has only 52–53 weekly caps, so the 60-window plan pays for about 7 windows twice in exchange for more Pro days. Every stat tile shows a yearly subscription (auto-renew) next to the planned value. The − / + counters on Purchases, Weekly windows and Compromised workdays all move the same plan.

## Project layout
```
shared/            engine.js (pure planning logic), countries.js, ui/ (planner UI + styles)
chrome/            MV3 extension: popup, planner page, background worker, claude.ai detector
vscode/            VS Code extension: status bar, webview planner, Claude Code detector
scripts/           sync-shared.mjs, make-icons.mjs, test-engine.mjs, serve.mjs
```
`shared/` is the source of truth. Run `npm run sync` after editing it: browsers and VS Code can only load files inside their own extension folder, so the script copies `shared/` into `chrome/shared` and `vscode/media/shared`.

## Build and test
```bash
npm run build
```
```bash
npm test
```
To preview the planner page in a normal browser tab (it stores settings in localStorage there), run:
```bash
node scripts/serve.mjs 5179
```
Then open http://localhost:5179/planner.html.

## Install — Chrome / Edge / Brave
1. Run `npm run build`.
2. Open `chrome://extensions` (or `edge://extensions`) and turn on **Developer mode**.
3. Click **Load unpacked** and pick the `chrome/` folder.
4. Pin the extension. The badge shows the countdown to your next optimal subscribe time.
5. In the popup, click **Detect reset**. This uses your existing claude.ai session in that browser. If no claude.ai tab is open, it briefly opens `claude.ai/settings/usage` in the background. While you browse claude.ai, the reset is also refreshed every 30 minutes.

Permissions: `storage`, `alarms` and `notifications`, plus access to `https://claude.ai/*` for reset detection only. Data never leaves the extension.

## Install — VS Code
Run it from source:
```bash
code --extensionDevelopmentPath="C:\Projects\6windowClaude\vscode"
```
Or package it as a `.vsix` (needs network access for `vsce`):
```bash
cd vscode && npm run package
```
Then use **Extensions → … → Install from VSIX**.

- Status bar: `W4/6 · subscribe in 25d 10h`, `Subscribe in 4d 3h` during a gap, or `Subscribe now` when the buy window is open.
- Commands: **6-Window: Open Planner**, **6-Window: Detect Weekly Reset from Claude Code Login**, **6-Window: I Just Subscribed**.
- Settings: `sixWindow.autoDetectFromClaudeCode` (default on) and `sixWindow.statusBar`.
- Detection reads `~/.claude/.credentials.json` (macOS: the "Claude Code-credentials" Keychain item) and calls `https://api.anthropic.com/api/oauth/usage`. The token is not stored or sent anywhere else. If the token has expired, run `claude` once to refresh it.

## Notes
- Reset detection uses the same unofficial endpoints the claude.ai usage page and Claude Code use (`seven_day.resets_at`). If Anthropic changes them, detection fails gracefully and you can still set the reset by hand.
- Default prices per country are approximate. Set the price from your receipt.
