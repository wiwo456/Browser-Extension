import type { ActivityRecord, BrowserSessionRecord } from "../types/activity.js";
import type { NormalizedCategory } from "../types/activity.js";
import { DEFAULT_FOCUS_RULES, type FocusRules } from "../types/focus-rules.js";

interface CategoryMatch {
  rawCategory: string | null;
  normalizedCategory: NormalizedCategory | null;
}

let focusRulesCache: { value: FocusRules; expiresAt: number } | null = null;

async function getBackendUrl(): Promise<string> {
  const result = await chrome.storage.local.get("settings");
  return result.settings?.backendUrl ?? "http://localhost:8787";
}

function buildBackendCandidates(rawUrl: string): string[] {
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

async function fetchJsonWithFallback<T>(path: string, init?: RequestInit): Promise<T> {
  const backendUrl = await getBackendUrl();
  const errors: unknown[] = [];

  for (const candidate of buildBackendCandidates(backendUrl)) {
    try {
      const response = await fetch(`${candidate}${path}`, init);
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      errors.push(error);
    }
  }

  throw errors[0] ?? new Error("Request failed");
}

export async function sendActivity(activity: ActivityRecord): Promise<void> {
  try {
    await fetchJsonWithFallback<{ ok: boolean }>("/track", {
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

export async function sendBrowserSession(session: BrowserSessionRecord): Promise<void> {
  try {
    await fetchJsonWithFallback<{ ok: boolean }>("/browser-session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ session })
    });
  } catch (error) {
    console.warn("Failed to send browser session to backend", error);
  }
}

export async function classifyDomain(domain: string): Promise<CategoryMatch> {
  try {
    const result = await fetchJsonWithFallback<Partial<CategoryMatch>>(`/classify?domain=${encodeURIComponent(domain)}`);
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

export async function getFocusRules(forceRefresh = false): Promise<FocusRules> {
  const now = Date.now();
  if (!forceRefresh && focusRulesCache && focusRulesCache.expiresAt > now) {
    return focusRulesCache.value;
  }

  try {
    const result = await fetchJsonWithFallback<Partial<FocusRules>>("/focus-rules");
    const value: FocusRules = {
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
      expiresAt: now + 15_000
    };
    return value;
  } catch (error) {
    console.warn("Failed to load focus rules", error);
    return DEFAULT_FOCUS_RULES;
  }
}
