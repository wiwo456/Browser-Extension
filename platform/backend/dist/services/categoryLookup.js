import { readFile } from "node:fs/promises";
export class CategoryLookupService {
    constructor(lookupPath) {
        this.lookupPath = lookupPath;
        this.entries = new Map();
    }
    async init() {
        try {
            const file = await readFile(this.lookupPath, "utf8");
            const payload = JSON.parse(file);
            for (const [domain, entry] of Object.entries(payload.lookup ?? {})) {
                this.entries.set(domain, entry);
            }
        }
        catch {
            this.entries.clear();
        }
    }
    matchDomain(domain) {
        const normalizedDomain = domain.trim().toLowerCase().replace(/^www\./, "");
        if (!normalizedDomain) {
            return {
                domain: normalizedDomain,
                matchedDomain: null,
                rawCategory: null,
                normalizedCategory: null
            };
        }
        for (const candidate of this.expandDomainCandidates(normalizedDomain)) {
            const entry = this.entries.get(candidate);
            if (entry) {
                return {
                    domain: normalizedDomain,
                    matchedDomain: candidate,
                    rawCategory: entry.rawCategory,
                    normalizedCategory: entry.normalizedCategory
                };
            }
        }
        return {
            domain: normalizedDomain,
            matchedDomain: null,
            rawCategory: null,
            normalizedCategory: null
        };
    }
    expandDomainCandidates(domain) {
        const parts = domain.split(".").filter(Boolean);
        const candidates = [];
        for (let index = 0; index < parts.length - 1; index += 1) {
            candidates.push(parts.slice(index).join("."));
        }
        return candidates;
    }
}
