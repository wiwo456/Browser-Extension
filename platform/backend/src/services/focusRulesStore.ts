import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  DEFAULT_FOCUS_RULES,
  type CategoryTimerRule,
  type DomainTimerRule,
  type FocusRules,
  type TimerRuleWindow
} from "../types/focusRules.js";

function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
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

export class FocusRulesStore {
  private rules: FocusRules = DEFAULT_FOCUS_RULES;

  constructor(private readonly storagePath: string) {}

  async init(): Promise<void> {
    try {
      const file = await readFile(this.storagePath, "utf8");
      this.rules = this.normalizeRules(JSON.parse(file) as Partial<FocusRules>);
    } catch {
      this.rules = DEFAULT_FOCUS_RULES;
    }
  }

  get(): FocusRules {
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

  async save(nextRules: Partial<FocusRules>): Promise<FocusRules> {
    this.rules = this.normalizeRules(nextRules);
    await mkdir(dirname(this.storagePath), { recursive: true });
    await writeFile(this.storagePath, JSON.stringify(this.rules, null, 2), "utf8");
    return this.get();
  }

  private normalizeRules(input: Partial<FocusRules>): FocusRules {
    const blockedDomains = Array.from(
      new Set((input.blockedDomains ?? []).map(normalizeDomain).filter(Boolean))
    ).sort();
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
        allowedCategories: Array.from(new Set((input.studyMode?.allowedCategories ?? []).filter(Boolean))).sort() as FocusRules["studyMode"]["allowedCategories"]
      }
    };
  }

  private normalizeDomainTimerRules(input: Partial<DomainTimerRule>[]): DomainTimerRule[] {
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

  private normalizeCategoryTimerRules(input: Partial<CategoryTimerRule>[]): CategoryTimerRule[] {
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
}
