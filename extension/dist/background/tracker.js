import { extractDomain } from "../utils/domain.js";
import { buildSnapshot, saveActivity, updateSnapshot } from "./storage.js";
import { sendActivity } from "./api.js";
export class ActivityTracker {
    constructor() {
        this.currentSession = null;
        this.currentState = "hidden";
    }
    async startForTab(tab) {
        const nextUrl = this.getTabUrl(tab);
        if (!nextUrl) {
            await this.pauseCurrent("hidden");
            return this.refreshSnapshot();
        }
        const nextDomain = extractDomain(nextUrl);
        const shouldRotate = !this.currentSession || this.currentSession.url !== nextUrl || this.currentState !== "active";
        if (shouldRotate) {
            await this.finishCurrentSession(this.currentState);
            this.currentSession = {
                url: nextUrl,
                domain: nextDomain,
                title: tab?.title,
                startedAt: Date.now()
            };
        }
        this.currentState = "active";
        return this.refreshSnapshot();
    }
    async pauseCurrent(reason) {
        this.currentState = reason;
        await this.finishCurrentSession(reason);
        return this.refreshSnapshot();
    }
    async refreshSnapshot() {
        return updateSnapshot(this.currentSession?.domain ?? null, this.currentSession ? new Date(this.currentSession.startedAt).toISOString() : null, this.buildLiveActivityRecord());
    }
    async finishCurrentSession(state) {
        if (!this.currentSession) {
            return;
        }
        const endedAt = Date.now();
        const durationMs = endedAt - this.currentSession.startedAt;
        if (durationMs < 1000) {
            this.currentSession = null;
            return;
        }
        const record = {
            url: this.currentSession.url,
            domain: this.currentSession.domain,
            title: this.currentSession.title,
            startedAt: new Date(this.currentSession.startedAt).toISOString(),
            endedAt: new Date(endedAt).toISOString(),
            durationMs,
            state,
            source: "extension"
        };
        const activities = await saveActivity(record);
        await buildSnapshot(null, null, activities);
        await sendActivity(record);
        this.currentSession = null;
    }
    buildLiveActivityRecord() {
        if (!this.currentSession || this.currentState !== "active") {
            return null;
        }
        const durationMs = Math.max(0, Date.now() - this.currentSession.startedAt);
        return {
            url: this.currentSession.url,
            domain: this.currentSession.domain,
            title: this.currentSession.title,
            startedAt: new Date(this.currentSession.startedAt).toISOString(),
            endedAt: new Date().toISOString(),
            durationMs,
            state: "active",
            source: "extension"
        };
    }
    getTabUrl(tab) {
        return tab?.url ?? tab?.pendingUrl ?? null;
    }
}
