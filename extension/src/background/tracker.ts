import type { ActivityRecord, ActivityState, DashboardSnapshot } from "../types/activity.js";
import type { FocusRules, TimerRuleWindow } from "../types/focus-rules.js";
import { extractDomain } from "../utils/domain.js";
import { isAlwaysAllowedStudyDomain } from "../utils/study-mode.js";
import { startOfTodayTimestamp, startOfWeekTimestamp } from "../utils/time.js";
import {
  buildSnapshot,
  getActivities,
  hasShownTimerWarning,
  hasTemporaryBypass,
  markTimerWarningShown,
  saveActivity,
  updateSnapshot
} from "./storage.js";
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

interface TimerWarningCandidate {
  warningKey: string;
  title: string;
  message: string;
}

interface BlockDecision {
  reasonCode: "domain" | "category" | "domain-timer" | "category-timer" | "study-mode";
  reasonLabel: string;
  reasonDescription: string;
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
    const activityRecords = await getActivities();
    const liveActivity = this.buildLiveActivityRecord();

    if (!(await hasTemporaryBypass(nextDomain))) {
      const blockDecision = this.getBlockDecision(nextUrl, nextDomain, categoryMatch.normalizedCategory, focusRules, activityRecords, liveActivity);
      if (blockDecision) {
        await this.pauseCurrent("hidden");
        await this.redirectToBlockPage(tab?.id, nextUrl, nextDomain, blockDecision);
        return this.refreshSnapshot();
      }
    }

    await this.maybeNotifyTimerWarning(nextDomain, categoryMatch.normalizedCategory, focusRules, activityRecords, liveActivity);

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

  private getBlockDecision(
    rawUrl: string,
    domain: string,
    normalizedCategory: ActivityRecord["normalizedCategory"],
    focusRules: FocusRules,
    activityRecords: ActivityRecord[],
    liveActivity: ActivityRecord | null
  ): BlockDecision | null {
    const studyModeDecision = this.getStudyModeBlockDecision(rawUrl, domain, normalizedCategory, focusRules);
    if (studyModeDecision) {
      return studyModeDecision;
    }

    if (focusRules.blockedDomains.some((blockedDomain) => this.matchesBlockedDomain(domain, blockedDomain))) {
      return {
        reasonCode: "domain",
        reasonLabel: "Blocked website",
        reasonDescription: `${domain} is on your blocked websites list.`
      };
    }

    if (normalizedCategory && focusRules.blockedCategories.includes(normalizedCategory)) {
      return {
        reasonCode: "category",
        reasonLabel: "Blocked category",
        reasonDescription: `${normalizedCategory} is on your blocked categories list.`
      };
    }

    const records = liveActivity ? [...activityRecords, liveActivity] : activityRecords;
    const matchedDomainTimerRule = focusRules.domainTimerRules.find((rule) => {
      if (!this.matchesBlockedDomain(domain, rule.domain)) {
        return false;
      }

      return this.getDomainUsageMs(records, rule.window, rule.domain, rule.createdAt) >= rule.limitMinutes * 60_000;
    });

    if (matchedDomainTimerRule) {
      return {
        reasonCode: "domain-timer",
        reasonLabel: "Website timer reached",
        reasonDescription: `${matchedDomainTimerRule.domain} used up its ${matchedDomainTimerRule.limitMinutes}-minute ${matchedDomainTimerRule.window} limit.`
      };
    }

    if (!normalizedCategory) {
      return null;
    }

    const matchedCategoryTimerRule = focusRules.categoryTimerRules.find((rule) => {
      if (rule.category !== normalizedCategory) {
        return false;
      }

      return this.getCategoryUsageMs(records, rule.window, normalizedCategory, rule.createdAt) >= rule.limitMinutes * 60_000;
    });

    if (matchedCategoryTimerRule) {
      return {
        reasonCode: "category-timer",
        reasonLabel: "Category timer reached",
        reasonDescription: `${matchedCategoryTimerRule.category} used up its ${matchedCategoryTimerRule.limitMinutes}-minute ${matchedCategoryTimerRule.window} limit.`
      };
    }

    return null;
  }

  private matchesBlockedDomain(domain: string, blockedDomain: string): boolean {
    return domain === blockedDomain || domain.endsWith(`.${blockedDomain}`);
  }

  private getStudyModeBlockDecision(
    rawUrl: string,
    domain: string,
    normalizedCategory: ActivityRecord["normalizedCategory"],
    focusRules: FocusRules
  ): BlockDecision | null {
    if (!focusRules.studyMode.enabled) {
      return null;
    }

    if (this.isAlwaysAllowedStudyDomain(domain) || this.isAlwaysAllowedStudySearchPage(rawUrl)) {
      return null;
    }

    const allowedDomain = focusRules.studyMode.allowedDomains.some((allowedDomain) => this.matchesBlockedDomain(domain, allowedDomain));
    const allowedCategory = Boolean(
      normalizedCategory && focusRules.studyMode.allowedCategories.includes(normalizedCategory)
    );

    if (allowedDomain || allowedCategory) {
      return null;
    }

    return {
      reasonCode: "study-mode",
      reasonLabel: "Study mode block",
      reasonDescription: `${domain} is not part of your current study-mode allowlist, so Doom2Bloom blocked it immediately.`
    };
  }

  private isAlwaysAllowedStudySearchPage(rawUrl: string): boolean {
    try {
      const url = new URL(rawUrl);
      const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
      const path = url.pathname;

      if (hostname === "duckduckgo.com") {
        return path === "/";
      }

      if (hostname === "search.brave.com") {
        return path === "/" || path === "/search";
      }

      if (hostname === "bing.com" || hostname === "search.yahoo.com" || hostname === "yahoo.com") {
        return path === "/" || path === "/search";
      }

      if (hostname === "google.com" || /^google\.[a-z.]+$/.test(hostname)) {
        return path === "/" || path === "/search";
      }

      return false;
    } catch {
      return false;
    }
  }

  private async maybeNotifyTimerWarning(
    domain: string,
    normalizedCategory: ActivityRecord["normalizedCategory"],
    focusRules: FocusRules,
    activityRecords: ActivityRecord[],
    liveActivity: ActivityRecord | null
  ): Promise<void> {
    const records = liveActivity ? [...activityRecords, liveActivity] : activityRecords;
    const candidate = this.getTimerWarningCandidate(domain, normalizedCategory, focusRules, records);
    if (!candidate) {
      return;
    }

    if (await hasShownTimerWarning(candidate.warningKey)) {
      return;
    }

    await chrome.notifications.create(`timer-warning:${candidate.warningKey}`, {
      type: "basic",
      iconUrl: chrome.runtime.getURL("public/icons/icon128.png"),
      title: candidate.title,
      message: candidate.message
    });
    await markTimerWarningShown(candidate.warningKey);
  }

  private getTimerWarningCandidate(
    domain: string,
    normalizedCategory: ActivityRecord["normalizedCategory"],
    focusRules: FocusRules,
    records: ActivityRecord[]
  ): TimerWarningCandidate | null {
    const warningThresholdMs = 5 * 60_000;

    for (const rule of focusRules.domainTimerRules) {
      if (!this.matchesBlockedDomain(domain, rule.domain)) {
        continue;
      }

      const usageMs = this.getDomainUsageMs(records, rule.window, rule.domain, rule.createdAt);
      const remainingMs = rule.limitMinutes * 60_000 - usageMs;
      if (remainingMs <= 0 || remainingMs > warningThresholdMs) {
        continue;
      }

      return {
        warningKey: `domain:${rule.domain}:${rule.window}:${rule.createdAt}`,
        title: "5 minutes left",
        message: `You have about 5 minutes left on ${rule.domain} before Doom2Bloom blocks it.`
      };
    }

    if (!normalizedCategory) {
      return null;
    }

    for (const rule of focusRules.categoryTimerRules) {
      if (rule.category !== normalizedCategory) {
        continue;
      }

      const usageMs = this.getCategoryUsageMs(records, rule.window, normalizedCategory, rule.createdAt);
      const remainingMs = rule.limitMinutes * 60_000 - usageMs;
      if (remainingMs <= 0 || remainingMs > warningThresholdMs) {
        continue;
      }

      return {
        warningKey: `category:${rule.category}:${rule.window}:${rule.createdAt}`,
        title: "5 minutes left",
        message: `You have about 5 minutes left in ${rule.category} before Doom2Bloom blocks it.`
      };
    }

    return null;
  }

  private getDomainUsageMs(records: ActivityRecord[], window: TimerRuleWindow, blockedDomain: string, createdAt: string): number {
    return records
      .filter(
        (record) => this.isRecordInWindow(record, window, createdAt) && this.matchesBlockedDomain(record.domain, blockedDomain)
      )
      .reduce((total, record) => total + record.durationMs, 0);
  }

  private getCategoryUsageMs(
    records: ActivityRecord[],
    window: TimerRuleWindow,
    normalizedCategory: NonNullable<ActivityRecord["normalizedCategory"]>,
    createdAt: string
  ): number {
    return records
      .filter((record) => this.isRecordInWindow(record, window, createdAt) && record.normalizedCategory === normalizedCategory)
      .reduce((total, record) => total + record.durationMs, 0);
  }

  private isRecordInWindow(record: ActivityRecord, window: TimerRuleWindow, createdAt: string): boolean {
    const startedAt = new Date(record.startedAt).getTime();
    const createdAtTimestamp = new Date(createdAt).getTime();
    if (!Number.isFinite(startedAt)) {
      return false;
    }

    const windowStart =
      window === "forever"
        ? 0
        : window === "day"
          ? startOfTodayTimestamp()
          : startOfWeekTimestamp();

    const effectiveStart = Number.isFinite(createdAtTimestamp) ? Math.max(windowStart, createdAtTimestamp) : windowStart;

    if (window === "forever") {
      return startedAt >= effectiveStart;
    }

    if (window === "day") {
      return startedAt >= effectiveStart;
    }

    return startedAt >= effectiveStart;
  }

  private async redirectToBlockPage(
    tabId?: number,
    originalUrl?: string,
    domain?: string,
    blockDecision?: BlockDecision
  ): Promise<void> {
    if (!tabId) {
      return;
    }

    const blockedUrl = new URL(chrome.runtime.getURL("public/stay-focused.html"));
    if (originalUrl) {
      blockedUrl.searchParams.set("url", originalUrl);
    }
    if (domain) {
      blockedUrl.searchParams.set("domain", domain);
    }
    if (blockDecision) {
      blockedUrl.searchParams.set("reason", blockDecision.reasonCode);
      blockedUrl.searchParams.set("reasonLabel", blockDecision.reasonLabel);
      blockedUrl.searchParams.set("reasonDescription", blockDecision.reasonDescription);
    }

    await chrome.tabs.update(tabId, { url: blockedUrl.toString() });
  }
}
