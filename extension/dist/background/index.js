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
function isSameOrAfterLocalDayStart(isoString, now = /* @__PURE__ */ new Date()) {
  const timestamp = new Date(isoString).getTime();
  return Number.isFinite(timestamp) && timestamp >= startOfTodayTimestamp(now);
}

// src/background/storage.ts
var ACTIVITY_KEY = "activityRecords";
var SNAPSHOT_KEY = "dashboardSnapshot";
var TRACKING_STARTED_AT_KEY = "trackingStartedAt";
async function getLocal(key, fallback) {
  const result = await chrome.storage.local.get(key);
  return result[key] ?? fallback;
}
async function setLocal(key, value) {
  await chrome.storage.local.set({ [key]: value });
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
  const todayRecords = existing.filter((entry) => isSameOrAfterLocalDayStart(entry.startedAt));
  const next = [...todayRecords, activity];
  await setLocal(ACTIVITY_KEY, next);
  return next;
}
async function buildSnapshot(currentDomain, currentTabStartedAt, activities, liveActivity) {
  const trackingStartedAt = await getTrackingStartedAt();
  const records = liveActivity ? [...activities, liveActivity] : activities;
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
  blockedCategories: []
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
      blockedCategories: Array.isArray(result.blockedCategories) ? result.blockedCategories : []
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
    if (this.isBlocked(nextDomain, categoryMatch.normalizedCategory, focusRules)) {
      await this.pauseCurrent("hidden");
      await this.redirectToBlockPage(tab?.id, nextDomain, categoryMatch.normalizedCategory);
      return this.refreshSnapshot();
    }
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
  isBlocked(domain, normalizedCategory, focusRules) {
    if (focusRules.blockedDomains.some((blockedDomain) => this.matchesBlockedDomain(domain, blockedDomain))) {
      return true;
    }
    return Boolean(normalizedCategory && focusRules.blockedCategories.includes(normalizedCategory));
  }
  matchesBlockedDomain(domain, blockedDomain) {
    return domain === blockedDomain || domain.endsWith(`.${blockedDomain}`);
  }
  async redirectToBlockPage(tabId, domain, category) {
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
};

// src/background/index.ts
var tracker = new ActivityTracker();
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
chrome.alarms.create("sync-current-tab", { periodInMinutes: 1 });
chrome.runtime.onInstalled.addListener(async () => {
  await syncCurrentTab();
});
chrome.runtime.onStartup.addListener(async () => {
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
