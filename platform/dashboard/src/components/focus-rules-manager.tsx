import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { GlassButton } from "@/components/ui/glass-button";
import { getApiUrl } from "@/lib/api";
import type { NormalizedCategory } from "@/types/activity";
import {
  DEFAULT_FOCUS_RULES,
  type CategoryTimerRule,
  type DomainTimerRule,
  type FocusRules,
  type TimerRuleWindow
} from "@/types/focus-rules";

const CATEGORY_LABELS: Record<NormalizedCategory, string> = {
  adult: "Adult",
  entertainment: "Entertainment",
  gaming: "Gaming",
  health: "Health",
  learning: "Learning",
  news: "News",
  other: "Other",
  shopping: "Shopping",
  social: "Social",
  work: "Work"
};

const WINDOW_LABELS: Record<TimerRuleWindow, string> = {
  day: "1 day",
  week: "1 week",
  forever: "Forever"
};

type TimerInputUnit = "minutes" | "hours";

function normalizeDomainInput(value: string): string {
  return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
}

function normalizePositiveMinutes(value: string): number | null {
  const minutes = Math.floor(Number(value));
  return Number.isFinite(minutes) && minutes > 0 ? minutes : null;
}

function convertTimerAmountToMinutes(value: string, unit: TimerInputUnit): number | null {
  const amount = Math.floor(Number(value));
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  return unit === "hours" ? amount * 60 : amount;
}

function formatLimitMinutes(limitMinutes: number): string {
  if (limitMinutes % 60 === 0) {
    const hours = limitMinutes / 60;
    return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  }

  return `${limitMinutes} ${limitMinutes === 1 ? "minute" : "minutes"}`;
}

function normalizeFocusRules(input: Partial<FocusRules> | null | undefined): FocusRules {
  return {
    blockedDomains: Array.isArray(input?.blockedDomains) ? input.blockedDomains : [],
    blockedCategories: Array.isArray(input?.blockedCategories) ? input.blockedCategories : [],
    domainTimerRules: Array.isArray(input?.domainTimerRules) ? input.domainTimerRules : [],
    categoryTimerRules: Array.isArray(input?.categoryTimerRules) ? input.categoryTimerRules : []
  };
}

interface FocusRulesManagerProps {
  onBack: () => void;
}

interface FocusRulesTestResult {
  inputUrl: string;
  normalizedDomain: string | null;
  matchedClassificationDomain: string | null;
  rawCategory: string | null;
  normalizedCategory: NormalizedCategory | null;
  matchedBlockedDomain: string | null;
  matchedBlockedCategory: NormalizedCategory | null;
  matchedDomainTimerRule: DomainTimerRule | null;
  matchedCategoryTimerRule: CategoryTimerRule | null;
  domainUsageMs: number;
  categoryUsageMs: number;
  blockedByDomain: boolean;
  blockedByCategory: boolean;
  blockedByDomainTimer: boolean;
  blockedByCategoryTimer: boolean;
  blocked: boolean;
}

export default function FocusRulesManager({ onBack }: FocusRulesManagerProps) {
  const [focusRules, setFocusRules] = useState<FocusRules>(DEFAULT_FOCUS_RULES);
  const [blockedDomainInput, setBlockedDomainInput] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<NormalizedCategory | "">("");
  const [domainTimerInput, setDomainTimerInput] = useState("");
  const [domainTimerAmountInput, setDomainTimerAmountInput] = useState("");
  const [domainTimerUnit, setDomainTimerUnit] = useState<TimerInputUnit>("hours");
  const [domainTimerWindow, setDomainTimerWindow] = useState<TimerRuleWindow>("day");
  const [categoryTimerCategory, setCategoryTimerCategory] = useState<NormalizedCategory | "">("");
  const [categoryTimerAmountInput, setCategoryTimerAmountInput] = useState("");
  const [categoryTimerUnit, setCategoryTimerUnit] = useState<TimerInputUnit>("hours");
  const [categoryTimerWindow, setCategoryTimerWindow] = useState<TimerRuleWindow>("day");
  const [testUrlInput, setTestUrlInput] = useState("");
  const [isTestingRules, setIsTestingRules] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<FocusRulesTestResult | null>(null);
  const [savingRules, setSavingRules] = useState(false);
  const [saveLabel, setSaveLabel] = useState("Save blocking rules");

  useEffect(() => {
    let cancelled = false;

    async function loadFocusRules() {
      try {
        const response = await fetch(getApiUrl("/focus-rules"));
        if (!response.ok) {
          throw new Error("Failed to load focus rules");
        }

        const data = normalizeFocusRules((await response.json()) as Partial<FocusRules>);
        if (!cancelled) {
          setFocusRules(data);
        }
      } catch {
        if (!cancelled) {
          setFocusRules(DEFAULT_FOCUS_RULES);
        }
      }
    }

    void loadFocusRules();
    return () => {
      cancelled = true;
    };
  }, []);

  const availableBlockedCategories = useMemo(
    () =>
      (Object.keys(CATEGORY_LABELS) as NormalizedCategory[]).filter(
        (category) => !focusRules.blockedCategories.includes(category)
      ),
    [focusRules.blockedCategories]
  );

  function addBlockedCategory(): void {
    if (!selectedCategory) {
      return;
    }

    setFocusRules((current) => ({
      ...current,
      blockedCategories: [...current.blockedCategories, selectedCategory].sort()
    }));
    setSelectedCategory("");
  }

  function removeBlockedCategory(category: NormalizedCategory): void {
    setFocusRules((current) => ({
      ...current,
      blockedCategories: current.blockedCategories.filter((item) => item !== category)
    }));
  }

  function addBlockedDomain(): void {
    const domain = normalizeDomainInput(blockedDomainInput);
    if (!domain) {
      return;
    }

    setFocusRules((current) => ({
      ...current,
      blockedDomains: Array.from(new Set([...current.blockedDomains, domain])).sort()
    }));
    setBlockedDomainInput("");
  }

  function removeBlockedDomain(domain: string): void {
    setFocusRules((current) => ({
      ...current,
      blockedDomains: current.blockedDomains.filter((item) => item !== domain)
    }));
  }

  function addDomainTimerRule(): void {
    const domain = normalizeDomainInput(domainTimerInput);
    const limitMinutes = convertTimerAmountToMinutes(domainTimerAmountInput, domainTimerUnit);
    if (!domain || !limitMinutes) {
      return;
    }

    setFocusRules((current) => {
      const nextRules = current.domainTimerRules.filter(
        (rule) => !(rule.domain === domain && rule.window === domainTimerWindow)
      );

      nextRules.push({
        domain,
        limitMinutes,
        window: domainTimerWindow,
        createdAt: new Date().toISOString()
      });

      return {
        ...current,
        domainTimerRules: nextRules.sort((a, b) => a.domain.localeCompare(b.domain) || a.window.localeCompare(b.window))
      };
    });

    setDomainTimerInput("");
    setDomainTimerAmountInput("");
    setDomainTimerUnit("hours");
    setDomainTimerWindow("day");
  }

  function removeDomainTimerRule(ruleToRemove: DomainTimerRule): void {
    setFocusRules((current) => ({
      ...current,
      domainTimerRules: current.domainTimerRules.filter(
        (rule) => !(rule.domain === ruleToRemove.domain && rule.window === ruleToRemove.window)
      )
    }));
  }

  function addCategoryTimerRule(): void {
    const category = categoryTimerCategory;
    const limitMinutes = convertTimerAmountToMinutes(categoryTimerAmountInput, categoryTimerUnit);
    if (!category || !limitMinutes) {
      return;
    }

    setFocusRules((current) => {
      const nextRules = current.categoryTimerRules.filter(
        (rule) => !(rule.category === category && rule.window === categoryTimerWindow)
      );

      nextRules.push({
        category,
        limitMinutes,
        window: categoryTimerWindow,
        createdAt: new Date().toISOString()
      });

      return {
        ...current,
        categoryTimerRules: nextRules.sort((a, b) => a.category.localeCompare(b.category) || a.window.localeCompare(b.window))
      };
    });

    setCategoryTimerCategory("");
    setCategoryTimerAmountInput("");
    setCategoryTimerUnit("hours");
    setCategoryTimerWindow("day");
  }

  function removeCategoryTimerRule(ruleToRemove: CategoryTimerRule): void {
    setFocusRules((current) => ({
      ...current,
      categoryTimerRules: current.categoryTimerRules.filter(
        (rule) => !(rule.category === ruleToRemove.category && rule.window === ruleToRemove.window)
      )
    }));
  }

  async function saveFocusRules(): Promise<void> {
    setSavingRules(true);
    setSaveLabel("Saving...");

    try {
      const response = await fetch(getApiUrl("/focus-rules"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(focusRules)
      });

      if (!response.ok) {
        throw new Error("Failed to save focus rules");
      }

      const data = normalizeFocusRules((await response.json()) as Partial<FocusRules>);
      setFocusRules(data);
      setSaveLabel("Saved");
      window.setTimeout(() => setSaveLabel("Save blocking rules"), 1200);
    } finally {
      setSavingRules(false);
    }
  }

  async function testFocusRules(): Promise<void> {
    const trimmedUrl = testUrlInput.trim();
    if (!trimmedUrl) {
      setTestError("Enter a website URL or domain first.");
      setTestResult(null);
      return;
    }

    setIsTestingRules(true);
    setTestError(null);

    try {
      const response = await fetch(getApiUrl("/focus-rules/test"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: trimmedUrl,
          focusRules
        })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Failed to test website");
      }

      const data = (await response.json()) as FocusRulesTestResult;
      setTestResult(data);
    } catch (error) {
      setTestError(error instanceof Error ? error.message : "Failed to test website");
      setTestResult(null);
    } finally {
      setIsTestingRules(false);
    }
  }

  function getTestExplanation(result: FocusRulesTestResult): string {
    if (result.blockedByDomain) {
      return `Matched blocked domain ${result.matchedBlockedDomain}`;
    }

    if (result.blockedByCategory && result.matchedBlockedCategory) {
      return `Matched blocked category ${CATEGORY_LABELS[result.matchedBlockedCategory]}`;
    }

    if (result.blockedByDomainTimer && result.matchedDomainTimerRule) {
      return `${result.matchedDomainTimerRule.domain} exceeded the ${WINDOW_LABELS[result.matchedDomainTimerRule.window].toLowerCase()} limit of ${formatLimitMinutes(result.matchedDomainTimerRule.limitMinutes)}`;
    }

    if (result.blockedByCategoryTimer && result.matchedCategoryTimerRule) {
      return `${CATEGORY_LABELS[result.matchedCategoryTimerRule.category]} exceeded the ${WINDOW_LABELS[result.matchedCategoryTimerRule.window].toLowerCase()} limit of ${formatLimitMinutes(result.matchedCategoryTimerRule.limitMinutes)}`;
    }

    return "No blocking rule matched";
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex flex-wrap items-center gap-3">
          <GlassButton onClick={onBack} size="sm" contentClassName="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </GlassButton>
          <GlassButton onClick={() => void saveFocusRules()} size="sm">
            {savingRules ? "Saving..." : saveLabel}
          </GlassButton>
        </div>

        <div className="mb-8">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-zinc-500">Focus Controls</p>
          <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">Manage your blocking rules</h1>
          <p className="mt-3 max-w-3xl text-base text-zinc-400">
            Block exact websites, block whole categories, or set time limits that reset every day, every week, or never.
          </p>
        </div>

        <section className="rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">Instant Blocks</p>
            <h2 className="text-2xl font-semibold text-white">Block immediately</h2>
            <p className="text-sm text-zinc-400">Use this for websites and categories you never want to open at all.</p>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
              <h3 className="text-lg font-semibold text-white">Website</h3>
              <p className="mt-1 text-sm text-zinc-400">Add an exact website like `youtube.com`.</p>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <input
                  value={blockedDomainInput}
                  onChange={(event) => setBlockedDomainInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addBlockedDomain();
                    }
                  }}
                  placeholder="example.com"
                  className="min-w-0 flex-1 rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500"
                />
                <GlassButton onClick={addBlockedDomain} size="sm">
                  Add website
                </GlassButton>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
              <h3 className="text-lg font-semibold text-white">Category</h3>
              <p className="mt-1 text-sm text-zinc-400">Block an entire category instantly.</p>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <select
                  value={selectedCategory}
                  onChange={(event) => setSelectedCategory(event.target.value as NormalizedCategory | "")}
                  className="min-w-0 flex-1 rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
                >
                  <option value="">Select a category to block</option>
                  {availableBlockedCategories.map((category) => (
                    <option key={category} value={category}>
                      {CATEGORY_LABELS[category]}
                    </option>
                  ))}
                </select>
                <GlassButton onClick={addBlockedCategory} size="sm">
                  Add category
                </GlassButton>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Blocked websites</p>
              <div className="flex min-h-16 flex-wrap gap-3 rounded-3xl border border-white/10 bg-black/20 p-4">
                {focusRules.blockedDomains.length === 0 ? <p className="text-sm text-zinc-500">No blocked websites yet.</p> : null}
                {focusRules.blockedDomains.map((domain) => (
                  <button
                    key={domain}
                    onClick={() => removeBlockedDomain(domain)}
                    className="rounded-full border border-white/12 bg-white/8 px-3 py-2 text-sm text-zinc-100 transition hover:bg-white/12"
                  >
                    {domain} x
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Blocked categories</p>
              <div className="flex min-h-16 flex-wrap gap-3 rounded-3xl border border-white/10 bg-black/20 p-4">
                {focusRules.blockedCategories.length === 0 ? <p className="text-sm text-zinc-500">No blocked categories yet.</p> : null}
                {focusRules.blockedCategories.map((category) => (
                  <button
                    key={category}
                    onClick={() => removeBlockedCategory(category)}
                    className="rounded-full border border-white/12 bg-white/8 px-3 py-2 text-sm text-zinc-100 transition hover:bg-white/12"
                  >
                    {CATEGORY_LABELS[category]} x
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">Time Limits</p>
            <h2 className="text-2xl font-semibold text-white">Block after some usage</h2>
            <p className="text-sm text-zinc-400">Set time caps for either a website or a full category. Limits can reset every day, every week, or never.</p>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
              <h3 className="text-lg font-semibold text-white">Website timer</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-[1.15fr_0.55fr_0.7fr_0.85fr_auto]">
                <input
                  value={domainTimerInput}
                  onChange={(event) => setDomainTimerInput(event.target.value)}
                  placeholder="youtube.com"
                  className="min-w-0 rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500"
                />
                <input
                  value={domainTimerAmountInput}
                  onChange={(event) => setDomainTimerAmountInput(event.target.value)}
                  inputMode="numeric"
                  placeholder="1"
                  className="min-w-0 rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500"
                />
                <select
                  value={domainTimerUnit}
                  onChange={(event) => setDomainTimerUnit(event.target.value as TimerInputUnit)}
                  className="min-w-0 rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
                >
                  <option value="hours">Hours</option>
                  <option value="minutes">Minutes</option>
                </select>
                <select
                  value={domainTimerWindow}
                  onChange={(event) => setDomainTimerWindow(event.target.value as TimerRuleWindow)}
                  className="min-w-0 rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
                >
                  <option value="day">1 day</option>
                  <option value="week">1 week</option>
                  <option value="forever">Forever</option>
                </select>
                <GlassButton onClick={addDomainTimerRule} size="sm">
                  Add
                </GlassButton>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
              <h3 className="text-lg font-semibold text-white">Category timer</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-[1.05fr_0.55fr_0.7fr_0.85fr_auto]">
                <select
                  value={categoryTimerCategory}
                  onChange={(event) => setCategoryTimerCategory(event.target.value as NormalizedCategory | "")}
                  className="min-w-0 rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
                >
                  <option value="">Select a category</option>
                  {(Object.keys(CATEGORY_LABELS) as NormalizedCategory[]).map((category) => (
                    <option key={category} value={category}>
                      {CATEGORY_LABELS[category]}
                    </option>
                  ))}
                </select>
                <input
                  value={categoryTimerAmountInput}
                  onChange={(event) => setCategoryTimerAmountInput(event.target.value)}
                  inputMode="numeric"
                  placeholder="1"
                  className="min-w-0 rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500"
                />
                <select
                  value={categoryTimerUnit}
                  onChange={(event) => setCategoryTimerUnit(event.target.value as TimerInputUnit)}
                  className="min-w-0 rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
                >
                  <option value="hours">Hours</option>
                  <option value="minutes">Minutes</option>
                </select>
                <select
                  value={categoryTimerWindow}
                  onChange={(event) => setCategoryTimerWindow(event.target.value as TimerRuleWindow)}
                  className="min-w-0 rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
                >
                  <option value="day">1 day</option>
                  <option value="week">1 week</option>
                  <option value="forever">Forever</option>
                </select>
                <GlassButton onClick={addCategoryTimerRule} size="sm">
                  Add
                </GlassButton>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Website timers</p>
              <div className="flex min-h-16 flex-wrap gap-3 rounded-3xl border border-white/10 bg-black/20 p-4">
                {focusRules.domainTimerRules.length === 0 ? <p className="text-sm text-zinc-500">No website timers yet.</p> : null}
                {focusRules.domainTimerRules.map((rule) => (
                  <button
                    key={`${rule.domain}:${rule.window}`}
                    onClick={() => removeDomainTimerRule(rule)}
                    className="rounded-full border border-white/12 bg-white/8 px-3 py-2 text-sm text-zinc-100 transition hover:bg-white/12"
                  >
                    {rule.domain} · {formatLimitMinutes(rule.limitMinutes)} · {WINDOW_LABELS[rule.window]} x
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Category timers</p>
              <div className="flex min-h-16 flex-wrap gap-3 rounded-3xl border border-white/10 bg-black/20 p-4">
                {focusRules.categoryTimerRules.length === 0 ? <p className="text-sm text-zinc-500">No category timers yet.</p> : null}
                {focusRules.categoryTimerRules.map((rule) => (
                  <button
                    key={`${rule.category}:${rule.window}`}
                    onClick={() => removeCategoryTimerRule(rule)}
                    className="rounded-full border border-white/12 bg-white/8 px-3 py-2 text-sm text-zinc-100 transition hover:bg-white/12"
                  >
                    {CATEGORY_LABELS[rule.category]} · {formatLimitMinutes(rule.limitMinutes)} · {WINDOW_LABELS[rule.window]} x
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">Rule Tester</p>
            <h2 className="text-2xl font-semibold text-white">Check one website</h2>
            <p className="text-sm text-zinc-400">Paste a URL or domain to see whether your current rules would block it and exactly why.</p>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <input
              value={testUrlInput}
              onChange={(event) => setTestUrlInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void testFocusRules();
                }
              }}
              placeholder="https://m.youtube.com or example.com"
              className="min-w-0 flex-1 rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500"
            />
            <GlassButton onClick={() => void testFocusRules()} size="sm">
              {isTestingRules ? "Testing..." : "Test website"}
            </GlassButton>
          </div>

          {testError ? <p className="mt-4 text-sm text-red-300">{testError}</p> : null}

          {testResult ? (
            <div className="mt-5 rounded-[1.5rem] border border-white/10 bg-black/20 p-5">
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={
                    testResult.blocked
                      ? "rounded-full border border-red-400/20 bg-red-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-red-200"
                      : "rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200"
                  }
                >
                  {testResult.blocked ? "Blocked" : "Allowed"}
                </span>
                <p className="text-sm text-zinc-400">{getTestExplanation(testResult)}</p>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Normalized domain</p>
                  <p className="mt-2 text-sm text-white">{testResult.normalizedDomain ?? "None"}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Matched classification domain</p>
                  <p className="mt-2 text-sm text-white">{testResult.matchedClassificationDomain ?? "None"}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Raw category</p>
                  <p className="mt-2 text-sm text-white">{testResult.rawCategory ?? "None"}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Normalized category</p>
                  <p className="mt-2 text-sm text-white">
                    {testResult.normalizedCategory ? CATEGORY_LABELS[testResult.normalizedCategory] : "Uncategorized"}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Blocked by domain</p>
                  <p className="mt-2 text-sm text-white">{testResult.blockedByDomain ? "Yes" : "No"}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Blocked by category</p>
                  <p className="mt-2 text-sm text-white">{testResult.blockedByCategory ? "Yes" : "No"}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Website timer triggered</p>
                  <p className="mt-2 text-sm text-white">
                    {testResult.matchedDomainTimerRule
                      ? `${formatLimitMinutes(testResult.matchedDomainTimerRule.limitMinutes)} / ${WINDOW_LABELS[testResult.matchedDomainTimerRule.window]}`
                      : "No"}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Category timer triggered</p>
                  <p className="mt-2 text-sm text-white">
                    {testResult.matchedCategoryTimerRule
                      ? `${formatLimitMinutes(testResult.matchedCategoryTimerRule.limitMinutes)} / ${WINDOW_LABELS[testResult.matchedCategoryTimerRule.window]}`
                      : "No"}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Website usage in matched timer window</p>
                  <p className="mt-2 text-sm text-white">{Math.floor(testResult.domainUsageMs / 60000)} minutes</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Category usage in matched timer window</p>
                  <p className="mt-2 text-sm text-white">{Math.floor(testResult.categoryUsageMs / 60000)} minutes</p>
                </div>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
