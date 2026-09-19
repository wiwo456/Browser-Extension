import type { PopupState } from "../types/activity.js";
import { extractDomain } from "../utils/domain.js";
import { sendBrowserSession } from "./api.js";
import { beginBrowserSession, finalizeBrowserSession, touchBrowserSession } from "./storage.js";
import { ActivityTracker } from "./tracker.js";

const tracker = new ActivityTracker();
let browserSessionInitPromise: Promise<void> | null = null;

function ensureSyncAlarm(): void {
  chrome.alarms.create("sync-current-tab", { periodInMinutes: 0.5 });
}

async function ensureBrowserSession(): Promise<void> {
  const recoveredSession = await beginBrowserSession();
  if (recoveredSession) {
    await sendBrowserSession(recoveredSession);
  }
}

async function finalizeActiveBrowserSession(
  endReason: "browser-closed" | "startup-recovery" | "manual-reset" | "system-inactive"
): Promise<void> {
  const completedSession = await finalizeBrowserSession(endReason);
  if (completedSession) {
    await sendBrowserSession(completedSession);
  }
}

function getBrowserSessionInitPromise(): Promise<void> {
  if (!browserSessionInitPromise) {
    browserSessionInitPromise = ensureBrowserSession();
  }

  return browserSessionInitPromise;
}

async function getActiveTab(): Promise<any | null> {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tabs[0] ?? null;
}

function getTabUrl(tab?: { url?: string; pendingUrl?: string } | null): string | null {
  return tab?.url ?? tab?.pendingUrl ?? null;
}

async function syncCurrentTab(): Promise<void> {
  await getBrowserSessionInitPromise();
  await touchBrowserSession();
  const activeTab = await getActiveTab();
  await tracker.startForTab(activeTab);
}

async function getPopupState(): Promise<PopupState> {
  await getBrowserSessionInitPromise();
  await touchBrowserSession();
  const activeTab = await getActiveTab();
  const snapshot = await tracker.startForTab(activeTab);
  const currentUrl = getTabUrl(activeTab);

  return {
    snapshot,
    currentUrl,
    currentSiteLabel: currentUrl ? extractDomain(currentUrl) : null
  };
}

void getBrowserSessionInitPromise();
void syncCurrentTab();

ensureSyncAlarm();

chrome.runtime.onInstalled.addListener(async () => {
  await getBrowserSessionInitPromise();
  ensureSyncAlarm();
  await syncCurrentTab();
});

chrome.runtime.onStartup.addListener(async () => {
  browserSessionInitPromise = null;
  await getBrowserSessionInitPromise();
  ensureSyncAlarm();
  await syncCurrentTab();
});

chrome.tabs.onActivated.addListener(async () => {
  await syncCurrentTab();
});

chrome.tabs.onUpdated.addListener(async (_tabId: number, changeInfo: any, tab: any) => {
  if (changeInfo.url || changeInfo.status === "complete") {
    const activeTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (activeTabs[0]?.id === tab.id) {
      await tracker.startForTab(tab);
    }
  }
});

chrome.windows.onFocusChanged.addListener(async (windowId: number) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    await tracker.pauseCurrent("hidden");
    return;
  }

  await syncCurrentTab();
});

chrome.windows.onRemoved.addListener(async () => {
  const remainingWindows = await chrome.windows.getAll();
  if (remainingWindows.length > 0) {
    return;
  }

  await finalizeActiveBrowserSession("browser-closed");
});

chrome.idle.onStateChanged.addListener(async (newState: "active" | "idle" | "locked") => {
  if (newState === "active") {
    await syncCurrentTab();
    return;
  }

  await tracker.pauseCurrent("idle");
  await finalizeActiveBrowserSession("system-inactive");
});

chrome.alarms.onAlarm.addListener(async (alarm: { name?: string }) => {
  if (alarm.name === "sync-current-tab") {
    await syncCurrentTab();
  }
});

chrome.runtime.onMessage.addListener((message: { type?: string }, _sender: any, sendResponse: (response: unknown) => void) => {
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
