import { BadJsonBodyError, readJsonBody } from "../utils/readJsonBody.js";
function normalizeDomain(rawValue) {
    return rawValue.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
}
function normalizeLimitMinutes(limitMinutes) {
    const value = Math.floor(Number(limitMinutes));
    return Number.isFinite(value) && value > 0 ? value : null;
}
function normalizeWindow(window) {
    return window === "day" || window === "week" || window === "forever" ? window : null;
}
function normalizeCreatedAt(createdAt) {
    const timestamp = createdAt ? new Date(createdAt).getTime() : Number.NaN;
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : new Date().toISOString();
}
function normalizeDomainTimerRules(input) {
    const unique = new Map();
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
function normalizeCategoryTimerRules(input) {
    const unique = new Map();
    for (const rule of input) {
        const category = typeof rule.category === "string" ? rule.category.trim() : "";
        const limitMinutes = normalizeLimitMinutes(Number(rule.limitMinutes));
        const window = typeof rule.window === "string" ? normalizeWindow(rule.window) : null;
        if (!category || !limitMinutes || !window) {
            continue;
        }
        unique.set(`${category}:${window}`, {
            category: category,
            limitMinutes,
            window,
            createdAt: normalizeCreatedAt(rule.createdAt)
        });
    }
    return [...unique.values()].sort((a, b) => a.category.localeCompare(b.category) || a.window.localeCompare(b.window));
}
function normalizeRules(input) {
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
            allowedCategories: Array.from(new Set((input.studyMode?.allowedCategories ?? []).filter(Boolean))).sort()
        }
    };
}
function normalizeUrlToDomain(rawUrl) {
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
    }
    catch {
        return null;
    }
}
function matchesBlockedDomain(domain, blockedDomain) {
    return domain === blockedDomain || domain.endsWith(`.${blockedDomain}`);
}
function findMatchedBlockedDomain(domain, blockedDomains) {
    for (const blockedDomain of blockedDomains) {
        if (matchesBlockedDomain(domain, blockedDomain)) {
            return blockedDomain;
        }
    }
    return null;
}
function isAlwaysAllowedStudyDomain(domain) {
    return domain === "youtube.com" || domain.endsWith(".youtube.com") || domain === "edu" || domain.endsWith(".edu");
}
function isAlwaysAllowedStudySearchPage(rawUrl) {
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
    }
    catch {
        return false;
    }
}
export async function handleFocusRulesTest(req, res, deps) {
    let payload;
    try {
        payload = await readJsonBody(req);
    }
    catch (error) {
        if (error instanceof BadJsonBodyError) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: error.message }));
            return;
        }
        throw error;
    }
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
    const studyModeAllowsDomain = Boolean(focusRules.studyMode.enabled) &&
        (isAlwaysAllowedStudyDomain(normalizedDomain) ||
            isAlwaysAllowedStudySearchPage(inputUrl) ||
            focusRules.studyMode.allowedDomains.some((allowedDomain) => matchesBlockedDomain(normalizedDomain, allowedDomain)) ||
            Boolean(categoryMatch.normalizedCategory && focusRules.studyMode.allowedCategories.includes(categoryMatch.normalizedCategory)));
    const matchedBlockedDomain = findMatchedBlockedDomain(normalizedDomain, focusRules.blockedDomains);
    const matchedBlockedCategory = categoryMatch.normalizedCategory && focusRules.blockedCategories.includes(categoryMatch.normalizedCategory)
        ? categoryMatch.normalizedCategory
        : null;
    const matchedDomainTimerRule = focusRules.domainTimerRules.find((rule) => matchesBlockedDomain(normalizedDomain, rule.domain) &&
        deps.activityStore.getDomainUsage(rule.window, rule.domain, rule.createdAt) >= rule.limitMinutes * 60000) ?? null;
    const matchedCategoryTimerRule = categoryMatch.normalizedCategory
        ? focusRules.categoryTimerRules.find((rule) => rule.category === categoryMatch.normalizedCategory &&
            deps.activityStore.getCategoryUsage(rule.window, rule.category, rule.createdAt) >= rule.limitMinutes * 60000) ?? null
        : null;
    const domainUsageMs = matchedDomainTimerRule
        ? deps.activityStore.getDomainUsage(matchedDomainTimerRule.window, matchedDomainTimerRule.domain, matchedDomainTimerRule.createdAt)
        : 0;
    const categoryUsageMs = matchedCategoryTimerRule
        ? deps.activityStore.getCategoryUsage(matchedCategoryTimerRule.window, matchedCategoryTimerRule.category, matchedCategoryTimerRule.createdAt)
        : 0;
    const result = {
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
