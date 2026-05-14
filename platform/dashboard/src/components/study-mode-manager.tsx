import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import DashboardBeamsShell from "@/components/ui/dashboard-beams-shell";
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

const FIXED_STUDY_CATEGORIES: NormalizedCategory[] = ["health", "learning", "work"];
const FIXED_STUDY_EXCEPTIONS = ["youtube.com", ".edu websites"];

function normalizeDomainInput(value: string): string {
  return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
}

function normalizeFocusRules(input: Partial<FocusRules> | null | undefined): FocusRules {
  return {
    blockedDomains: Array.isArray(input?.blockedDomains) ? input.blockedDomains : [],
    blockedCategories: Array.isArray(input?.blockedCategories) ? input.blockedCategories : [],
    domainTimerRules: Array.isArray(input?.domainTimerRules) ? input.domainTimerRules : [],
    categoryTimerRules: Array.isArray(input?.categoryTimerRules) ? input.categoryTimerRules : [],
    studyMode: {
      enabled: Boolean(input?.studyMode?.enabled),
      allowedDomains: Array.isArray(input?.studyMode?.allowedDomains) ? input.studyMode.allowedDomains : [],
      allowedCategories: FIXED_STUDY_CATEGORIES
    }
  };
}

interface StudyModeManagerProps {
  onBack: () => void;
}

export default function StudyModeManager({ onBack }: StudyModeManagerProps) {
  const [focusRules, setFocusRules] = useState<FocusRules>(DEFAULT_FOCUS_RULES);
  const [allowedDomainInput, setAllowedDomainInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveLabel, setSaveLabel] = useState("Save study mode");

  useEffect(() => {
    let cancelled = false;

    async function loadRules() {
      try {
        const response = await fetch(getApiUrl("/focus-rules"));
        if (!response.ok) {
          throw new Error("Failed to load rules");
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

    void loadRules();

    function handleWindowFocus(): void {
      void loadRules();
    }

    function handleVisibilityChange(): void {
      if (document.visibilityState === "visible") {
        void loadRules();
      }
    }

    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  function toggleStudyMode(): void {
    setFocusRules((current) => ({
      ...current,
      studyMode: {
        ...current.studyMode,
        enabled: !current.studyMode.enabled,
        allowedCategories: FIXED_STUDY_CATEGORIES
      }
    }));
  }

  function addAllowedDomain(): void {
    const domain = normalizeDomainInput(allowedDomainInput);
    if (!domain) {
      return;
    }

    setFocusRules((current) => ({
      ...current,
      studyMode: {
        ...current.studyMode,
        allowedDomains: Array.from(new Set([...current.studyMode.allowedDomains, domain])).sort()
      }
    }));
    setAllowedDomainInput("");
  }

  function removeAllowedDomain(domain: string): void {
    setFocusRules((current) => ({
      ...current,
      studyMode: {
        ...current.studyMode,
        allowedDomains: current.studyMode.allowedDomains.filter((item) => item !== domain)
      }
    }));
  }

  async function saveRules(): Promise<void> {
    setSaving(true);
    setSaveLabel("Saving...");

    try {
      const payload: FocusRules = {
        ...focusRules,
        studyMode: {
          ...focusRules.studyMode,
          allowedCategories: FIXED_STUDY_CATEGORIES
        }
      };

      const response = await fetch(getApiUrl("/focus-rules"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error("Failed to save rules");
      }

      const data = normalizeFocusRules((await response.json()) as Partial<FocusRules>);
      setFocusRules(data);
      setSaveLabel("Saved");
      window.setTimeout(() => setSaveLabel("Save study mode"), 1200);
    } finally {
      setSaving(false);
    }
  }

  return (
    <DashboardBeamsShell>
      <main className="mx-auto max-w-5xl">
        <div className="mb-8 flex flex-wrap items-center gap-3">
          <GlassButton onClick={onBack} size="sm" contentClassName="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </GlassButton>
          <GlassButton onClick={() => void saveRules()} size="sm">
            {saving ? "Saving..." : saveLabel}
          </GlassButton>
        </div>

        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-zinc-500">Study Mode</p>
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">Lock the browser down for study</h1>
            <p className="mt-3 max-w-3xl text-base text-zinc-400">
              When study mode is on, only study-safe categories stay open: health, learning, and work. Everything else is blocked
              immediately, there is no bypass, blocked tabs close after 5 seconds, and YouTube plus .edu websites stay allowed as
              built-in study exceptions.
            </p>
          </div>
          <GlassButton onClick={toggleStudyMode} size="sm">
            {focusRules.studyMode.enabled ? "Study mode: On" : "Study mode: Off"}
          </GlassButton>
        </div>

        <section className="rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">Allowed Only</p>
            <h2 className="text-2xl font-semibold text-white">Choose what stays open</h2>
            <p className="text-sm text-zinc-400">Everything not listed here will be treated as unnecessary during study mode.</p>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
              <h3 className="text-lg font-semibold text-white">Allowed websites</h3>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <input
                  value={allowedDomainInput}
                  onChange={(event) => setAllowedDomainInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addAllowedDomain();
                    }
                  }}
                  placeholder="docs.google.com"
                  className="min-w-0 flex-1 rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500"
                />
                <GlassButton onClick={addAllowedDomain} size="sm">
                  Add website
                </GlassButton>
              </div>

              <div className="mt-4 flex min-h-16 flex-wrap gap-3 rounded-3xl border border-white/10 bg-white/5 p-4">
                {focusRules.studyMode.allowedDomains.length === 0 ? <p className="text-sm text-zinc-500">No allowed websites yet.</p> : null}
                {focusRules.studyMode.allowedDomains.map((domain) => (
                  <button
                    key={domain}
                    onClick={() => removeAllowedDomain(domain)}
                    className="rounded-full border border-white/12 bg-white/8 px-3 py-2 text-sm text-zinc-100 transition hover:bg-white/12"
                  >
                    {domain} x
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
              <h3 className="text-lg font-semibold text-white">Fixed study categories</h3>
              <p className="mt-4 text-sm text-zinc-400">
                Study mode always allows only the built-in study-safe categories and does not let users open up extra categories.
              </p>
              <div className="mt-4 flex min-h-16 flex-wrap gap-3 rounded-3xl border border-white/10 bg-white/5 p-4">
                {FIXED_STUDY_CATEGORIES.map((category) => (
                  <span
                    key={category}
                    className="rounded-full border border-white/12 bg-white/8 px-3 py-2 text-sm text-zinc-100"
                  >
                    {CATEGORY_LABELS[category]}
                  </span>
                ))}
              </div>

              <h4 className="mt-5 text-sm font-semibold text-white">Built-in exceptions</h4>
              <div className="mt-3 flex min-h-16 flex-wrap gap-3 rounded-3xl border border-white/10 bg-white/5 p-4">
                {FIXED_STUDY_EXCEPTIONS.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-white/12 bg-white/8 px-3 py-2 text-sm text-zinc-100"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
    </DashboardBeamsShell>
  );
}
