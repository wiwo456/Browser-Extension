import { useEffect, useState } from "react";
import { ArrowLeft, Clock3, Globe, RotateCcw, TimerReset } from "lucide-react";
import type { ActivityRecord, DailySummary, NormalizedCategory } from "@/types/activity";
import { GlassButton } from "@/components/ui/glass-button";
import { getApiUrl } from "@/lib/api";
import { formatDuration } from "@/lib/format";

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

const CATEGORY_TONES: Record<NormalizedCategory, string> = {
  adult: "border-red-400/20 bg-red-400/10 text-red-200",
  entertainment: "border-amber-400/20 bg-amber-400/10 text-amber-200",
  gaming: "border-fuchsia-400/20 bg-fuchsia-400/10 text-fuchsia-200",
  health: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
  learning: "border-sky-400/20 bg-sky-400/10 text-sky-200",
  news: "border-cyan-400/20 bg-cyan-400/10 text-cyan-200",
  other: "border-zinc-400/20 bg-zinc-400/10 text-zinc-200",
  shopping: "border-pink-400/20 bg-pink-400/10 text-pink-200",
  social: "border-violet-400/20 bg-violet-400/10 text-violet-200",
  work: "border-white/15 bg-white/10 text-white"
};

const EMPTY_SUMMARY: DailySummary = {
  totalMs: 0,
  topSites: [],
  topCategories: [],
  activities: []
};

function normalizeSummary(data: Partial<DailySummary> | null | undefined): DailySummary {
  return {
    totalMs: data?.totalMs ?? 0,
    topSites: Array.isArray(data?.topSites) ? data.topSites : [],
    topCategories: Array.isArray(data?.topCategories) ? data.topCategories : [],
    activities: Array.isArray(data?.activities) ? data.activities : []
  };
}

function formatCategoryLabel(category?: NormalizedCategory | null): string {
  if (!category) {
    return "Uncategorized";
  }

  return CATEGORY_LABELS[category];
}

function getCategoryTone(category?: NormalizedCategory | null): string {
  if (!category) {
    return "border-zinc-500/20 bg-zinc-500/10 text-zinc-300";
  }

  return CATEGORY_TONES[category];
}

interface GroupedActivity {
  key: string;
  domain: string;
  title: string;
  url: string;
  normalizedCategory?: NormalizedCategory | null;
  visits: number;
  totalMs: number;
  averageMs: number;
  lastStartedAt: string;
  lastState: ActivityRecord["state"];
}

function buildGroupedActivities(activities: ActivityRecord[]): GroupedActivity[] {
  const groups = new Map<string, GroupedActivity>();

  for (const activity of activities) {
    const key = activity.domain;
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, {
        key,
        domain: activity.domain,
        title: activity.title || activity.domain,
        url: activity.url,
        normalizedCategory: activity.normalizedCategory,
        visits: 1,
        totalMs: activity.durationMs,
        averageMs: activity.durationMs,
        lastStartedAt: activity.startedAt,
        lastState: activity.state
      });
      continue;
    }

    existing.visits += 1;
    existing.totalMs += activity.durationMs;
    existing.averageMs = Math.round(existing.totalMs / existing.visits);

    if (new Date(activity.startedAt).getTime() > new Date(existing.lastStartedAt).getTime()) {
      existing.title = activity.title || existing.title;
      existing.url = activity.url;
      existing.lastStartedAt = activity.startedAt;
      existing.lastState = activity.state;
      existing.normalizedCategory = activity.normalizedCategory ?? existing.normalizedCategory;
    }
  }

  return [...groups.values()].sort((a, b) => b.totalMs - a.totalMs);
}

interface DashboardRecordsProps {
  onBack: () => void;
  onOpenBlocking: () => void;
  onOpenStudyMode: () => void;
}

export default function DashboardRecords({ onBack, onOpenBlocking, onOpenStudyMode }: DashboardRecordsProps) {
  const [summary, setSummary] = useState<DailySummary>(EMPTY_SUMMARY);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("loading");
  const [activeCategory, setActiveCategory] = useState<NormalizedCategory | "all">("all");
  const [refreshTick, setRefreshTick] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const groupedActivities = buildGroupedActivities(summary.activities);

  useEffect(() => {
    let cancelled = false;

    async function loadSummary() {
      setStatus("loading");
      setIsRefreshing(true);

      try {
        const suffix = activeCategory === "all" ? "" : `?category=${activeCategory}`;
        const response = await fetch(getApiUrl(`/summary/today${suffix}`));
        if (!response.ok) {
          throw new Error("Failed to load records");
        }

        const data = normalizeSummary((await response.json()) as Partial<DailySummary>);
        if (!cancelled) {
          setSummary(data);
          setStatus("idle");
        }
      } catch {
        if (!cancelled) {
          setStatus("error");
        }
      } finally {
        if (!cancelled) {
          setIsRefreshing(false);
        }
      }
    }

    void loadSummary();

    return () => {
      cancelled = true;
    };
  }, [activeCategory, refreshTick]);

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-wrap items-center gap-3">
          <GlassButton onClick={onBack} size="sm" contentClassName="flex items-center gap-2 text-zinc-100">
            <ArrowLeft className="h-4 w-4" />
            Back
          </GlassButton>
          <GlassButton
            onClick={() => setRefreshTick((value) => value + 1)}
            size="sm"
            contentClassName="flex items-center gap-2 text-zinc-100"
          >
            <RotateCcw className="h-4 w-4" />
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </GlassButton>
          <div className="sm:ml-auto">
            <GlassButton onClick={onOpenStudyMode} size="sm">
              Study mode
            </GlassButton>
          </div>
        </div>

        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-zinc-500">Doom2Bloom Dashboard</p>
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">Your browsing records</h1>
            <p className="mt-3 max-w-2xl text-base text-zinc-400">
              Review the sites you visited today, how long they held your attention, and where your time actually went.
            </p>
          </div>
        </div>

        <section className="mb-8 rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <h2 className="text-xl font-semibold text-white">Blocking controls</h2>
              <p className="mt-2 text-sm leading-7 text-zinc-400">
                If you want, you can block full categories or exact websites. Open the blocking page to choose categories,
                add websites, and remove them any time.
              </p>
            </div>
            <GlassButton onClick={onOpenBlocking} size="sm" contentClassName="text-zinc-100">
              Open blocking options
            </GlassButton>
          </div>
        </section>

        <section className="mb-8 rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-white">Category filter</h2>
              <p className="mt-1 text-sm text-zinc-400">Focus the dashboard on one type of browsing at a time.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <GlassButton
              onClick={() => setActiveCategory("all")}
              size="sm"
              className={
                activeCategory === "all"
                  ? "ring-1 ring-white/30"
                  : undefined
              }
              contentClassName="text-white"
            >
              All categories
            </GlassButton>
            {summary.topCategories.map((category) => (
              <GlassButton
                key={category.normalizedCategory}
                onClick={() => setActiveCategory(category.normalizedCategory)}
                size="sm"
                className={
                  activeCategory === category.normalizedCategory
                    ? "ring-1 ring-white/30"
                    : undefined
                }
                contentClassName="text-white"
              >
                {formatCategoryLabel(category.normalizedCategory)}
              </GlassButton>
            ))}
          </div>
        </section>

        <div className="mb-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
            <Clock3 className="mb-4 h-5 w-5 text-zinc-300" />
            <div className="text-3xl font-semibold">{formatDuration(summary.totalMs)}</div>
            <div className="mt-2 text-sm text-zinc-400">Total tracked today</div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
            <Globe className="mb-4 h-5 w-5 text-zinc-300" />
            <div className="text-3xl font-semibold">{summary.topCategories.length}</div>
            <div className="mt-2 text-sm text-zinc-400">Categories detected</div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
            <TimerReset className="mb-4 h-5 w-5 text-zinc-300" />
            <div className="text-3xl font-semibold">{summary.activities.length}</div>
            <div className="mt-2 text-sm text-zinc-400">Tracked sessions</div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
            <h2 className="mb-5 text-xl font-semibold">Top categories today</h2>
            <div className="max-h-[32rem] space-y-3 overflow-y-auto pr-1">
              {summary.topCategories.length === 0 && status !== "loading" ? (
                <p className="text-sm text-zinc-400">No category data yet. Browse with the extension active to populate this view.</p>
              ) : null}
              {summary.topCategories.map((category) => (
                <div
                  key={category.normalizedCategory}
                  className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3"
                >
                  <div>
                    <div className="flex items-center gap-3">
                      <span className={`rounded-full border px-3 py-1 text-xs font-medium ${getCategoryTone(category.normalizedCategory)}`}>
                        {formatCategoryLabel(category.normalizedCategory)}
                      </span>
                    </div>
                    <div className="mt-2 text-sm text-zinc-500">{category.visits} visits</div>
                  </div>
                  <div className="text-sm font-medium text-zinc-200">{formatDuration(category.totalMs)}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
            <h2 className="mb-5 text-xl font-semibold">Site records</h2>
            {status === "loading" ? <p className="text-sm text-zinc-400">Loading records...</p> : null}
            {status === "error" ? (
              <p className="text-sm text-red-300">Could not load `/summary/today`. Make sure the backend is running.</p>
            ) : null}
            <div className="max-h-[32rem] space-y-3 overflow-y-auto pr-1">
              {groupedActivities.length === 0 && status === "idle" ? (
                <p className="text-sm text-zinc-400">No records yet for today.</p>
              ) : null}
              {groupedActivities.map((activity) => (
                <div
                  key={activity.key}
                  className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="truncate text-base font-medium text-white">{activity.title}</div>
                      <div className="truncate text-sm text-zinc-500">{activity.url}</div>
                    </div>
                    <div className="text-sm font-medium text-zinc-200">{formatDuration(activity.totalMs)}</div>
                  </div>
                  <div className="mt-3">
                    <span
                      className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${getCategoryTone(activity.normalizedCategory)}`}
                    >
                      {formatCategoryLabel(activity.normalizedCategory)}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-3 text-sm text-zinc-400 sm:grid-cols-3">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-zinc-500">Visits</div>
                      <div className="mt-1 text-zinc-200">{activity.visits}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide text-zinc-500">Average session</div>
                      <div className="mt-1 text-zinc-200">{formatDuration(activity.averageMs)}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide text-zinc-500">Last seen</div>
                      <div className="mt-1 text-zinc-200">
                        {new Date(activity.lastStartedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} {activity.lastState}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs uppercase tracking-wide text-zinc-500">
                    <span>{activity.domain}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
