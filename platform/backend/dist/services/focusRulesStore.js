import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { DEFAULT_FOCUS_RULES } from "../types/focusRules.js";
function normalizeDomain(domain) {
    return domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
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
            blockedCategories: [...this.rules.blockedCategories]
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
        return {
            blockedDomains,
            blockedCategories
        };
    }
}
