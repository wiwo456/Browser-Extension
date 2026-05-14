import type {
  ActivityRecord,
  BrowserSessionRecord,
  CategoryTotal,
  DashboardSnapshot,
  DailySiteTotal,
  NormalizedCategory
} from "../types/activity.js";
import { isSameOrAfterLocalDayStart } from "../utils/time.js";

const ACTIVITY_KEY = "activityRecords";
const SNAPSHOT_KEY = "dashboardSnapshot";
const TIMER_WARNING_STATE_KEY = "timerWarningState";
const TEMPORARY_BYPASS_KEY = "temporaryBypassState";
const ACTIVE_BROWSER_SESSION_KEY = "activeBrowserSession";
const LAST_BROWSER_SESSION_KEY = "lastBrowserSession";
const BROWSER_SESSION_STALE_MS = 2 * 60_000;

interface ActiveBrowserSessionState {
  startedAt: string;
  lastSeenAt: string;
}

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

function buildBrowserSessionRecord(
  activeSession: ActiveBrowserSessionState,
  endedAt: string,
  endReason: BrowserSessionRecord["endReason"]
): BrowserSessionRecord {
  const startedAtMs = new Date(activeSession.startedAt).getTime();
  const endedAtMs = new Date(endedAt).getTime();

  return {
    startedAt: activeSession.startedAt,
    endedAt,
    durationMs: Math.max(0, endedAtMs - startedAtMs),
    source: "extension",
    endReason
  };
}

export async function beginBrowserSession(): Promise<BrowserSessionRecord | null> {
  const now = new Date();
  const nowIso = now.toISOString();
  const activeSession = await getLocal<ActiveBrowserSessionState | null>(ACTIVE_BROWSER_SESSION_KEY, null);

  if (activeSession) {
    const lastSeenAtMs = new Date(activeSession.lastSeenAt).getTime();
    if (Number.isFinite(lastSeenAtMs) && now.getTime() - lastSeenAtMs > BROWSER_SESSION_STALE_MS) {
      const recoveredSession = buildBrowserSessionRecord(activeSession, activeSession.lastSeenAt, "startup-recovery");
      await setLocal(LAST_BROWSER_SESSION_KEY, recoveredSession);
      await setLocal(ACTIVE_BROWSER_SESSION_KEY, {
        startedAt: nowIso,
        lastSeenAt: nowIso
      });
      return recoveredSession;
    }

    await setLocal(ACTIVE_BROWSER_SESSION_KEY, {
      ...activeSession,
      lastSeenAt: nowIso
    });
    return null;
  }

  await setLocal(ACTIVE_BROWSER_SESSION_KEY, {
    startedAt: nowIso,
    lastSeenAt: nowIso
  });
  return null;
}

export async function touchBrowserSession(): Promise<void> {
  const activeSession = await getLocal<ActiveBrowserSessionState | null>(ACTIVE_BROWSER_SESSION_KEY, null);
  if (!activeSession) {
    await beginBrowserSession();
    return;
  }

  await setLocal(ACTIVE_BROWSER_SESSION_KEY, {
    ...activeSession,
    lastSeenAt: new Date().toISOString()
  });
}

export async function finalizeBrowserSession(
  endReason: BrowserSessionRecord["endReason"] = "browser-closed"
): Promise<BrowserSessionRecord | null> {
  const activeSession = await getLocal<ActiveBrowserSessionState | null>(ACTIVE_BROWSER_SESSION_KEY, null);
  if (!activeSession) {
    return null;
  }

  const endedAtCandidate = activeSession.lastSeenAt || new Date().toISOString();
  const completedSession = buildBrowserSessionRecord(activeSession, endedAtCandidate, endReason);
  await setLocal(LAST_BROWSER_SESSION_KEY, completedSession);
  await setLocal(ACTIVE_BROWSER_SESSION_KEY, null);
  return completedSession;
}

export async function getTrackingStartedAt(): Promise<string | null> {
  const activeSession = await getLocal<ActiveBrowserSessionState | null>(ACTIVE_BROWSER_SESSION_KEY, null);
  return activeSession?.startedAt ?? null;
}

export async function getLastBrowserSession(): Promise<BrowserSessionRecord | null> {
  return getLocal<BrowserSessionRecord | null>(LAST_BROWSER_SESSION_KEY, null);
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
  const lastBrowserSession = await getLastBrowserSession();
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
    lastBrowserSession,
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
    lastBrowserSession: null,
    topSites: [],
    topCategories: [],
    activities: []
  });
}
