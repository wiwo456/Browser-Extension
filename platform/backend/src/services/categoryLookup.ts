import { readFile } from "node:fs/promises";
import type { NormalizedCategory } from "../types/activity.js";
import { LogisticRegressionClassifier } from "./logisticRegressionClassifier.js";

interface CategoryLookupEntry {
  rawCategory: string;
  normalizedCategory: NormalizedCategory;
  votes: number;
}

interface CategoryLookupPayload {
  lookup: Record<string, CategoryLookupEntry>;
}

const MANUAL_DOMAIN_OVERRIDES: Record<string, CategoryLookupEntry> = {
  "127.0.0.1": {
    rawCategory: "Local Development",
    normalizedCategory: "work",
    votes: 1
  },
  "localhost": {
    rawCategory: "Local Development",
    normalizedCategory: "work",
    votes: 1
  },
  "youtube.com": {
    rawCategory: "Manual Neutral Override",
    normalizedCategory: "other",
    votes: 1
  },
  "youtube-nocookie.com": {
    rawCategory: "Manual Neutral Override",
    normalizedCategory: "other",
    votes: 1
  },
  "instagram.com": {
    rawCategory: "Manual Social Override",
    normalizedCategory: "social",
    votes: 1
  },
  "facebook.com": {
    rawCategory: "Manual Social Override",
    normalizedCategory: "social",
    votes: 1
  },
  "twitter.com": {
    rawCategory: "Manual Social Override",
    normalizedCategory: "social",
    votes: 1
  },
  "x.com": {
    rawCategory: "Manual Social Override",
    normalizedCategory: "social",
    votes: 1
  },
  "reddit.com": {
    rawCategory: "Manual Social Override",
    normalizedCategory: "social",
    votes: 1
  },
  "tiktok.com": {
    rawCategory: "Manual Social Override",
    normalizedCategory: "social",
    votes: 1
  }
};

const MANUAL_DOMAIN_SUFFIX_OVERRIDES: Array<{
  suffix: string;
  entry: CategoryLookupEntry;
}> = [
  {
    suffix: ".localhost",
    entry: {
      rawCategory: "Local Development",
      normalizedCategory: "work",
      votes: 1
    }
  },
  {
    suffix: ".vercel.app",
    entry: {
      rawCategory: "Development Platform",
      normalizedCategory: "work",
      votes: 1
    }
  },
  {
    suffix: ".github.io",
    entry: {
      rawCategory: "Development Platform",
      normalizedCategory: "work",
      votes: 1
    }
  },
  {
    suffix: ".sharepoint.com",
    entry: {
      rawCategory: "Microsoft Productivity",
      normalizedCategory: "work",
      votes: 1
    }
  },
  {
    suffix: ".office.com",
    entry: {
      rawCategory: "Microsoft Productivity",
      normalizedCategory: "work",
      votes: 1
    }
  },
  {
    suffix: ".office365.com",
    entry: {
      rawCategory: "Microsoft Productivity",
      normalizedCategory: "work",
      votes: 1
    }
  },
  {
    suffix: ".live.com",
    entry: {
      rawCategory: "Microsoft Productivity",
      normalizedCategory: "work",
      votes: 1
    }
  }
];

const MANUAL_DOMAIN_PATTERNS: Array<{
  match: (domain: string) => boolean;
  entry: CategoryLookupEntry;
}> = [
  {
    match: (domain) => domain === "github.com" || domain.endsWith(".github.com"),
    entry: {
      rawCategory: "Development Platform",
      normalizedCategory: "work",
      votes: 1
    }
  },
  {
    match: (domain) => domain === "gitlab.com" || domain.endsWith(".gitlab.com"),
    entry: {
      rawCategory: "Development Platform",
      normalizedCategory: "work",
      votes: 1
    }
  },
  {
    match: (domain) => domain === "bitbucket.org" || domain.endsWith(".bitbucket.org"),
    entry: {
      rawCategory: "Development Platform",
      normalizedCategory: "work",
      votes: 1
    }
  },
  {
    match: (domain) => domain === "vercel.com" || domain.endsWith(".vercel.com"),
    entry: {
      rawCategory: "Development Platform",
      normalizedCategory: "work",
      votes: 1
    }
  },
  {
    match: (domain) => domain === "netlify.com" || domain.endsWith(".netlify.com"),
    entry: {
      rawCategory: "Development Platform",
      normalizedCategory: "work",
      votes: 1
    }
  },
  {
    match: (domain) => domain === "codesandbox.io" || domain.endsWith(".codesandbox.io"),
    entry: {
      rawCategory: "Development Platform",
      normalizedCategory: "work",
      votes: 1
    }
  },
  {
    match: (domain) => domain === "replit.com" || domain.endsWith(".replit.com"),
    entry: {
      rawCategory: "Development Platform",
      normalizedCategory: "work",
      votes: 1
    }
  },
  {
    match: (domain) => domain === "figma.com" || domain.endsWith(".figma.com"),
    entry: {
      rawCategory: "Design and Development Tool",
      normalizedCategory: "work",
      votes: 1
    }
  },
  {
    match: (domain) => domain === "microsoft.com" || domain.endsWith(".microsoft.com"),
    entry: {
      rawCategory: "Microsoft Productivity",
      normalizedCategory: "work",
      votes: 1
    }
  },
  {
    match: (domain) => domain === "office.com" || domain.endsWith(".office.com"),
    entry: {
      rawCategory: "Microsoft Productivity",
      normalizedCategory: "work",
      votes: 1
    }
  },
  {
    match: (domain) => domain === "office365.com" || domain.endsWith(".office365.com"),
    entry: {
      rawCategory: "Microsoft Productivity",
      normalizedCategory: "work",
      votes: 1
    }
  },
  {
    match: (domain) => domain === "sharepoint.com" || domain.endsWith(".sharepoint.com"),
    entry: {
      rawCategory: "Microsoft Productivity",
      normalizedCategory: "work",
      votes: 1
    }
  },
  {
    match: (domain) => domain === "outlook.com" || domain.endsWith(".outlook.com"),
    entry: {
      rawCategory: "Microsoft Productivity",
      normalizedCategory: "work",
      votes: 1
    }
  },
  {
    match: (domain) => domain === "teams.microsoft.com" || domain.endsWith(".teams.microsoft.com"),
    entry: {
      rawCategory: "Microsoft Productivity",
      normalizedCategory: "work",
      votes: 1
    }
  },
  {
    match: (domain) => domain === "onedrive.live.com" || domain.endsWith(".onedrive.live.com"),
    entry: {
      rawCategory: "Microsoft Productivity",
      normalizedCategory: "work",
      votes: 1
    }
  }
];

export interface CategoryMatch {
  domain: string;
  matchedDomain: string | null;
  rawCategory: string | null;
  normalizedCategory: NormalizedCategory | null;
  confidence?: number;
  source?: "manual" | "heuristic" | "lookup" | "ml-logreg";
}

export class CategoryLookupService {
  private readonly entries = new Map<string, CategoryLookupEntry>();
  private readonly mlClassifier: LogisticRegressionClassifier;

  constructor(private readonly lookupPath: string, mlModelPath: string) {
    this.mlClassifier = new LogisticRegressionClassifier(mlModelPath);
  }

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

    await this.mlClassifier.init();
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

    const manualOverride = this.matchManualOverride(normalizedDomain);
    if (manualOverride) {
      return {
        domain: normalizedDomain,
        matchedDomain: normalizedDomain,
        rawCategory: manualOverride.rawCategory,
        normalizedCategory: manualOverride.normalizedCategory,
        confidence: 1,
        source: "manual"
      };
    }

    const heuristicMatch = this.matchEducationalHeuristic(normalizedDomain);
    if (heuristicMatch) {
      return {
        domain: normalizedDomain,
        matchedDomain: normalizedDomain,
        rawCategory: heuristicMatch.rawCategory,
        normalizedCategory: heuristicMatch.normalizedCategory,
        confidence: 1,
        source: "heuristic"
      };
    }

    for (const candidate of this.expandDomainCandidates(normalizedDomain)) {
      const entry = this.entries.get(candidate);
      if (entry) {
        return {
          domain: normalizedDomain,
          matchedDomain: candidate,
          rawCategory: entry.rawCategory,
          normalizedCategory: entry.normalizedCategory,
          confidence: 1,
          source: "lookup"
        };
      }
    }

    const mlPrediction = this.mlClassifier.predict(normalizedDomain);
    if (mlPrediction) {
      return {
        domain: normalizedDomain,
        matchedDomain: null,
        rawCategory: "ML Logistic Regression Baseline",
        normalizedCategory: mlPrediction.normalizedCategory,
        confidence: mlPrediction.confidence,
        source: mlPrediction.source
      };
    }

    return {
      domain: normalizedDomain,
      matchedDomain: null,
      rawCategory: null,
      normalizedCategory: null
    };
  }

  private matchManualOverride(domain: string): CategoryLookupEntry | null {
    for (const { suffix, entry } of MANUAL_DOMAIN_SUFFIX_OVERRIDES) {
      if (domain.endsWith(suffix)) {
        return entry;
      }
    }

    for (const pattern of MANUAL_DOMAIN_PATTERNS) {
      if (pattern.match(domain)) {
        return pattern.entry;
      }
    }

    return MANUAL_DOMAIN_OVERRIDES[domain] ?? null;
  }

  private expandDomainCandidates(domain: string): string[] {
    const parts = domain.split(".").filter(Boolean);
    const candidates: string[] = [];

    for (let index = 0; index < parts.length - 1; index += 1) {
      candidates.push(parts.slice(index).join("."));
    }

    return candidates;
  }

  private matchEducationalHeuristic(domain: string): CategoryLookupEntry | null {
    if (
      domain.endsWith(".edu") ||
      /\.ac\.[a-z]{2}$/.test(domain) ||
      domain.endsWith(".edu.au") ||
      domain.includes(".k12.") ||
      domain.endsWith(".k12.us")
    ) {
      return {
        rawCategory: "Education Heuristic",
        normalizedCategory: "learning",
        votes: 1
      };
    }

    return null;
  }
}
