import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { GlassButton } from "@/components/ui/glass-button";
import { getApiUrl } from "@/lib/api";
import type { NormalizedCategory } from "@/types/activity";
import { DEFAULT_FOCUS_RULES, type FocusRules } from "@/types/focus-rules";

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

function normalizeDomainInput(value: string): string {
  return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
}

interface FocusRulesManagerProps {
  onBack: () => void;
}

export default function FocusRulesManager({ onBack }: FocusRulesManagerProps) {
  const [focusRules, setFocusRules] = useState<FocusRules>(DEFAULT_FOCUS_RULES);
  const [blockedDomainInput, setBlockedDomainInput] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<NormalizedCategory | "">("");
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

        const data = (await response.json()) as FocusRules;
        if (!cancelled) {
          setFocusRules({
            blockedDomains: Array.isArray(data.blockedDomains) ? data.blockedDomains : [],
            blockedCategories: Array.isArray(data.blockedCategories) ? data.blockedCategories : []
          });
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

  const availableCategories = useMemo(
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

      const data = (await response.json()) as FocusRules;
      setFocusRules({
        blockedDomains: Array.isArray(data.blockedDomains) ? data.blockedDomains : [],
        blockedCategories: Array.isArray(data.blockedCategories) ? data.blockedCategories : []
      });
      setSaveLabel("Saved");
      window.setTimeout(() => setSaveLabel("Save blocking rules"), 1200);
    } finally {
      setSavingRules(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex flex-wrap items-center gap-3">
          <GlassButton onClick={onBack} size="sm" contentClassName="flex items-center gap-2 text-zinc-100">
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </GlassButton>
          <GlassButton onClick={() => void saveFocusRules()} size="sm" contentClassName="text-zinc-100">
            {savingRules ? "Saving..." : saveLabel}
          </GlassButton>
        </div>

        <div className="mb-8">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-zinc-500">Focus Controls</p>
          <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">Manage your blocking rules</h1>
          <p className="mt-3 max-w-3xl text-base text-zinc-400">
            Pick categories you want to block, add exact websites you never want to enter, and remove either one any time.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <section className="rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
            <h2 className="text-xl font-semibold text-white">Blocked categories</h2>
            <p className="mt-2 text-sm text-zinc-400">Choose a category from the list, add it, and manage blocked categories below.</p>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <select
                value={selectedCategory}
                onChange={(event) => setSelectedCategory(event.target.value as NormalizedCategory | "")}
                className="min-w-0 flex-1 rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
              >
                <option value="">Select a category to block</option>
                {availableCategories.map((category) => (
                  <option key={category} value={category}>
                    {CATEGORY_LABELS[category]}
                  </option>
                ))}
              </select>
              <GlassButton onClick={addBlockedCategory} size="sm" contentClassName="text-zinc-100">
                Add category
              </GlassButton>
            </div>

            <div className="mt-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Currently blocked</p>
              <div className="flex max-h-56 flex-wrap gap-3 overflow-y-auto pr-1">
                {focusRules.blockedCategories.length === 0 ? (
                  <p className="text-sm text-zinc-500">No blocked categories yet.</p>
                ) : null}
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
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
            <h2 className="text-xl font-semibold text-white">Blocked websites</h2>
            <p className="mt-2 text-sm text-zinc-400">Add as many exact websites as you want. Remove any blocked website from the list below.</p>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
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
              <GlassButton onClick={addBlockedDomain} size="sm" contentClassName="text-zinc-100">
                Add website
              </GlassButton>
            </div>

            <div className="mt-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Currently blocked</p>
              <div className="flex max-h-56 flex-wrap gap-3 overflow-y-auto pr-1">
                {focusRules.blockedDomains.length === 0 ? (
                  <p className="text-sm text-zinc-500">No blocked websites yet.</p>
                ) : null}
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
          </section>
        </div>
      </div>
    </main>
  );
}
