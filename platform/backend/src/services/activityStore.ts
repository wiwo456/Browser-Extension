import type {
  ActivityRecord,
  BrowserSessionRecord,
  CategoryTotal,
  DailySummary,
  DailySiteTotal,
  NormalizedCategory,
  TimelinePeriod,
  TimelineDomainImpact,
  TimelinePoint,
  TimelineSummary
} from "../types/activity";
import type { TimerRuleWindow } from "../types/focusRules.js";
import { RuntimeJsonStore } from "./runtimeJsonStore.js";

function startOfTodayTimestamp(now = new Date()): number {
  return startOfLocalDayTimestamp(now);
}

function startOfLocalDayTimestamp(now = new Date()): number {
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

const CATEGORY_POINTS: Record<NormalizedCategory, number> = {
  adult: -1.5,
  entertainment: -0.8,
  gaming: -1.2,
  health: 0.7,
  learning: 1,
  news: 0.3,
  other: 0,
  shopping: 0,
  social: -0.8,
  work: 1
};

const DOMAIN_CATEGORY_FALLBACKS: Array<{
  match: (domain: string) => boolean;
  category: NormalizedCategory;
}> = [
  {
    match: (domain) => domain === "instagram.com" || domain.endsWith(".instagram.com"),
    category: "social"
  },
  {
    match: (domain) => domain === "facebook.com" || domain.endsWith(".facebook.com"),
    category: "social"
  },
  {
    match: (domain) => domain === "twitter.com" || domain.endsWith(".twitter.com") || domain === "x.com" || domain.endsWith(".x.com"),
    category: "social"
  },
  {
    match: (domain) => domain === "reddit.com" || domain.endsWith(".reddit.com"),
    category: "social"
  },
  {
    match: (domain) => domain === "tiktok.com" || domain.endsWith(".tiktok.com"),
    category: "social"
  },
  {
    match: (domain) => domain === "netflix.com" || domain.endsWith(".netflix.com"),
    category: "entertainment"
  },
  {
    match: (domain) => domain === "twitch.tv" || domain.endsWith(".twitch.tv"),
    category: "entertainment"
  }
];

function getEffectiveCategory(entry: ActivityRecord): NormalizedCategory | null {
  if (entry.normalizedCategory) {
    return entry.normalizedCategory;
  }

  const normalizedDomain = entry.domain.trim().toLowerCase().replace(/^www\./, "");
  for (const fallback of DOMAIN_CATEGORY_FALLBACKS) {
    if (fallback.match(normalizedDomain)) {
      return fallback.category;
    }
  }

  return null;
}

function getActivityMinutes(entry: ActivityRecord): number {
  return Math.max(1, Math.round(entry.durationMs / 60000));
}

function getActivityDelta(entry: ActivityRecord): number {
  const category = getEffectiveCategory(entry);
  if (entry.state !== "active" || !category) {
    return 0;
  }

  return Number((getActivityMinutes(entry) * CATEGORY_POINTS[category]).toFixed(2));
}

function formatDayLabel(date: Date): string {
  return date.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric"
  });
}

function formatTimeLabel(date: Date): string {
  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  });
}

function startOfMinuteTimestamp(date: Date): number {
  const value = new Date(date);
  value.setSeconds(0, 0);
  return value.getTime();
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

      const effectiveCategory = getEffectiveCategory(entry);
      if (category && effectiveCategory !== category) {
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

      const effectiveCategory = getEffectiveCategory(entry);
      if (effectiveCategory) {
        const categoryCurrent = categoryTotals.get(effectiveCategory) ?? {
          normalizedCategory: effectiveCategory,
          totalMs: 0,
          visits: 0
        };
        categoryCurrent.totalMs += entry.durationMs;
        categoryCurrent.visits += 1;
        categoryTotals.set(effectiveCategory, categoryCurrent);
      }
    }

    return {
      totalMs: activities.reduce((sum, entry) => sum + entry.durationMs, 0),
      lifetimeTotalMs: this.activities.reduce((sum, entry) => sum + entry.durationMs, 0),
      lastBrowserSession: this.getLastBrowserSession(),
      recentBrowserSessions: this.getRecentBrowserSessions(4),
      topSites: [...totals.values()].sort((a, b) => b.totalMs - a.totalMs).slice(0, 5),
      topCategories: [...categoryTotals.values()].sort((a, b) => b.totalMs - a.totalMs),
      activities: activities.slice().reverse()
    };
  }

  getTimeline(period: TimelinePeriod, category?: NormalizedCategory): TimelineSummary {
    return period === "week" ? this.getWeekTimeline(category) : this.getDayTimeline(category);
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
      .filter((entry) => this.isInWindow(entry.startedAt, window, createdAt) && getEffectiveCategory(entry) === category)
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

  private getDayTimeline(category?: NormalizedCategory): TimelineSummary {
    const activities = this.activities
      .filter((entry) => {
        if (!isSameOrAfterLocalDayStart(entry.startedAt)) {
          return false;
        }

        const effectiveCategory = getEffectiveCategory(entry);
        if (category && effectiveCategory !== category) {
          return false;
        }

        return true;
      })
      .sort((left, right) => new Date(left.startedAt).getTime() - new Date(right.startedAt).getTime());

    const points = this.buildActivityPoints(activities);
    return this.buildTimelineSummary("day", points);
  }

  private getWeekTimeline(category?: NormalizedCategory): TimelineSummary {
    const todayStart = startOfLocalDayTimestamp();
    const start = new Date(todayStart);
    start.setDate(start.getDate() - 6);
    const weekStart = start.getTime();

    const buckets = new Map<number, Omit<TimelinePoint, "score">>();
    const bloomImpactByBucket = new Map<number, Map<string, TimelineDomainImpact>>();
    const doomImpactByBucket = new Map<number, Map<string, TimelineDomainImpact>>();

    for (let offset = 0; offset < 7; offset += 1) {
      const bucketDate = new Date(weekStart);
      bucketDate.setDate(bucketDate.getDate() + offset);
      const bucketStart = startOfLocalDayTimestamp(bucketDate);

      buckets.set(bucketStart, {
        bucketStart: new Date(bucketStart).toISOString(),
        label: formatDayLabel(bucketDate),
        delta: 0,
        bloomMinutes: 0,
        doomMinutes: 0,
        neutralMinutes: 0,
        bloomDomains: [],
        doomDomains: []
      });
      bloomImpactByBucket.set(bucketStart, new Map<string, TimelineDomainImpact>());
      doomImpactByBucket.set(bucketStart, new Map<string, TimelineDomainImpact>());
    }

    for (const entry of this.activities) {
      const timestamp = new Date(entry.startedAt).getTime();
      if (!Number.isFinite(timestamp) || timestamp < weekStart) {
        continue;
      }

      const effectiveCategory = getEffectiveCategory(entry);
      if (category && effectiveCategory !== category) {
        continue;
      }

      const bucketStart = startOfLocalDayTimestamp(new Date(timestamp));
      const bucket = buckets.get(bucketStart);
      if (!bucket) {
        continue;
      }

      const minutes = getActivityMinutes(entry);
      const delta = getActivityDelta(entry);

      bucket.delta = Number((bucket.delta + delta).toFixed(2));
      if (delta > 0) {
        bucket.bloomMinutes += minutes;
        this.accumulateDomainImpact(bloomImpactByBucket.get(bucketStart), entry, delta, minutes);
      } else if (delta < 0) {
        bucket.doomMinutes += minutes;
        this.accumulateDomainImpact(doomImpactByBucket.get(bucketStart), entry, delta, minutes);
      } else {
        bucket.neutralMinutes += minutes;
      }
    }

    const orderedBuckets = [...buckets.entries()]
      .sort((left, right) => left[0] - right[0])
      .map(([bucketStart, bucket]) => ({
        ...bucket,
        bloomDomains: this.getTopDomainImpacts(bloomImpactByBucket.get(bucketStart)),
        doomDomains: this.getTopDomainImpacts(doomImpactByBucket.get(bucketStart))
      }));

    let cumulativeScore = 0;
    const points: TimelinePoint[] = orderedBuckets.map((bucket) => {
      cumulativeScore = Number((cumulativeScore + bucket.delta).toFixed(2));
      return {
        ...bucket,
        score: cumulativeScore
      };
    });

    return this.buildTimelineSummary("week", points);
  }

  private buildActivityPoints(activities: ActivityRecord[]): TimelinePoint[] {
    const buckets = new Map<number, Omit<TimelinePoint, "score">>();
    const bloomImpactByBucket = new Map<number, Map<string, TimelineDomainImpact>>();
    const doomImpactByBucket = new Map<number, Map<string, TimelineDomainImpact>>();

    for (const entry of activities) {
      const startedAt = new Date(entry.startedAt);
      const startedAtTimestamp = startedAt.getTime();
      if (!Number.isFinite(startedAtTimestamp)) {
        continue;
      }

      const bucketStart = startOfMinuteTimestamp(startedAt);
      const existingBucket = buckets.get(bucketStart) ?? {
        bucketStart: new Date(bucketStart).toISOString(),
        label: formatTimeLabel(new Date(bucketStart)),
        delta: 0,
        bloomMinutes: 0,
        doomMinutes: 0,
        neutralMinutes: 0,
        bloomDomains: [],
        doomDomains: []
      };

      const minutes = getActivityMinutes(entry);
      const delta = getActivityDelta(entry);
      existingBucket.delta = Number((existingBucket.delta + delta).toFixed(2));

      if (delta > 0) {
        existingBucket.bloomMinutes += minutes;
        if (!bloomImpactByBucket.has(bucketStart)) {
          bloomImpactByBucket.set(bucketStart, new Map<string, TimelineDomainImpact>());
        }
        this.accumulateDomainImpact(bloomImpactByBucket.get(bucketStart), entry, delta, minutes);
      } else if (delta < 0) {
        existingBucket.doomMinutes += minutes;
        if (!doomImpactByBucket.has(bucketStart)) {
          doomImpactByBucket.set(bucketStart, new Map<string, TimelineDomainImpact>());
        }
        this.accumulateDomainImpact(doomImpactByBucket.get(bucketStart), entry, delta, minutes);
      } else {
        existingBucket.neutralMinutes += minutes;
      }

      buckets.set(bucketStart, existingBucket);
    }

    const orderedBuckets = [...buckets.entries()]
      .sort((left, right) => left[0] - right[0])
      .map(([bucketStart, bucket]) => ({
        ...bucket,
        bloomDomains: this.getTopDomainImpacts(bloomImpactByBucket.get(bucketStart)),
        doomDomains: this.getTopDomainImpacts(doomImpactByBucket.get(bucketStart))
      }));

    let cumulativeScore = 0;
    return orderedBuckets.map((bucket) => {
      cumulativeScore = Number((cumulativeScore + bucket.delta).toFixed(2));
      return {
        ...bucket,
        score: cumulativeScore
      };
    });
  }

  private buildTimelineSummary(period: TimelinePeriod, points: TimelinePoint[]): TimelineSummary {
    return {
      period,
      points,
      netScore: points.length > 0 ? points[points.length - 1].score : 0,
      bloomMinutes: points.reduce((total, point) => total + point.bloomMinutes, 0),
      doomMinutes: points.reduce((total, point) => total + point.doomMinutes, 0),
      neutralMinutes: points.reduce((total, point) => total + point.neutralMinutes, 0)
    };
  }

  private buildDomainImpact(entry: ActivityRecord, delta: number, minutes: number): TimelineDomainImpact {
    return {
      domain: entry.domain,
      title: entry.title || entry.domain,
      delta: Number(delta.toFixed(2)),
      minutes
    };
  }

  private accumulateDomainImpact(
    impactMap: Map<string, TimelineDomainImpact> | undefined,
    entry: ActivityRecord,
    delta: number,
    minutes: number
  ): void {
    if (!impactMap) {
      return;
    }

    const key = entry.domain;
    const current = impactMap.get(key) ?? {
      domain: entry.domain,
      title: entry.title || entry.domain,
      delta: 0,
      minutes: 0
    };

    current.delta = Number((current.delta + delta).toFixed(2));
    current.minutes += minutes;
    current.title = entry.title || current.title;
    impactMap.set(key, current);
  }

  private getTopDomainImpacts(impactMap: Map<string, TimelineDomainImpact> | undefined): TimelineDomainImpact[] {
    if (!impactMap) {
      return [];
    }

    return [...impactMap.values()]
      .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta))
      .slice(0, 3);
  }
}
