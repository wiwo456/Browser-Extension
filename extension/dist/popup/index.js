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

// src/utils/time.ts
function formatDuration(totalMs) {
  const totalSeconds = Math.floor(totalMs / 1e3);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(totalSeconds % 3600 / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

// src/popup/index.ts
var WEBSITE_URL = "http://localhost:8787";
var currentSnapshot = null;
var durationTimer = null;
var trackingTimer = null;
var focusRulesState = DEFAULT_FOCUS_RULES;
var isTogglingStudyMode = false;
function formatUrlLabel(rawUrl) {
  if (!rawUrl) {
    return "No active tab URL detected";
  }
  try {
    const url = new URL(rawUrl);
    const path = url.pathname === "/" ? "" : url.pathname;
    return `${url.hostname}${path}`.slice(0, 42);
  } catch {
    return rawUrl.slice(0, 42);
  }
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
function normalizeFocusRules(input) {
  return {
    blockedDomains: Array.isArray(input?.blockedDomains) ? input.blockedDomains : [],
    blockedCategories: Array.isArray(input?.blockedCategories) ? input.blockedCategories : [],
    domainTimerRules: Array.isArray(input?.domainTimerRules) ? input.domainTimerRules : [],
    categoryTimerRules: Array.isArray(input?.categoryTimerRules) ? input.categoryTimerRules : [],
    studyMode: {
      enabled: Boolean(input?.studyMode?.enabled),
      allowedDomains: Array.isArray(input?.studyMode?.allowedDomains) ? input.studyMode.allowedDomains : [],
      allowedCategories: Array.isArray(input?.studyMode?.allowedCategories) ? input.studyMode.allowedCategories : DEFAULT_FOCUS_RULES.studyMode.allowedCategories
    }
  };
}
async function fetchJsonWithFallback(path, init) {
  const result = await chrome.storage.local.get("settings");
  const backendUrl = result.settings?.backendUrl ?? WEBSITE_URL;
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
function renderStudyMode() {
  const modeRow = document.querySelector(".mode-row");
  const toggle = document.querySelector("[data-study-mode-toggle]");
  if (!toggle || !modeRow) {
    return;
  }
  const enabled = Boolean(focusRulesState.studyMode.enabled);
  modeRow.classList.toggle("is-on", enabled);
  toggle.classList.toggle("is-on", enabled);
  toggle.setAttribute("aria-pressed", enabled ? "true" : "false");
  toggle.disabled = isTogglingStudyMode;
}
async function loadFocusRules() {
  try {
    const result = await fetchJsonWithFallback("/focus-rules");
    focusRulesState = normalizeFocusRules(result);
  } catch {
    focusRulesState = DEFAULT_FOCUS_RULES;
  }
  renderStudyMode();
}
function getCurrentDuration(snapshot) {
  if (!snapshot.currentTabStartedAt) {
    return 0;
  }
  const startedAt = new Date(snapshot.currentTabStartedAt).getTime();
  return Math.max(0, Date.now() - startedAt);
}
function renderDuration(snapshot) {
  const currentDuration = document.querySelector("[data-current-duration]");
  if (!currentDuration) {
    return;
  }
  currentDuration.textContent = formatDuration(getCurrentDuration(snapshot));
}
function getTrackingDuration(snapshot) {
  if (!snapshot.trackingStartedAt) {
    return 0;
  }
  const startedAt = new Date(snapshot.trackingStartedAt).getTime();
  return Math.max(0, Date.now() - startedAt);
}
function renderTrackingDuration(snapshot) {
  const trackingDuration = document.querySelector("[data-tracking-duration]");
  if (!trackingDuration) {
    return;
  }
  trackingDuration.textContent = formatDuration(getTrackingDuration(snapshot));
}
function matchesBlockedDomain(domain, blockedDomain) {
  return domain === blockedDomain || domain.endsWith(`.${blockedDomain}`);
}
function getSiteTotalDuration(snapshot) {
  if (!snapshot.currentDomain) {
    return 0;
  }
  return snapshot.activities.reduce((total, activity) => {
    if (activity.domain !== snapshot.currentDomain) {
      return total;
    }
    if (activity.state === "active" && snapshot.currentTabStartedAt === activity.startedAt) {
      const startedAt = new Date(activity.startedAt).getTime();
      return total + Math.max(0, Date.now() - startedAt);
    }
    return total + activity.durationMs;
  }, 0);
}
function renderSiteTotal(snapshot) {
  const siteTotal = document.querySelector("[data-site-total]");
  if (!siteTotal) {
    return;
  }
  const siteTotalDuration = getSiteTotalDuration(snapshot);
  siteTotal.textContent = formatDuration(siteTotalDuration);
  siteTotal.classList.remove("is-warning", "is-danger");
  if (!snapshot.currentDomain) {
    return;
  }
  const matchingTimerRule = focusRulesState.domainTimerRules.find(
    (rule) => matchesBlockedDomain(snapshot.currentDomain, rule.domain)
  );
  if (!matchingTimerRule || matchingTimerRule.limitMinutes <= 0) {
    return;
  }
  const limitMs = matchingTimerRule.limitMinutes * 6e4;
  const usageRatio = siteTotalDuration / limitMs;
  if (usageRatio >= 0.75) {
    siteTotal.classList.add("is-danger");
    return;
  }
  if (usageRatio >= 0.5) {
    siteTotal.classList.add("is-warning");
  }
}
function startDurationTicker(snapshot) {
  if (durationTimer) {
    window.clearInterval(durationTimer);
    durationTimer = null;
  }
  renderDuration(snapshot);
  if (!snapshot.currentTabStartedAt) {
    return;
  }
  durationTimer = window.setInterval(() => {
    if (currentSnapshot) {
      renderDuration(currentSnapshot);
    }
  }, 1e3);
}
function startTrackingTicker(snapshot) {
  if (trackingTimer) {
    window.clearInterval(trackingTimer);
    trackingTimer = null;
  }
  renderTrackingDuration(snapshot);
  renderSiteTotal(snapshot);
  if (!snapshot.trackingStartedAt && !snapshot.currentDomain) {
    return;
  }
  trackingTimer = window.setInterval(() => {
    if (currentSnapshot) {
      renderTrackingDuration(currentSnapshot);
      renderSiteTotal(currentSnapshot);
    }
  }, 1e3);
}
async function openDashboard() {
  const result = await chrome.storage.local.get("settings");
  const backendUrl = result.settings?.backendUrl ?? WEBSITE_URL;
  await chrome.tabs.create({ url: `${backendUrl.replace(/\/+$/, "")}/#dashboard` });
}
async function toggleStudyMode() {
  if (isTogglingStudyMode) {
    return;
  }
  isTogglingStudyMode = true;
  renderStudyMode();
  try {
    const nextRules = {
      ...focusRulesState,
      studyMode: {
        ...focusRulesState.studyMode,
        enabled: !focusRulesState.studyMode.enabled
      }
    };
    const saved = await fetchJsonWithFallback("/focus-rules", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(nextRules)
    });
    focusRulesState = normalizeFocusRules(saved);
  } catch {
  } finally {
    isTogglingStudyMode = false;
    renderStudyMode();
  }
}
async function loadSnapshot() {
  const popupState = await chrome.runtime.sendMessage({ type: "GET_POPUP_STATE" });
  const snapshot = popupState.snapshot;
  currentSnapshot = snapshot;
  const currentSite = document.querySelector("[data-current-site]");
  const currentUrl = document.querySelector("[data-current-url]");
  const siteTotal = document.querySelector("[data-site-total]");
  if (!currentSite || !siteTotal || !currentUrl) {
    return;
  }
  currentSite.textContent = popupState.currentSiteLabel ?? snapshot.currentDomain ?? "No active site";
  currentUrl.textContent = formatUrlLabel(popupState.currentUrl);
  siteTotal.textContent = formatDuration(getSiteTotalDuration(snapshot));
  startDurationTicker(snapshot);
  startTrackingTicker(snapshot);
}
document.querySelector("[data-open-dashboard]")?.addEventListener("click", () => {
  void openDashboard();
});
document.querySelector("[data-study-mode-toggle]")?.addEventListener("click", () => {
  void toggleStudyMode();
});
void loadFocusRules();
void loadSnapshot();
