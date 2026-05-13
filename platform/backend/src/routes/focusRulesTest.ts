import type { IncomingMessage, ServerResponse } from "node:http";
import { ActivityStore } from "../services/activityStore.js";
import { CategoryLookupService } from "../services/categoryLookup.js";
import { FocusRulesStore } from "../services/focusRulesStore.js";
import type {
  CategoryTimerRule,
  DomainTimerRule,
  FocusRules,
  TimerRuleWindow
} from "../types/focusRules.js";

interface FocusRulesTestDependencies {
  activityStore: ActivityStore;
  categoryLookup: CategoryLookupService;
  focusRulesStore: FocusRulesStore;
}

interface FocusRulesTestResult {
  inputUrl: string;
  normalizedDomain: string | null;
  matchedClassificationDomain: string | null;
  rawCategory: string | null;
  normalizedCategory: string | null;
  matchedBlockedDomain: string | null;
  matchedBlockedCategory: string | null;
  matchedDomainTimerRule: DomainTimerRule | null;
  matchedCategoryTimerRule: CategoryTimerRule | null;
  domainUsageMs: number;
  categoryUsageMs: number;
  blockedByDomain: boolean;
  blockedByCategory: boolean;
  blockedByDomainTimer: boolean;
  blockedByCategoryTimer: boolean;
  blocked: boolean;
}

function normalizeDomain(rawValue: string): string {
  return rawValue.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
}

function normalizeLimitMinutes(limitMinutes: number): number | null {
  const value = Math.floor(Number(limitMinutes));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function normalizeWindow(window: string): TimerRuleWindow | null {
  return window === "day" || window === "week" || window === "forever" ? window : null;
}

function normalizeCreatedAt(createdAt: string | undefined): string {
  const timestamp = createdAt ? new Date(createdAt).getTime() : Number.NaN;
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : new Date().toISOString();
}

function normalizeDomainTimerRules(input: Partial<DomainTimerRule>[]): DomainTimerRule[] {
  const unique = new Map<string, DomainTimerRule>();

  for (const rule of input) {
    const domain = typeof rule.domain === "string" ? normalizeDomain(rule.domain) : "";
    const limitMinutes = normalizeLimitMinutes(Number(rule.limitMinutes));
    const window = typeof rule.window === "string" ? normalizeWindow(rule.window) : null;

    if (!domain || !limitMinutes || !window) {
      continue;
    }

    unique.set(`${domain}:${window}`, { domain, limitMinutes, window, createdAt: normalizeCreatedAt(rule.createdAt) });
  }

  return [...unique.values()].sort((a, b) => a.domain.localeCompare(b.domain) || a.window.localeCompare(b.window));
}

function normalizeCategoryTimerRules(input: Partial<CategoryTimerRule>[]): CategoryTimerRule[] {
  const unique = new Map<string, CategoryTimerRule>();

  for (const rule of input) {
    const category = typeof rule.category === "string" ? rule.category.trim() : "";
    const limitMinutes = normalizeLimitMinutes(Number(rule.limitMinutes));
    const window = typeof rule.window === "string" ? normalizeWindow(rule.window) : null;

    if (!category || !limitMinutes || !window) {
      continue;
    }

    unique.set(`${category}:${window}`, {
      category: category as CategoryTimerRule["category"],
      limitMinutes,
      window,
      createdAt: normalizeCreatedAt(rule.createdAt)
    });
  }

  return [...unique.values()].sort((a, b) => a.category.localeCompare(b.category) || a.window.localeCompare(b.window));
}

function normalizeRules(input: Partial<FocusRules>): FocusRules {
  const blockedDomains = Array.from(new Set((input.blockedDomains ?? []).map(normalizeDomain).filter(Boolean))).sort();
  const blockedCategories = Array.from(new Set((input.blockedCategories ?? []).filter(Boolean))).sort();
  const domainTimerRules = normalizeDomainTimerRules(input.domainTimerRules ?? []);
  const categoryTimerRules = normalizeCategoryTimerRules(input.categoryTimerRules ?? []);

  return {
    blockedDomains,
    blockedCategories,
    domainTimerRules,
    categoryTimerRules,
    studyMode: {
      enabled: Boolean(input.studyMode?.enabled),
      allowedDomains: Array.from(new Set((input.studyMode?.allowedDomains ?? []).map(normalizeDomain).filter(Boolean))).sort(),
      allowedCategories: Array.from(new Set((input.studyMode?.allowedCategories ?? []).filter(Boolean))).sort() as FocusRules["studyMode"]["allowedCategories"]
    }
  };
}

function normalizeUrlToDomain(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return null;
  }

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    return url.hostname.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

function matchesBlockedDomain(domain: string, blockedDomain: string): boolean {
  return domain === blockedDomain || domain.endsWith(`.${blockedDomain}`);
}

function findMatchedBlockedDomain(domain: string, blockedDomains: string[]): string | null {
  for (const blockedDomain of blockedDomains) {
    if (matchesBlockedDomain(domain, blockedDomain)) {
      return blockedDomain;
    }
  }

  return null;
}

function isAlwaysAllowedStudyDomain(domain: string): boolean {
  return domain === "youtube.com" || domain.endsWith(".youtube.com") || domain === "edu" || domain.endsWith(".edu");
}

function isAlwaysAllowedStudySearchPage(rawUrl: string): boolean {
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

export async function handleFocusRulesTest(
  req: IncomingMessage,
  res: ServerResponse,
  deps: FocusRulesTestDependencies
): Promise<void> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");
  const payload = JSON.parse(rawBody || "{}") as { url?: string; focusRules?: Partial<FocusRules> };
  const inputUrl = payload.url?.trim() ?? "";

  if (!inputUrl) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Missing url" }));
    return;
  }

  const normalizedDomain = normalizeUrlToDomain(inputUrl);
  if (!normalizedDomain) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid URL" }));
    return;
  }

  const focusRules = payload.focusRules ? normalizeRules(payload.focusRules) : deps.focusRulesStore.get();
  const categoryMatch = deps.categoryLookup.matchDomain(normalizedDomain);
  const studyModeAllowsDomain =
    Boolean(focusRules.studyMode.enabled) &&
    (isAlwaysAllowedStudyDomain(normalizedDomain) ||
      isAlwaysAllowedStudySearchPage(inputUrl) ||
      focusRules.studyMode.allowedDomains.some((allowedDomain) => matchesBlockedDomain(normalizedDomain, allowedDomain)) ||
      Boolean(categoryMatch.normalizedCategory && focusRules.studyMode.allowedCategories.includes(categoryMatch.normalizedCategory)));
  const matchedBlockedDomain = findMatchedBlockedDomain(normalizedDomain, focusRules.blockedDomains);
  const matchedBlockedCategory = categoryMatch.normalizedCategory && focusRules.blockedCategories.includes(categoryMatch.normalizedCategory)
    ? categoryMatch.normalizedCategory
    : null;
  const matchedDomainTimerRule =
    focusRules.domainTimerRules.find(
      (rule) =>
        matchesBlockedDomain(normalizedDomain, rule.domain) &&
        deps.activityStore.getDomainUsage(rule.window, rule.domain, rule.createdAt) >= rule.limitMinutes * 60_000
    ) ?? null;
  const matchedCategoryTimerRule =
    categoryMatch.normalizedCategory
      ? focusRules.categoryTimerRules.find(
          (rule) =>
            rule.category === categoryMatch.normalizedCategory &&
            deps.activityStore.getCategoryUsage(rule.window, rule.category, rule.createdAt) >= rule.limitMinutes * 60_000
        ) ?? null
      : null;
  const domainUsageMs = matchedDomainTimerRule
    ? deps.activityStore.getDomainUsage(
        matchedDomainTimerRule.window,
        matchedDomainTimerRule.domain,
        matchedDomainTimerRule.createdAt
      )
    : 0;
  const categoryUsageMs = matchedCategoryTimerRule
    ? deps.activityStore.getCategoryUsage(
        matchedCategoryTimerRule.window,
        matchedCategoryTimerRule.category,
        matchedCategoryTimerRule.createdAt
      )
    : 0;

  const result: FocusRulesTestResult = {
    inputUrl,
    normalizedDomain,
    matchedClassificationDomain: categoryMatch.matchedDomain,
    rawCategory: categoryMatch.rawCategory,
    normalizedCategory: categoryMatch.normalizedCategory,
    matchedBlockedDomain,
    matchedBlockedCategory,
    matchedDomainTimerRule,
    matchedCategoryTimerRule,
    domainUsageMs,
    categoryUsageMs,
    blockedByDomain: Boolean(matchedBlockedDomain),
    blockedByCategory: Boolean(matchedBlockedCategory),
    blockedByDomainTimer: Boolean(matchedDomainTimerRule),
    blockedByCategoryTimer: Boolean(matchedCategoryTimerRule),
    blocked: focusRules.studyMode.enabled
      ? !studyModeAllowsDomain || Boolean(matchedBlockedDomain || matchedBlockedCategory || matchedDomainTimerRule || matchedCategoryTimerRule)
      : Boolean(matchedBlockedDomain || matchedBlockedCategory || matchedDomainTimerRule || matchedCategoryTimerRule)
  };

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(result));
}
