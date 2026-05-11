import { readFile } from "node:fs/promises";
import type { NormalizedCategory } from "../types/activity.js";

interface CategoryLookupEntry {
  rawCategory: string;
  normalizedCategory: NormalizedCategory;
  votes: number;
}

interface CategoryLookupPayload {
  lookup: Record<string, CategoryLookupEntry>;
}

export interface CategoryMatch {
  domain: string;
  matchedDomain: string | null;
  rawCategory: string | null;
  normalizedCategory: NormalizedCategory | null;
}

export class CategoryLookupService {
  private readonly entries = new Map<string, CategoryLookupEntry>();

  constructor(private readonly lookupPath: string) {}

  async init(): Promise<void> {
    try {
      const file = await readFile(this.lookupPath, "utf8");
      const payload = JSON.parse(file) as CategoryLookupPayload;
      for (const [domain, entry] of Object.entries(payload.lookup ?? {})) {
        this.entries.set(domain, entry);
      }
    } catch {
      this.entries.clear();
    }
  }

  matchDomain(domain: string): CategoryMatch {
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

  private expandDomainCandidates(domain: string): string[] {
    const parts = domain.split(".").filter(Boolean);
    const candidates: string[] = [];

    for (let index = 0; index < parts.length - 1; index += 1) {
      candidates.push(parts.slice(index).join("."));
    }

    return candidates;
  }
}
