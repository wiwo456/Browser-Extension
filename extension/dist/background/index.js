// src/utils/domain.ts
function extractDomain(rawUrl) {
  if (!rawUrl) {
    return "No active site";
  }
  try {
    const url = new URL(rawUrl);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.hostname.replace(/^www\./, "") || "No active site";
    }
    if (url.protocol === "file:") {
      return "Local file";
    }
    if (url.protocol === "chrome:" || url.protocol === "edge:" || url.protocol === "about:") {
      return "Browser page";
    }
    if (url.protocol === "chrome-extension:") {
      return "Extension page";
    }
    return url.hostname || url.protocol.replace(":", "") || "No active site";
  } catch {
    return "No active site";
  }
}

// src/utils/time.ts
function startOfTodayTimestamp(now = /* @__PURE__ */ new Date()) {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}
function startOfWeekTimestamp(now = /* @__PURE__ */ new Date()) {
  const date = new Date(now);
  const day = date.getDay();
  const diff = (day + 6) % 7;
  date.setDate(date.getDate() - diff);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}
function isSameOrAfterLocalDayStart(isoString, now = /* @__PURE__ */ new Date()) {
  const timestamp = new Date(isoString).getTime();
  return Number.isFinite(timestamp) && timestamp >= startOfTodayTimestamp(now);
}

// src/background/storage.ts
var ACTIVITY_KEY = "activityRecords";
var SNAPSHOT_KEY = "dashboardSnapshot";
var TRACKING_STARTED_AT_KEY = "trackingStartedAt";
var TIMER_WARNING_STATE_KEY = "timerWarningState";
var TEMPORARY_BYPASS_KEY = "temporaryBypassState";
async function getLocal(key, fallback) {
  const result = await chrome.storage.local.get(key);
  return result[key] ?? fallback;
}
async function setLocal(key, value) {
  await chrome.storage.local.set({ [key]: value });
}
async function hasShownTimerWarning(warningKey) {
  const state = await getLocal(TIMER_WARNING_STATE_KEY, {});
  return Boolean(state[warningKey]);
}
async function markTimerWarningShown(warningKey) {
  const state = await getLocal(TIMER_WARNING_STATE_KEY, {});
  state[warningKey] = true;
  await setLocal(TIMER_WARNING_STATE_KEY, state);
}
async function hasTemporaryBypass(domain) {
  const state = await getLocal(TEMPORARY_BYPASS_KEY, {});
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
async function restartTrackingSession() {
  const restartedAt = (/* @__PURE__ */ new Date()).toISOString();
  await setLocal(TRACKING_STARTED_AT_KEY, restartedAt);
  return restartedAt;
}
async function getTrackingStartedAt() {
  const existing = await getLocal(TRACKING_STARTED_AT_KEY, null);
  if (existing) {
    return existing;
  }
  const createdAt = (/* @__PURE__ */ new Date()).toISOString();
  await setLocal(TRACKING_STARTED_AT_KEY, createdAt);
  return createdAt;
}
async function getActivities() {
  return getLocal(ACTIVITY_KEY, []);
}
async function updateSnapshot(currentDomain, currentTabStartedAt, liveActivity) {
  const activities = await getActivities();
  return buildSnapshot(currentDomain, currentTabStartedAt, activities, liveActivity);
}
async function saveActivity(activity) {
  const existing = await getActivities();
  const next = [...existing, activity];
  await setLocal(ACTIVITY_KEY, next);
  return next;
}
async function buildSnapshot(currentDomain, currentTabStartedAt, activities, liveActivity) {
  const trackingStartedAt = await getTrackingStartedAt();
  const todayActivities = activities.filter((entry) => isSameOrAfterLocalDayStart(entry.startedAt));
  const liveRecords = liveActivity && isSameOrAfterLocalDayStart(liveActivity.startedAt) ? [liveActivity] : [];
  const records = [...todayActivities, ...liveRecords];
  const totalsMap = /* @__PURE__ */ new Map();
  const categoryTotalsMap = /* @__PURE__ */ new Map();
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
  const snapshot = {
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

// src/types/focus-rules.ts
var DEFAULT_FOCUS_RULES = {
  blockedDomains: [],
  blockedCategories: [],
  domainTimerRules: [],
  categoryTimerRules: [],
  studyMode: {
    enabled: false,
    allowedDomains: [],
    allowedCategories: ["health", "learning", "work"]
  }
};

// src/background/api.ts
var focusRulesCache = null;
async function getBackendUrl() {
  const result = await chrome.storage.local.get("settings");
  return result.settings?.backendUrl ?? "http://localhost:8787";
}
function buildBackendCandidates(rawUrl) {
  const cleaned = rawUrl.replace(/\/+$/, "");
  const candidates = [cleaned];
  try {
    const url = new URL(cleaned);
    if (url.hostname === "localhost") {
      const loopback = new URL(cleaned);
      loopback.hostname = "127.0.0.1";
      candidates.push(loopback.toString().replace(/\/+$/, ""));
    } else if (url.hostname === "127.0.0.1") {
      const localhost = new URL(cleaned);
      localhost.hostname = "localhost";
      candidates.push(localhost.toString().replace(/\/+$/, ""));
    }
  } catch {
    return [cleaned];
  }
  return Array.from(new Set(candidates));
}
async function fetchJsonWithFallback(path, init) {
  const backendUrl = await getBackendUrl();
  const errors = [];
  for (const candidate of buildBackendCandidates(backendUrl)) {
    try {
      const response = await fetch(`${candidate}${path}`, init);
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      errors.push(error);
    }
  }
  throw errors[0] ?? new Error("Request failed");
}
async function sendActivity(activity) {
  try {
    await fetchJsonWithFallback("/track", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ activity })
    });
  } catch (error) {
    console.warn("Failed to send activity to backend", error);
  }
}
async function classifyDomain(domain) {
  try {
    const result = await fetchJsonWithFallback(`/classify?domain=${encodeURIComponent(domain)}`);
    return {
      rawCategory: result.rawCategory ?? null,
      normalizedCategory: result.normalizedCategory ?? null
    };
  } catch (error) {
    console.warn("Failed to classify domain", error);
    return {
      rawCategory: null,
      normalizedCategory: null
    };
  }
}
async function getFocusRules(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && focusRulesCache && focusRulesCache.expiresAt > now) {
    return focusRulesCache.value;
  }
  try {
    const result = await fetchJsonWithFallback("/focus-rules");
    const value = {
      blockedDomains: Array.isArray(result.blockedDomains) ? result.blockedDomains : [],
      blockedCategories: Array.isArray(result.blockedCategories) ? result.blockedCategories : [],
      domainTimerRules: Array.isArray(result.domainTimerRules) ? result.domainTimerRules : [],
      categoryTimerRules: Array.isArray(result.categoryTimerRules) ? result.categoryTimerRules : [],
      studyMode: {
        enabled: Boolean(result.studyMode?.enabled),
        allowedDomains: Array.isArray(result.studyMode?.allowedDomains) ? result.studyMode.allowedDomains : [],
        allowedCategories: Array.isArray(result.studyMode?.allowedCategories) ? result.studyMode.allowedCategories : []
      }
    };
    focusRulesCache = {
      value,
      expiresAt: now + 15e3
    };
    return value;
  } catch (error) {
    console.warn("Failed to load focus rules", error);
    return DEFAULT_FOCUS_RULES;
  }
}

// src/background/tracker.ts
var ActivityTracker = class {
  constructor() {
    this.currentSession = null;
    this.currentState = "hidden";
  }
  async startForTab(tab) {
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
    if (!await hasTemporaryBypass(nextDomain)) {
      const blockDecision = this.getBlockDecision(nextUrl, nextDomain, categoryMatch.normalizedCategory, focusRules, activityRecords, liveActivity);
      if (blockDecision) {
        await this.pauseCurrent("hidden");
        await this.redirectToBlockPage(tab?.id, nextUrl, nextDomain, blockDecision);
        return this.refreshSnapshot();
      }
    }
    await this.maybeNotifyTimerWarning(nextDomain, categoryMatch.normalizedCategory, focusRules, activityRecords, liveActivity);
    const shouldRotate = !this.currentSession || this.currentSession.url !== nextUrl || this.currentState !== "active";
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
  async pauseCurrent(reason) {
    this.currentState = reason;
    await this.finishCurrentSession(reason);
    return this.refreshSnapshot();
  }
  async refreshSnapshot() {
    return updateSnapshot(
      this.currentSession?.domain ?? null,
      this.currentSession ? new Date(this.currentSession.startedAt).toISOString() : null,
      this.buildLiveActivityRecord()
    );
  }
  async finishCurrentSession(state) {
    if (!this.currentSession) {
      return;
    }
    const endedAt = Date.now();
    const durationMs = endedAt - this.currentSession.startedAt;
    if (durationMs < 1e3) {
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
      source: "extension",
      rawCategory: this.currentSession.rawCategory,
      normalizedCategory: this.currentSession.normalizedCategory
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
      endedAt: (/* @__PURE__ */ new Date()).toISOString(),
      durationMs,
      state: "active",
      source: "extension",
      rawCategory: this.currentSession.rawCategory,
      normalizedCategory: this.currentSession.normalizedCategory
    };
  }
  getTabUrl(tab) {
    return tab?.url ?? tab?.pendingUrl ?? null;
  }
  shouldTrackUrl(rawUrl) {
    try {
      const url = new URL(rawUrl);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  }
  getBlockDecision(rawUrl, domain, normalizedCategory, focusRules, activityRecords, liveActivity) {
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
      return this.getDomainUsageMs(records, rule.window, rule.domain, rule.createdAt) >= rule.limitMinutes * 6e4;
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
      return this.getCategoryUsageMs(records, rule.window, normalizedCategory, rule.createdAt) >= rule.limitMinutes * 6e4;
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
  matchesBlockedDomain(domain, blockedDomain) {
    return domain === blockedDomain || domain.endsWith(`.${blockedDomain}`);
  }
  getStudyModeBlockDecision(rawUrl, domain, normalizedCategory, focusRules) {
    if (!focusRules.studyMode.enabled) {
      return null;
    }
    if (this.isAlwaysAllowedStudyDomain(domain) || this.isAlwaysAllowedStudySearchPage(rawUrl)) {
      return null;
    }
    const allowedDomain = focusRules.studyMode.allowedDomains.some((allowedDomain2) => this.matchesBlockedDomain(domain, allowedDomain2));
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
  isAlwaysAllowedStudyDomain(domain) {
    return domain === "youtube.com" || domain.endsWith(".youtube.com") || domain === "edu" || domain.endsWith(".edu");
  }
  isAlwaysAllowedStudySearchPage(rawUrl) {
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
  async maybeNotifyTimerWarning(domain, normalizedCategory, focusRules, activityRecords, liveActivity) {
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
  getTimerWarningCandidate(domain, normalizedCategory, focusRules, records) {
    const warningThresholdMs = 5 * 6e4;
    for (const rule of focusRules.domainTimerRules) {
      if (!this.matchesBlockedDomain(domain, rule.domain)) {
        continue;
      }
      const usageMs = this.getDomainUsageMs(records, rule.window, rule.domain, rule.createdAt);
      const remainingMs = rule.limitMinutes * 6e4 - usageMs;
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
      const remainingMs = rule.limitMinutes * 6e4 - usageMs;
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
  getDomainUsageMs(records, window, blockedDomain, createdAt) {
    return records.filter(
      (record) => this.isRecordInWindow(record, window, createdAt) && this.matchesBlockedDomain(record.domain, blockedDomain)
    ).reduce((total, record) => total + record.durationMs, 0);
  }
  getCategoryUsageMs(records, window, normalizedCategory, createdAt) {
    return records.filter((record) => this.isRecordInWindow(record, window, createdAt) && record.normalizedCategory === normalizedCategory).reduce((total, record) => total + record.durationMs, 0);
  }
  isRecordInWindow(record, window, createdAt) {
    const startedAt = new Date(record.startedAt).getTime();
    const createdAtTimestamp = new Date(createdAt).getTime();
    if (!Number.isFinite(startedAt)) {
      return false;
    }
    const windowStart = window === "forever" ? 0 : window === "day" ? startOfTodayTimestamp() : startOfWeekTimestamp();
    const effectiveStart = Number.isFinite(createdAtTimestamp) ? Math.max(windowStart, createdAtTimestamp) : windowStart;
    if (window === "forever") {
      return startedAt >= effectiveStart;
    }
    if (window === "day") {
      return startedAt >= effectiveStart;
    }
    return startedAt >= effectiveStart;
  }
  async redirectToBlockPage(tabId, originalUrl, domain, blockDecision) {
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
};

// src/background/index.ts
var tracker = new ActivityTracker();
function ensureSyncAlarm() {
  chrome.alarms.create("sync-current-tab", { periodInMinutes: 0.5 });
}
async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tabs[0] ?? null;
}
function getTabUrl(tab) {
  return tab?.url ?? tab?.pendingUrl ?? null;
}
async function syncCurrentTab() {
  const activeTab = await getActiveTab();
  await tracker.startForTab(activeTab);
}
async function getPopupState() {
  const activeTab = await getActiveTab();
  const snapshot = await tracker.startForTab(activeTab);
  const currentUrl = getTabUrl(activeTab);
  return {
    snapshot,
    currentUrl,
    currentSiteLabel: currentUrl ? extractDomain(currentUrl) : null
  };
}
void syncCurrentTab();
ensureSyncAlarm();
chrome.runtime.onInstalled.addListener(async () => {
  ensureSyncAlarm();
  await syncCurrentTab();
});
chrome.runtime.onStartup.addListener(async () => {
  ensureSyncAlarm();
  await restartTrackingSession();
  await syncCurrentTab();
});
chrome.tabs.onActivated.addListener(async () => {
  await syncCurrentTab();
});
chrome.tabs.onUpdated.addListener(async (_tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === "complete") {
    const activeTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (activeTabs[0]?.id === tab.id) {
      await tracker.startForTab(tab);
    }
  }
});
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    await tracker.pauseCurrent("hidden");
    return;
  }
  await syncCurrentTab();
});
chrome.idle.onStateChanged.addListener(async (newState) => {
  if (newState === "active") {
    await syncCurrentTab();
    return;
  }
  await tracker.pauseCurrent("idle");
});
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "sync-current-tab") {
    await syncCurrentTab();
  }
});
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "SYNC_CURRENT_TAB") {
    syncCurrentTab().then(sendResponse);
    return true;
  }
  if (message.type === "GET_SNAPSHOT") {
    tracker.refreshSnapshot().then(sendResponse);
    return true;
  }
  if (message.type === "GET_POPUP_STATE") {
    getPopupState().then(sendResponse);
    return true;
  }
  return false;
});
