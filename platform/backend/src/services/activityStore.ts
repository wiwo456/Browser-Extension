import type {
  ActivityRecord,
  BrowserSessionRecord,
  CategoryTotal,
  DailySummary,
  DailySiteTotal,
  NormalizedCategory
} from "../types/activity";
import type { TimerRuleWindow } from "../types/focusRules.js";
import { RuntimeJsonStore } from "./runtimeJsonStore.js";

function startOfTodayTimestamp(now = new Date()): number {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function isSameOrAfterLocalDayStart(isoString: string, now = new Date()): boolean {
  const timestamp = new Date(isoString).getTime();
  return Number.isFinite(timestamp) && timestamp >= startOfTodayTimestamp(now);
}

function startOfWeekTimestamp(now = new Date()): number {
  const date = new Date(now);
  const day = date.getDay();
  const diff = (day + 6) % 7;
  date.setDate(date.getDate() - diff);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function normalizeCreatedAtTimestamp(createdAt?: string): number {
  const timestamp = createdAt ? new Date(createdAt).getTime() : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export class ActivityStore {
  private activities: ActivityRecord[] = [];
  private browserSessions: BrowserSessionRecord[] = [];
  private readonly store: RuntimeJsonStore<ActivityRecord[]>;
  private readonly browserSessionStore: RuntimeJsonStore<BrowserSessionRecord[]>;

  constructor(storagePath: string) {
    this.store = new RuntimeJsonStore<ActivityRecord[]>("activities", storagePath, []);
    this.browserSessionStore = new RuntimeJsonStore<BrowserSessionRecord[]>(
      "browser-sessions",
      storagePath.replace(/activities\.json$/, "browser-sessions.json"),
      []
    );
  }

  async init(): Promise<void> {
    this.activities = await this.store.read();
    this.browserSessions = await this.browserSessionStore.read();
  }

  async add(record: ActivityRecord): Promise<void> {
    this.activities.push(record);
    await this.store.write(this.activities);
  }

  async addBrowserSession(session: BrowserSessionRecord): Promise<void> {
    this.browserSessions.push(session);
    this.browserSessions.sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
    await this.browserSessionStore.write(this.browserSessions);
  }

  getToday(category?: NormalizedCategory): DailySummary {
    const activities = this.activities.filter((entry) => {
      if (!isSameOrAfterLocalDayStart(entry.startedAt)) {
        return false;
      }

      if (category && entry.normalizedCategory !== category) {
        return false;
      }

      return true;
    });

    const totals = new Map<string, DailySiteTotal>();
    const categoryTotals = new Map<NormalizedCategory, CategoryTotal>();

    for (const entry of activities) {
      const current = totals.get(entry.domain) ?? { domain: entry.domain, totalMs: 0, visits: 0 };
      current.totalMs += entry.durationMs;
      current.visits += 1;
      totals.set(entry.domain, current);

      if (entry.normalizedCategory) {
        const categoryCurrent = categoryTotals.get(entry.normalizedCategory) ?? {
          normalizedCategory: entry.normalizedCategory,
          totalMs: 0,
          visits: 0
        };
        categoryCurrent.totalMs += entry.durationMs;
        categoryCurrent.visits += 1;
        categoryTotals.set(entry.normalizedCategory, categoryCurrent);
      }
    }

    return {
      totalMs: activities.reduce((sum, entry) => sum + entry.durationMs, 0),
      lastBrowserSession: this.getLastBrowserSession(),
      recentBrowserSessions: this.getRecentBrowserSessions(4),
      topSites: [...totals.values()].sort((a, b) => b.totalMs - a.totalMs).slice(0, 5),
      topCategories: [...categoryTotals.values()].sort((a, b) => b.totalMs - a.totalMs),
      activities: activities.slice().reverse()
    };
  }

  getLastBrowserSession(): BrowserSessionRecord | null {
    return this.browserSessions.length > 0 ? this.browserSessions[this.browserSessions.length - 1] : null;
  }

  getRecentBrowserSessions(limit: number): BrowserSessionRecord[] {
    if (limit <= 0) {
      return [];
    }

    return this.browserSessions.slice(-limit).reverse();
  }

  getDomainUsage(window: TimerRuleWindow, blockedDomain: string, createdAt?: string): number {
    return this.activities
      .filter(
        (entry) => this.isInWindow(entry.startedAt, window, createdAt) && this.matchesBlockedDomain(entry.domain, blockedDomain)
      )
      .reduce((sum, entry) => sum + entry.durationMs, 0);
  }

  getCategoryUsage(window: TimerRuleWindow, category: NormalizedCategory, createdAt?: string): number {
    return this.activities
      .filter((entry) => this.isInWindow(entry.startedAt, window, createdAt) && entry.normalizedCategory === category)
      .reduce((sum, entry) => sum + entry.durationMs, 0);
  }

  private isInWindow(isoString: string, window: TimerRuleWindow, createdAt?: string): boolean {
    const timestamp = new Date(isoString).getTime();
    if (!Number.isFinite(timestamp)) {
      return false;
    }

    const windowStart =
      window === "forever"
        ? 0
        : window === "day"
          ? startOfTodayTimestamp()
          : startOfWeekTimestamp();
    const effectiveStart = Math.max(windowStart, normalizeCreatedAtTimestamp(createdAt));

    if (window === "day") {
      return timestamp >= effectiveStart;
    }

    if (window === "week") {
      return timestamp >= effectiveStart;
    }

    return timestamp >= effectiveStart;
  }

  private matchesBlockedDomain(domain: string, blockedDomain: string): boolean {
    return domain === blockedDomain || domain.endsWith(`.${blockedDomain}`);
  }
}
