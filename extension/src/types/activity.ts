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

export interface DashboardSnapshot {
  totalMs: number;
  currentDomain: string | null;
  currentTabStartedAt: string | null;
  trackingStartedAt: string | null;
  lastBrowserSession: BrowserSessionRecord | null;
  topSites: DailySiteTotal[];
  topCategories: CategoryTotal[];
  activities: ActivityRecord[];
}

export interface PopupState {
  snapshot: DashboardSnapshot;
  currentUrl: string | null;
  currentSiteLabel: string | null;
}
