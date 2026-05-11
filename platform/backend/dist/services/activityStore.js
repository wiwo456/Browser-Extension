import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
function startOfTodayTimestamp(now = new Date()) {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
}
function isSameOrAfterLocalDayStart(isoString, now = new Date()) {
    const timestamp = new Date(isoString).getTime();
    return Number.isFinite(timestamp) && timestamp >= startOfTodayTimestamp(now);
}
export class ActivityStore {
    constructor(storagePath) {
        this.storagePath = storagePath;
        this.activities = [];
    }
    async init() {
        try {
            const file = await readFile(this.storagePath, "utf8");
            this.activities = JSON.parse(file);
        }
        catch {
            this.activities = [];
        }
    }
    async add(record) {
        this.activities.push(record);
        await mkdir(dirname(this.storagePath), { recursive: true });
        await writeFile(this.storagePath, JSON.stringify(this.activities, null, 2), "utf8");
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
}
