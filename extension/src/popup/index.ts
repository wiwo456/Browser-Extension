import type { DashboardSnapshot, PopupState } from "../types/activity.js";
import { formatDuration } from "../utils/time.js";

const WEBSITE_URL = "http://localhost:8787";

let currentSnapshot: DashboardSnapshot | null = null;
let durationTimer: number | null = null;
let trackingTimer: number | null = null;

function formatUrlLabel(rawUrl: string | null): string {
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

function getCurrentDuration(snapshot: DashboardSnapshot): number {
  if (!snapshot.currentTabStartedAt) {
    return 0;
  }

  const startedAt = new Date(snapshot.currentTabStartedAt).getTime();
  return Math.max(0, Date.now() - startedAt);
}

function renderDuration(snapshot: DashboardSnapshot): void {
  const currentDuration = document.querySelector<HTMLElement>("[data-current-duration]");
  if (!currentDuration) {
    return;
  }

  currentDuration.textContent = formatDuration(getCurrentDuration(snapshot));
}

function getTrackingDuration(snapshot: DashboardSnapshot): number {
  if (!snapshot.trackingStartedAt) {
    return 0;
  }

  const startedAt = new Date(snapshot.trackingStartedAt).getTime();
  return Math.max(0, Date.now() - startedAt);
}

function renderTrackingDuration(snapshot: DashboardSnapshot): void {
  const trackingDuration = document.querySelector<HTMLElement>("[data-tracking-duration]");
  if (!trackingDuration) {
    return;
  }

  trackingDuration.textContent = formatDuration(getTrackingDuration(snapshot));
}

function startDurationTicker(snapshot: DashboardSnapshot): void {
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
  }, 1000);
}

function startTrackingTicker(snapshot: DashboardSnapshot): void {
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
  }, 1000);
}

async function openWebsite(): Promise<void> {
  const result = await chrome.storage.local.get("settings");
  const backendUrl = result.settings?.backendUrl ?? WEBSITE_URL;
  await chrome.tabs.create({ url: backendUrl });
}

async function loadSnapshot(): Promise<void> {
  const popupState = (await chrome.runtime.sendMessage({ type: "GET_POPUP_STATE" })) as PopupState;
  const snapshot = popupState.snapshot;
  currentSnapshot = snapshot;

  const currentSite = document.querySelector<HTMLElement>("[data-current-site]");
  const currentUrl = document.querySelector<HTMLElement>("[data-current-url]");
  const todayTotal = document.querySelector<HTMLElement>("[data-total-today]");

  if (!currentSite || !todayTotal || !currentUrl) {
    return;
  }

  currentSite.textContent = popupState.currentSiteLabel ?? snapshot.currentDomain ?? "No active site";
  currentUrl.textContent = formatUrlLabel(popupState.currentUrl);
  todayTotal.textContent = formatDuration(snapshot.totalMs);
  startDurationTicker(snapshot);
  startTrackingTicker(snapshot);
}

document.querySelector<HTMLElement>("[data-open-website]")?.addEventListener("click", () => {
  void openWebsite();
});

document.querySelector<HTMLElement>("[data-refresh]")?.addEventListener("click", () => {
  void loadSnapshot();
});

void loadSnapshot();
