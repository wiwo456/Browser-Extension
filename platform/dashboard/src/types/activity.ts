export type ActivityState = "active" | "idle" | "hidden";
export type NormalizedCategory =
  | "adult"
  | "entertainment"
  | "gaming"
  | "health"
  | "learning"
  | "news"
  | "other"
  | "shopping"
  | "social"
  | "work";

export interface ActivityRecord {
  url: string;
  domain: string;
  title?: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  state: ActivityState;
  source: "extension";
  rawCategory?: string | null;
  normalizedCategory?: NormalizedCategory | null;
}

export interface BrowserSessionRecord {
  startedAt: string;
  endedAt: string;
  durationMs: number;
  source: "extension";
  endReason: "browser-closed" | "startup-recovery" | "manual-reset" | "system-inactive";
}

export interface DailySiteTotal {
  domain: string;
  totalMs: number;
  visits: number;
}

export interface CategoryTotal {
  normalizedCategory: NormalizedCategory;
  totalMs: number;
  visits: number;
}

export interface DailySummary {
  totalMs: number;
  lifetimeTotalMs: number;
  lastBrowserSession: BrowserSessionRecord | null;
  recentBrowserSessions: BrowserSessionRecord[];
  topSites: DailySiteTotal[];
  topCategories: CategoryTotal[];
  activities: ActivityRecord[];
}

export type TimelinePeriod = "day" | "week";

export interface TimelinePoint {
  bucketStart: string;
  label: string;
  score: number;
  delta: number;
  bloomMinutes: number;
  doomMinutes: number;
  neutralMinutes: number;
  bloomDomains: TimelineDomainImpact[];
  doomDomains: TimelineDomainImpact[];
}

export interface TimelineSummary {
  period: TimelinePeriod;
  points: TimelinePoint[];
  netScore: number;
  bloomMinutes: number;
  doomMinutes: number;
  neutralMinutes: number;
}

export interface TimelineDomainImpact {
  domain: string;
  title: string;
  delta: number;
  minutes: number;
}
