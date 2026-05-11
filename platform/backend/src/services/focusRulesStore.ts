import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { DEFAULT_FOCUS_RULES, type FocusRules } from "../types/focusRules.js";

function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
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
      blockedCategories: [...this.rules.blockedCategories]
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

    return {
      blockedDomains,
      blockedCategories
    };
  }
}
