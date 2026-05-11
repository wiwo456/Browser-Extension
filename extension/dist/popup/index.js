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
  if (!snapshot.trackingStartedAt) {
    return;
  }
  trackingTimer = window.setInterval(() => {
    if (currentSnapshot) {
      renderTrackingDuration(currentSnapshot);
    }
  }, 1e3);
}
async function openWebsite() {
  const result = await chrome.storage.local.get("settings");
  const backendUrl = result.settings?.backendUrl ?? WEBSITE_URL;
  await chrome.tabs.create({ url: backendUrl });
}
async function loadSnapshot() {
  const popupState = await chrome.runtime.sendMessage({ type: "GET_POPUP_STATE" });
  const snapshot = popupState.snapshot;
  currentSnapshot = snapshot;
  const currentSite = document.querySelector("[data-current-site]");
  const currentUrl = document.querySelector("[data-current-url]");
  const todayTotal = document.querySelector("[data-total-today]");
  if (!currentSite || !todayTotal || !currentUrl) {
    return;
  }
  currentSite.textContent = popupState.currentSiteLabel ?? snapshot.currentDomain ?? "No active site";
  currentUrl.textContent = formatUrlLabel(popupState.currentUrl);
  todayTotal.textContent = formatDuration(snapshot.totalMs);
  startDurationTicker(snapshot);
  startTrackingTicker(snapshot);
}
document.querySelector("[data-open-website]")?.addEventListener("click", () => {
  void openWebsite();
});
document.querySelector("[data-refresh]")?.addEventListener("click", () => {
  void loadSnapshot();
});
void loadSnapshot();
