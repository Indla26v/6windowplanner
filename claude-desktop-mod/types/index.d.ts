/** Plain JSON, as the planner's settings are stored. */
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** The planner's settings (the shared engine's config object). */
export type PlannerConfig = { [key: string]: Json };

/** One rate-limit window as Claude Code reported it. */
export type LimitReading = { kind: string; percentUsed: number; resetsAt?: string };

declare module 'claude-code' {
  interface PluginState {
    'six-window-planner': {
      /** Settings; also kept in $.store so they survive sessions. */
      config: Shaped<PlannerConfig | null>;
      /** Latest rate-limit windows (five_hour, seven_day) from session.measure. */
      limits: LimitReading[];
      /** Bumped every 30 s so countdowns redraw. */
      tick: number;
      /** Last message from a setup action (errors, confirmations). */
      notice: string;
    };
  }
}
