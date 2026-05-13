import type { ActivityRecord, CategoryTotal, DashboardSnapshot, DailySiteTotal, NormalizedCategory } from "../types/activity.js";
import { isSameOrAfterLocalDayStart } from "../utils/time.js";

const ACTIVITY_KEY = "activityRecords";
const SNAPSHOT_KEY = "dashboardSnapshot";
const TRACKING_STARTED_AT_KEY = "trackingStartedAt";
const TIMER_WARNING_STATE_KEY = "timerWarningState";
const TEMPORARY_BYPASS_KEY = "temporaryBypassState";

type ChromeStorageResult = Record<string, unknown>;

async function getLocal<T>(key: string, fallback: T): Promise<T> {
  const result: ChromeStorageResult = await chrome.storage.local.get(key);
  return (result[key] as T | undefined) ?? fallback;
}

async function setLocal(key: string, value: unknown): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

export async function hasShownTimerWarning(warningKey: string): Promise<boolean> {
  const state = await getLocal<Record<string, true>>(TIMER_WARNING_STATE_KEY, {});
  return Boolean(state[warningKey]);
}

export async function markTimerWarningShown(warningKey: string): Promise<void> {
  const state = await getLocal<Record<string, true>>(TIMER_WARNING_STATE_KEY, {});
  state[warningKey] = true;
  await setLocal(TIMER_WARNING_STATE_KEY, state);
}

export async function setTemporaryBypass(domain: string, durationMs = 10 * 60_000): Promise<void> {
  const state = await getLocal<Record<string, number>>(TEMPORARY_BYPASS_KEY, {});
  state[domain] = Date.now() + durationMs;
  await setLocal(TEMPORARY_BYPASS_KEY, state);
}

export async function hasTemporaryBypass(domain: string): Promise<boolean> {
  const state = await getLocal<Record<string, number>>(TEMPORARY_BYPASS_KEY, {});
  const expiresAt = state[domain];
  if (!expiresAt) {
    return false;
  }

  if (expiresAt <= Date.now()) {
    delete state[domain];
    await setLocal(TEMPORARY_BYPASS_KEY, state);
    return false;
  }

  return true;
}

export async function restartTrackingSession(): Promise<string> {
  const restartedAt = new Date().toISOString();
  await setLocal(TRACKING_STARTED_AT_KEY, restartedAt);
  return restartedAt;
}

export async function getTrackingStartedAt(): Promise<string> {
  const existing = await getLocal<string | null>(TRACKING_STARTED_AT_KEY, null);
  if (existing) {
    return existing;
  }

  const createdAt = new Date().toISOString();
  await setLocal(TRACKING_STARTED_AT_KEY, createdAt);
  return createdAt;
}

export async function getActivities(): Promise<ActivityRecord[]> {
  return getLocal<ActivityRecord[]>(ACTIVITY_KEY, []);
}

export async function updateSnapshot(
  currentDomain: string | null,
  currentTabStartedAt: string | null,
  liveActivity?: ActivityRecord | null
): Promise<DashboardSnapshot> {
  const activities = await getActivities();
  return buildSnapshot(currentDomain, currentTabStartedAt, activities, liveActivity);
}

export async function saveActivity(activity: ActivityRecord): Promise<ActivityRecord[]> {
  const existing = await getActivities();
  const next = [...existing, activity];
  await setLocal(ACTIVITY_KEY, next);
  return next;
}

export async function buildSnapshot(
  currentDomain: string | null,
  currentTabStartedAt: string | null,
  activities: ActivityRecord[],
  liveActivity?: ActivityRecord | null
): Promise<DashboardSnapshot> {
  const trackingStartedAt = await getTrackingStartedAt();
  const todayActivities = activities.filter((entry) => isSameOrAfterLocalDayStart(entry.startedAt));
  const liveRecords = liveActivity && isSameOrAfterLocalDayStart(liveActivity.startedAt) ? [liveActivity] : [];
  const records = [...todayActivities, ...liveRecords];
  const totalsMap = new Map<string, DailySiteTotal>();
  const categoryTotalsMap = new Map<NormalizedCategory, CategoryTotal>();

  for (const entry of records) {
    const current = totalsMap.get(entry.domain) ?? { domain: entry.domain, totalMs: 0, visits: 0 };
    current.totalMs += entry.durationMs;
    current.visits += 1;
    totalsMap.set(entry.domain, current);

    if (entry.normalizedCategory) {
      const categoryCurrent = categoryTotalsMap.get(entry.normalizedCategory) ?? {
        normalizedCategory: entry.normalizedCategory,
        totalMs: 0,
        visits: 0
      };
      categoryCurrent.totalMs += entry.durationMs;
      categoryCurrent.visits += 1;
      categoryTotalsMap.set(entry.normalizedCategory, categoryCurrent);
    }
  }

  const topSites = [...totalsMap.values()].sort((a, b) => b.totalMs - a.totalMs).slice(0, 5);
  const topCategories = [...categoryTotalsMap.values()].sort((a, b) => b.totalMs - a.totalMs);
  const totalMs = records.reduce((sum, entry) => sum + entry.durationMs, 0);

  const snapshot: DashboardSnapshot = {
    totalMs,
    currentDomain,
    currentTabStartedAt,
    trackingStartedAt,
    topSites,
    topCategories,
    activities: records.slice().reverse()
  };

  await setLocal(SNAPSHOT_KEY, snapshot);
  return snapshot;
}

export async function getSnapshot(): Promise<DashboardSnapshot> {
  return getLocal<DashboardSnapshot>(SNAPSHOT_KEY, {
    totalMs: 0,
    currentDomain: null,
    currentTabStartedAt: null,
    trackingStartedAt: null,
    topSites: [],
    topCategories: [],
    activities: []
  });
}
