import type { NormalizedCategory } from "./activity";

export interface FocusRules {
  blockedDomains: string[];
  blockedCategories: NormalizedCategory[];
}

export const DEFAULT_FOCUS_RULES: FocusRules = {
  blockedDomains: [],
  blockedCategories: []
};
