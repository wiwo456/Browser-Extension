import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { DEFAULT_FOCUS_RULES } from "../types/focusRules.js";
function normalizeDomain(domain) {
    return domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
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
export class FocusRulesStore {
    constructor(storagePath) {
        this.storagePath = storagePath;
        this.rules = DEFAULT_FOCUS_RULES;
    }
    async init() {
        try {
            const file = await readFile(this.storagePath, "utf8");
            this.rules = this.normalizeRules(JSON.parse(file));
        }
        catch {
            this.rules = DEFAULT_FOCUS_RULES;
        }
    }
    get() {
        return {
            blockedDomains: [...this.rules.blockedDomains],
            blockedCategories: [...this.rules.blockedCategories],
            domainTimerRules: this.rules.domainTimerRules.map((rule) => ({ ...rule })),
            categoryTimerRules: this.rules.categoryTimerRules.map((rule) => ({ ...rule })),
            studyMode: {
                enabled: this.rules.studyMode.enabled,
                allowedDomains: [...this.rules.studyMode.allowedDomains],
                allowedCategories: [...this.rules.studyMode.allowedCategories]
            }
        };
    }
    async save(nextRules) {
        this.rules = this.normalizeRules(nextRules);
        await mkdir(dirname(this.storagePath), { recursive: true });
        await writeFile(this.storagePath, JSON.stringify(this.rules, null, 2), "utf8");
        return this.get();
    }
    normalizeRules(input) {
        const blockedDomains = Array.from(new Set((input.blockedDomains ?? []).map(normalizeDomain).filter(Boolean))).sort();
        const blockedCategories = Array.from(new Set((input.blockedCategories ?? []).filter(Boolean))).sort();
        const domainTimerRules = this.normalizeDomainTimerRules(input.domainTimerRules ?? []);
        const categoryTimerRules = this.normalizeCategoryTimerRules(input.categoryTimerRules ?? []);
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
    normalizeDomainTimerRules(input) {
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
    normalizeCategoryTimerRules(input) {
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
}
