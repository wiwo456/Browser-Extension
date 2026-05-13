import { RuntimeJsonStore } from "./runtimeJsonStore.js";
function startOfTodayTimestamp(now = new Date()) {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
}
function isSameOrAfterLocalDayStart(isoString, now = new Date()) {
    const timestamp = new Date(isoString).getTime();
    return Number.isFinite(timestamp) && timestamp >= startOfTodayTimestamp(now);
}
function startOfWeekTimestamp(now = new Date()) {
    const date = new Date(now);
    const day = date.getDay();
    const diff = (day + 6) % 7;
    date.setDate(date.getDate() - diff);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
}
function normalizeCreatedAtTimestamp(createdAt) {
    const timestamp = createdAt ? new Date(createdAt).getTime() : Number.NaN;
    return Number.isFinite(timestamp) ? timestamp : 0;
}
export class ActivityStore {
    constructor(storagePath) {
        this.activities = [];
        this.store = new RuntimeJsonStore("activities", storagePath, []);
    }
    async init() {
        this.activities = await this.store.read();
    }
    async add(record) {
        this.activities.push(record);
        await this.store.write(this.activities);
    }
    getToday(category) {
        const activities = this.activities.filter((entry) => {
            if (!isSameOrAfterLocalDayStart(entry.startedAt)) {
                return false;
            }
            if (category && entry.normalizedCategory !== category) {
                return false;
            }
            return true;
        });
        const totals = new Map();
        const categoryTotals = new Map();
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
            topSites: [...totals.values()].sort((a, b) => b.totalMs - a.totalMs).slice(0, 5),
            topCategories: [...categoryTotals.values()].sort((a, b) => b.totalMs - a.totalMs),
            activities: activities.slice().reverse()
        };
    }
    getDomainUsage(window, blockedDomain, createdAt) {
        return this.activities
            .filter((entry) => this.isInWindow(entry.startedAt, window, createdAt) && this.matchesBlockedDomain(entry.domain, blockedDomain))
            .reduce((sum, entry) => sum + entry.durationMs, 0);
    }
    getCategoryUsage(window, category, createdAt) {
        return this.activities
            .filter((entry) => this.isInWindow(entry.startedAt, window, createdAt) && entry.normalizedCategory === category)
            .reduce((sum, entry) => sum + entry.durationMs, 0);
    }
    isInWindow(isoString, window, createdAt) {
        const timestamp = new Date(isoString).getTime();
        if (!Number.isFinite(timestamp)) {
            return false;
        }
        const windowStart = window === "forever"
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
    matchesBlockedDomain(domain, blockedDomain) {
        return domain === blockedDomain || domain.endsWith(`.${blockedDomain}`);
    }
}
