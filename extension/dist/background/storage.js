import { isSameOrAfterLocalDayStart } from "../utils/time.js";
const ACTIVITY_KEY = "activityRecords";
const SNAPSHOT_KEY = "dashboardSnapshot";
const TRACKING_STARTED_AT_KEY = "trackingStartedAt";
async function getLocal(key, fallback) {
    const result = await chrome.storage.local.get(key);
    return result[key] ?? fallback;
}
async function setLocal(key, value) {
    await chrome.storage.local.set({ [key]: value });
}
export async function getTrackingStartedAt() {
    const existing = await getLocal(TRACKING_STARTED_AT_KEY, null);
    if (existing) {
        return existing;
    }
    const createdAt = new Date().toISOString();
    await setLocal(TRACKING_STARTED_AT_KEY, createdAt);
    return createdAt;
}
export async function getActivities() {
    return getLocal(ACTIVITY_KEY, []);
}
export async function updateSnapshot(currentDomain, currentTabStartedAt, liveActivity) {
    const activities = await getActivities();
    return buildSnapshot(currentDomain, currentTabStartedAt, activities, liveActivity);
}
export async function saveActivity(activity) {
    const existing = await getActivities();
    const todayRecords = existing.filter((entry) => isSameOrAfterLocalDayStart(entry.startedAt));
    const next = [...todayRecords, activity];
    await setLocal(ACTIVITY_KEY, next);
    return next;
}
export async function buildSnapshot(currentDomain, currentTabStartedAt, activities, liveActivity) {
    const trackingStartedAt = await getTrackingStartedAt();
    const records = liveActivity ? [...activities, liveActivity] : activities;
    const totalsMap = new Map();
    for (const entry of records) {
        const current = totalsMap.get(entry.domain) ?? { domain: entry.domain, totalMs: 0, visits: 0 };
        current.totalMs += entry.durationMs;
        current.visits += 1;
        totalsMap.set(entry.domain, current);
    }
    const topSites = [...totalsMap.values()].sort((a, b) => b.totalMs - a.totalMs).slice(0, 5);
    const totalMs = records.reduce((sum, entry) => sum + entry.durationMs, 0);
    const snapshot = {
        totalMs,
        currentDomain,
        currentTabStartedAt,
        trackingStartedAt,
        topSites,
        activities: records.slice().reverse()
    };
    await setLocal(SNAPSHOT_KEY, snapshot);
    return snapshot;
}
export async function getSnapshot() {
    return getLocal(SNAPSHOT_KEY, {
        totalMs: 0,
        currentDomain: null,
        currentTabStartedAt: null,
        trackingStartedAt: null,
        topSites: [],
        activities: []
    });
}
