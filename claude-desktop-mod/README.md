# 6-Window Planner (Claude Code Desktop mod)

A pane beside the chat that plans when to buy Claude Pro or Max, so that each monthly period touches **6 weekly quota windows**: a 24h entry sprint, 4 full weeks, and a 24h exit sprint. It uses the same planning engine as the Chrome and VS Code extensions.

## What the pane shows
- **Optimal subscribe date** with a live countdown, or **Buy window is open** with an *I've subscribed* button.
- **Current window**: a ring for window k of 6, the time until the weekly reset or until the plan ends, and when the plan ends.
- **This week's usage, live**: the `seven_day` percentage and reset time come straight from Claude Code's own rate-limit readings, so there are no logins or tokens to set up. It also shows a pace check (ahead, on pace, or behind) and the 5-hour session usage.
- **A complete-rest alert**: when the cap is used up, or when the plan ends, and until when.
- **A window strip** with each week filled by the share of the cap you used.
- **Your next 4 purchases**, tagged *Fresh week* or *Early re-buy*.
- **The next 365 days**, compared with a yearly subscription (cash, purchases, paid days, workdays lost), and a **− / + counter** for planned windows (default 60).
- **Setup**: plan (Pro / Max 5x / Max 20x), the start of your current subscription, monthly price and country.

## Command
- `/six-window` opens the pane.
- `/six-window start 2026-10-08 17:00` sets when your current subscription started.
- `/six-window subscribed` records a purchase you just made, as of now.
- `/six-window clear` means you're not subscribed.
- `/six-window plan pro|max5|max20`
- `/six-window windows 60`
- `/six-window price 1999`

Settings are kept across sessions. Unofficial tool, not affiliated with Anthropic.
