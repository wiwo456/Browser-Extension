import type { ActivityRecord, ActivityState, DashboardSnapshot } from "../types/activity.js";
import { extractDomain } from "../utils/domain.js";
import { buildSnapshot, saveActivity, updateSnapshot } from "./storage.js";
import { classifyDomain, getFocusRules, sendActivity } from "./api.js";

interface ActiveTabSession {
  url: string;
  domain: string;
  title?: string;
  startedAt: number;
  rawCategory?: string | null;
  normalizedCategory?: ActivityRecord["normalizedCategory"];
}

interface BrowserTabLike {
  id?: number;
  url?: string;
  pendingUrl?: string;
  title?: string;
}

export class ActivityTracker {
  private currentSession: ActiveTabSession | null = null;
  private currentState: ActivityState = "hidden";

  async startForTab(tab?: BrowserTabLike | null): Promise<DashboardSnapshot> {
    const nextUrl = this.getTabUrl(tab);
    if (!nextUrl || !this.shouldTrackUrl(nextUrl)) {
      await this.pauseCurrent("hidden");
      return this.refreshSnapshot();
    }

    const nextDomain = extractDomain(nextUrl);
    const categoryMatch = await classifyDomain(nextDomain);
    const focusRules = await getFocusRules(true);

    if (this.isBlocked(nextDomain, categoryMatch.normalizedCategory, focusRules)) {
      await this.pauseCurrent("hidden");
      await this.redirectToBlockPage(tab?.id, nextDomain, categoryMatch.normalizedCategory);
      return this.refreshSnapshot();
    }

    const shouldRotate =
      !this.currentSession || this.currentSession.url !== nextUrl || this.currentState !== "active";

    if (shouldRotate) {
      await this.finishCurrentSession(this.currentState);
      this.currentSession = {
        url: nextUrl,
        domain: nextDomain,
        title: tab?.title,
        startedAt: Date.now(),
        rawCategory: categoryMatch.rawCategory,
        normalizedCategory: categoryMatch.normalizedCategory
      };
    }

    this.currentState = "active";
    return this.refreshSnapshot();
  }

  async pauseCurrent(reason: ActivityState): Promise<DashboardSnapshot> {
    this.currentState = reason;
    await this.finishCurrentSession(reason);
    return this.refreshSnapshot();
  }

  async refreshSnapshot(): Promise<DashboardSnapshot> {
    return updateSnapshot(
      this.currentSession?.domain ?? null,
      this.currentSession ? new Date(this.currentSession.startedAt).toISOString() : null,
      this.buildLiveActivityRecord()
    );
  }

  private async finishCurrentSession(state: ActivityState): Promise<void> {
    if (!this.currentSession) {
      return;
    }

    const endedAt = Date.now();
    const durationMs = endedAt - this.currentSession.startedAt;
    if (durationMs < 1000) {
      this.currentSession = null;
      return;
    }

    const record: ActivityRecord = {
      url: this.currentSession.url,
      domain: this.currentSession.domain,
      title: this.currentSession.title,
      startedAt: new Date(this.currentSession.startedAt).toISOString(),
      endedAt: new Date(endedAt).toISOString(),
      durationMs,
      state,
      source: "extension",
      rawCategory: this.currentSession.rawCategory,
      normalizedCategory: this.currentSession.normalizedCategory
    };

    const activities = await saveActivity(record);
    await buildSnapshot(null, null, activities);
    await sendActivity(record);
    this.currentSession = null;
  }

  private buildLiveActivityRecord(): ActivityRecord | null {
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
      source: "extension",
      rawCategory: this.currentSession.rawCategory,
      normalizedCategory: this.currentSession.normalizedCategory
    };
  }

  private getTabUrl(tab?: BrowserTabLike | null): string | null {
    return tab?.url ?? tab?.pendingUrl ?? null;
  }

  private shouldTrackUrl(rawUrl: string): boolean {
    try {
      const url = new URL(rawUrl);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  }

  private isBlocked(
    domain: string,
    normalizedCategory: ActivityRecord["normalizedCategory"],
    focusRules: { blockedDomains: string[]; blockedCategories: string[] }
  ): boolean {
    if (focusRules.blockedDomains.some((blockedDomain) => this.matchesBlockedDomain(domain, blockedDomain))) {
      return true;
    }

    return Boolean(normalizedCategory && focusRules.blockedCategories.includes(normalizedCategory));
  }

  private matchesBlockedDomain(domain: string, blockedDomain: string): boolean {
    return domain === blockedDomain || domain.endsWith(`.${blockedDomain}`);
  }

  private async redirectToBlockPage(tabId?: number, domain?: string, category?: ActivityRecord["normalizedCategory"]): Promise<void> {
    if (!tabId) {
      return;
    }

    const blockedUrl = new URL(chrome.runtime.getURL("public/stay-focused.html"));
    if (domain) {
      blockedUrl.searchParams.set("domain", domain);
    }
    if (category) {
      blockedUrl.searchParams.set("category", category);
    }

    await chrome.tabs.update(tabId, { url: blockedUrl.toString() });
  }
}
