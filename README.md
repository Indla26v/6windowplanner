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

## Auto-renew for a year vs the 6-window plan

A worked example over the next 365 days, using the planner's own numbers: Claude Pro in India at ₹1,999 a month, weekly reset Friday 6:30 AM IST, current subscription started 8 Oct. Your numbers change with your dates, but the pattern holds.

| Next 365 days | Auto-renew (12 months) | Plan · 55 windows | **Plan · 60 windows (default)** | Plan · 64 windows |
|---|---|---|---|---|
| Purchases | 12 | 9 | **10** | 11 |
| Cash spent | ₹23,988 | ₹17,991 | **₹19,990** | ₹21,989 |
| **Saved vs auto-renew** | — | **₹5,997 (25%)** | **₹3,998 (17%)** | ₹1,999 (8%) |
| Weekly windows paid for | 53 | 55 | **60** | 64 |
| **Weekly limits: 53 + a** | 53 + 0 | 53 + 2 | **53 + 7** | 53 + 11 |
| Usable weekly caps (distinct weeks) | 53 | 53 | **53** | 53 |
| Cost per usable window | ₹452.60 | ₹345.98 | **₹384.42** | ₹407.20 |
| Days on Pro | 365 | 278 | **306** | 322 |
| Days on the free tier | 0 | 87 | **59** | 43 |
| · of which weekends | 0 | 25 | **17** | 13 |
| · of which workdays | 0 | 62 | **42** | 30 |

**Reading "53 + a".** A year has 53 weekly resets, so **53** is the number of full weekly caps you can ever get, on any plan. **a** is the number of *extra* windows the plan pays for: early re-buys whose entry sprint starts within 7 days of the previous expiry, in a week that already had an exit sprint.
- An extra window doesn't bring a new cap. It reopens the same week's cap for another 24h.
- It's worth something only if your exit sprint left part of that week's cap unused: the extra window lets you finish it.
- If your exit sprint used the whole cap, the extra window adds Pro days (features, models, Claude Code access), not more usage.

So 60 windows = 53 full weekly caps + 7 chances to use up whatever an exit sprint left over.

The same ratios hold for Max: 60 windows saves ₹19,998 a year on Max 5x (₹99,990 vs ₹1,19,988) and ₹39,998 on Max 20x (₹1,99,990 vs ₹2,39,988).

### What you gain with the plan
- **Less money for the same weekly capacity.** Every plan above still touches all 53 weekly caps of the year. You stop paying for the days in between.
- **No unused capacity.** A paid month where you barely code still costs the full price on auto-renew. The plan puts your paid time where you'll use it.
- **A clear rhythm.** Each period is an entry sprint, four full weeks and an exit sprint, so you know when to push hard and when to stop.

### What it costs you
- **Days without Pro.** Between 43 and 87 free-tier days a year, depending on the counter. Of those, 30 to 62 fall on workdays. On those days you have only free-tier limits and no Claude Code on your subscription.
- **Sprints you have to use up.** The 24h entry and exit windows are worth having only if you can use up most of a week's cap in a day. If you can't, part of each entry and exit sprint goes unused.
- **Early re-buys share a week.** To reach 60 windows, about 7 purchases come back within 7 days of expiry. Their entry sprint lands in a week whose cap your last exit sprint already used. You pay for more Pro days, not more capacity, which is why 60 costs more per usable window than 55.
- **Admin.** You buy about 10 times a year at a set hour (e.g. Thursday 6:30 AM), and you must turn off auto-renew each time. The reminders and `365.ics` help, but a missed buy shortens window 1.
- **Short months.** A purchase whose billing period covers February is only 28 days and fits 5 windows, not 6.
- **Prices and terms can change.** The plan assumes calendar-month billing and a fixed weekly reset. If Anthropic changes either, re-detect, and the plan recalculates.

### Which to choose
- **Auto-renew:** you code with Claude every day, you can't plan around gaps, or the savings aren't worth the effort.
- **55 windows:** you want the biggest savings and you're happy to have about 12 days off between periods.
- **60 windows, the default:** a balance. It saves 17%, keeps you on Pro about 84% of the year, and has short 4–5 day gaps.
- **64 windows:** you want almost-continuous Pro, saving one month's price a year.

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
