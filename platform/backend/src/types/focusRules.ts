import type { NormalizedCategory } from "./activity.js";

export type TimerRuleWindow = "day" | "week" | "forever";

export interface DomainTimerRule {
  domain: string;
  limitMinutes: number;
  window: TimerRuleWindow;
  createdAt: string;
}

export interface CategoryTimerRule {
  category: NormalizedCategory;
  limitMinutes: number;
  window: TimerRuleWindow;
  createdAt: string;
}

export interface StudyModeSettings {
  enabled: boolean;
  allowedDomains: string[];
  allowedCategories: NormalizedCategory[];
}

export interface FocusRules {
  blockedDomains: string[];
  blockedCategories: NormalizedCategory[];
  domainTimerRules: DomainTimerRule[];
  categoryTimerRules: CategoryTimerRule[];
  studyMode: StudyModeSettings;
}

export const DEFAULT_FOCUS_RULES: FocusRules = {
  blockedDomains: [],
  blockedCategories: [],
  domainTimerRules: [],
  categoryTimerRules: [],
  studyMode: {
    enabled: false,
    allowedDomains: [],
    allowedCategories: ["health", "learning", "work"]
  }
};
