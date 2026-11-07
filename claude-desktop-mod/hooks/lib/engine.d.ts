// Types for the shared planning engine (engine.js is plain JavaScript, shared with the
// Chrome and VS Code extensions). Kept loose on purpose: the engine is tested on its own.
export declare const MINUTE: number;
export declare const HOUR: number;
export declare const DAY: number;
export declare const ENTRY_HOURS: number;
export declare const TARGET_WINDOWS: number;
export declare const PLANS: ReadonlyArray<{ id: string; name: string; mult: number; usage: string }>;
export declare function normalizeConfig(c: unknown): any;
export declare function buildPlan(cfg: unknown, now?: Date): any;
export declare function liveStatus(plan: any, now?: Date): any;
export declare function makeFormatters(cfg: any): any;
export declare function planSteps(cfg: any, now?: Date): Array<{ budget: number; charges: number; paid: number; usable: number }>;
export declare function planPrice(country: string, plan: string): number;
export declare function planById(id: string): { id: string; name: string; mult: number; usage: string };
export declare function resetFromInstant(instant: string | Date, tz: string): { resetDay: number; resetTime: string } | null;
export declare function convertReset(r: { resetDay: number; resetTime: string }, fromTz: string, toTz: string): { resetDay: number; resetTime: string };
export declare function parseWall(s: string, tz: string): Date | null;
export declare function toWallInput(d: Date, tz: string): string;
export declare function prevReset(t: Date, cfg: any): Date;
export declare function nextReset(t: Date, cfg: any, inclusive?: boolean): Date;
export declare function usageForWeek(cfg: any, weekStart: Date): number | null;
export declare function zoneLabel(cfg: any, at?: Date): string;
