"use client";

import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";
import { TrendingDown, TrendingUp } from "lucide-react";

import type { NormalizedCategory, TimelineDomainImpact, TimelinePeriod, TimelineSummary } from "@/types/activity";
import { getApiUrl } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GlassButton } from "@/components/ui/glass-button";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/line-chart";

const chartConfig = {
  score: {
    label: "Net Bloom",
    color: "var(--chart-2)"
  }
} satisfies ChartConfig;

const EMPTY_TIMELINE: TimelineSummary = {
  period: "day",
  points: [],
  netScore: 0,
  bloomMinutes: 0,
  doomMinutes: 0,
  neutralMinutes: 0
};

interface BloomTrendChartProps {
  activeCategory: NormalizedCategory | "all";
  refreshKey: number;
}

function DomainImpactList({
  title,
  impacts,
  tone
}: {
  title: string;
  impacts: TimelineDomainImpact[];
  tone: "bloom" | "doom";
}) {
  if (impacts.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">{title}</div>
      <div className="space-y-2">
        {impacts.map((impact) => (
          <div key={impact.domain} className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="truncate text-sm text-white">{impact.title}</div>
              <div className="truncate text-xs text-zinc-500">{impact.domain}</div>
            </div>
            <div className="shrink-0 text-right">
              <div className={tone === "bloom" ? "text-emerald-300" : "text-rose-300"}>
                {impact.delta >= 0 ? "+" : ""}
                {impact.delta.toFixed(1)}
              </div>
              <div className="text-xs text-zinc-500">{impact.minutes}m</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatTrendLabel(activeCategory: NormalizedCategory | "all") {
  if (activeCategory === "all") {
    return "all categories";
  }

  return activeCategory;
}

function getTimelineTitle(period: TimelinePeriod) {
  return period === "week" ? "7-day trend" : "Live day trend";
}

function getTimelineDescription(period: TimelinePeriod, activeCategory: NormalizedCategory | "all") {
  const categoryLabel = formatTrendLabel(activeCategory);
  if (period === "week") {
    return `Rolling week view for ${categoryLabel}. The score continues across days so tomorrow picks up from today's history.`;
  }

  return `Live view for ${categoryLabel}. Bloom pushes the line up, doom pulls it down, and neutral time stays flat.`;
}

export default function BloomTrendChart({
  activeCategory,
  refreshKey
}: BloomTrendChartProps) {
  const [period, setPeriod] = useState<TimelinePeriod>("day");
  const [timeline, setTimeline] = useState<TimelineSummary>(EMPTY_TIMELINE);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("loading");
  const [pollTick, setPollTick] = useState(0);
  const [selectedBucketStart, setSelectedBucketStart] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadTimeline() {
      setStatus("loading");

      try {
        const params = new URLSearchParams({ period });
        if (activeCategory !== "all") {
          params.set("category", activeCategory);
        }

        const response = await fetch(getApiUrl(`/summary/timeline?${params.toString()}`));
        if (!response.ok) {
          throw new Error("Failed to load timeline");
        }

        const data = (await response.json()) as TimelineSummary;
        if (!cancelled) {
          setTimeline(data);
          setSelectedBucketStart((current) =>
            current && data.points.some((point) => point.bucketStart === current)
              ? current
              : data.points.length > 0
                ? data.points[data.points.length - 1].bucketStart
                : null
          );
          setStatus("idle");
        }
      } catch {
        if (!cancelled) {
          setTimeline({ ...EMPTY_TIMELINE, period });
          setSelectedBucketStart(null);
          setStatus("error");
        }
      }
    }

    void loadTimeline();

    return () => {
      cancelled = true;
    };
  }, [activeCategory, period, refreshKey, pollTick]);

  useEffect(() => {
    if (period !== "day") {
      return;
    }

    const intervalId = window.setInterval(() => {
      setPollTick((current) => current + 1);
    }, 30000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [period]);

  const netScore = timeline.netScore;
  const netTone =
    netScore > 0
      ? "text-emerald-300 bg-emerald-500/10"
      : netScore < 0
        ? "text-rose-300 bg-rose-500/10"
        : "text-zinc-300 bg-white/10";
  const isEmpty = timeline.points.length === 0;
  const chartData = useMemo(() => timeline.points, [timeline.points]);
  const selectedPoint =
    chartData.find((point) => point.bucketStart === selectedBucketStart) ??
    (chartData.length > 0 ? chartData[chartData.length - 1] : null);

  return (
    <Card className="mb-8 overflow-hidden rounded-[2rem] border-white/10 bg-white/5 shadow-none backdrop-blur-xl">
      <CardHeader className="border-b border-white/8 pb-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <CardTitle className="flex flex-wrap items-center gap-3 text-white">
              Doom vs Bloom trend
              <Badge variant="outline" className={`border-none ${netTone}`}>
                {netScore >= 0 ? <TrendingUp className="mr-1 h-4 w-4" /> : <TrendingDown className="mr-1 h-4 w-4" />}
                <span>
                  {netScore >= 0 ? "+" : ""}
                  {netScore.toFixed(1)}
                </span>
              </Badge>
            </CardTitle>
            <CardDescription className="mt-2 text-zinc-400">
              {getTimelineDescription(period, activeCategory)}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <GlassButton
              size="sm"
              onClick={() => setPeriod("day")}
              className={period === "day" ? "ring-1 ring-white/30" : "border-white/10 bg-black/20 text-white hover:bg-black/30"}
              contentClassName={period === "day" ? undefined : "text-white"}
            >
              Live day
            </GlassButton>
            <GlassButton
              size="sm"
              onClick={() => setPeriod("week")}
              className={period === "week" ? "ring-1 ring-white/30" : "border-white/10 bg-black/20 text-white hover:bg-black/30"}
              contentClassName={period === "week" ? undefined : "text-white"}
            >
              7 days
            </GlassButton>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-zinc-300">
          <Badge variant="outline" className="border-emerald-400/20 bg-emerald-500/10 text-emerald-200">
            Bloom {timeline.bloomMinutes}m
          </Badge>
          <Badge variant="outline" className="border-rose-400/20 bg-rose-500/10 text-rose-200">
            Doom {timeline.doomMinutes}m
          </Badge>
          <Badge variant="outline" className="border-white/10 bg-white/5 text-zinc-300">
            Neutral {timeline.neutralMinutes}m
          </Badge>
          <Badge variant="outline" className="border-white/10 bg-white/5 text-zinc-300">
            {getTimelineTitle(period)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-6">
        {status === "loading" && isEmpty ? (
          <div className="flex min-h-[18rem] items-center justify-center rounded-[1.5rem] border border-dashed border-white/10 bg-black/10 text-sm text-zinc-400">
            Loading score timeline...
          </div>
        ) : null}
        {status === "error" && isEmpty ? (
          <div className="flex min-h-[18rem] items-center justify-center rounded-[1.5rem] border border-dashed border-white/10 bg-black/10 text-sm text-red-300">
            Could not load the timeline. Make sure the backend is running.
          </div>
        ) : null}
        {status !== "loading" && status !== "error" && isEmpty ? (
          <div className="flex min-h-[18rem] items-center justify-center rounded-[1.5rem] border border-dashed border-white/10 bg-black/10 text-sm text-zinc-400">
            No scored activity yet. The live view will update through the day, and the 7-day view will carry the score across days.
          </div>
        ) : null}
        {!isEmpty ? (
          <ChartContainer config={chartConfig} className="min-h-[18rem] w-full">
            <LineChart
              accessibilityLayer
              data={chartData}
              onClick={(state: any) => {
                const point = state?.activePayload?.[0]?.payload as TimelineSummary["points"][number] | undefined;
                if (point) {
                  setSelectedBucketStart(point.bucketStart);
                }
              }}
              margin={{
                left: 12,
                right: 12,
                top: 18
              }}
            >
              <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.08)" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={period === "week" ? 8 : 24}
              />
              <YAxis tickLine={false} axisLine={false} tickMargin={8} width={40} />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.12)" />
              <ChartTooltip
                cursor={false}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) {
                    return null;
                  }

                  const point = payload[0]?.payload as TimelineSummary["points"][number] | undefined;
                  if (!point) {
                    return null;
                  }

                  return (
                    <div className="min-w-[18rem] rounded-lg border border-white/10 bg-zinc-950/95 px-3 py-3 text-xs shadow-2xl backdrop-blur-xl">
                      <div className="mb-3 flex items-center justify-between gap-4">
                        <span className="text-zinc-400">{point.label}</span>
                        <span className="font-mono text-sm text-white">
                          {point.score >= 0 ? "+" : ""}
                          {point.score.toFixed(1)}
                        </span>
                      </div>
                      <div className="mb-3 flex items-center justify-between gap-4 text-zinc-400">
                        <span>Delta</span>
                        <span>
                          {point.delta >= 0 ? "+" : ""}
                          {point.delta.toFixed(1)}
                        </span>
                      </div>
                      <div className="space-y-3">
                        <DomainImpactList title="Raised by" impacts={point.bloomDomains} tone="bloom" />
                        <DomainImpactList title="Pulled down by" impacts={point.doomDomains} tone="doom" />
                        {point.bloomDomains.length === 0 && point.doomDomains.length === 0 ? (
                          <div className="text-zinc-500">Neutral bucket. No site changed the score here.</div>
                        ) : null}
                      </div>
                    </div>
                  );
                }}
              />
              <Line
                dataKey="score"
                type="bump"
                stroke="url(#bloom-doom-gradient)"
                dot={false}
                strokeWidth={3}
                filter="url(#bloom-doom-glow)"
              />
              <defs>
                <linearGradient id="bloom-doom-gradient" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.9} />
                  <stop offset="35%" stopColor="#38bdf8" stopOpacity={0.9} />
                  <stop offset="65%" stopColor="#facc15" stopOpacity={0.85} />
                  <stop offset="100%" stopColor="#f97316" stopOpacity={0.9} />
                </linearGradient>
                <filter id="bloom-doom-glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="10" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>
            </LineChart>
          </ChartContainer>
        ) : null}
        {selectedPoint ? (
          <div className="mt-4 rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-white">Selected point: {selectedPoint.label}</div>
                <div className="text-xs text-zinc-500">
                  Net {selectedPoint.score >= 0 ? "+" : ""}
                  {selectedPoint.score.toFixed(1)} | Delta {selectedPoint.delta >= 0 ? "+" : ""}
                  {selectedPoint.delta.toFixed(1)}
                </div>
              </div>
              <div className="text-xs text-zinc-500">Click any rise or dip in the chart to inspect it.</div>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-emerald-400/10 bg-emerald-500/5 p-4">
                <div className="mb-3 text-xs uppercase tracking-[0.18em] text-emerald-300">Bloom sources</div>
                <DomainImpactList title="Raised by" impacts={selectedPoint.bloomDomains} tone="bloom" />
                {selectedPoint.bloomDomains.length === 0 ? (
                  <div className="text-sm text-zinc-500">Nothing pushed the score up in this bucket.</div>
                ) : null}
              </div>
              <div className="rounded-2xl border border-rose-400/10 bg-rose-500/5 p-4">
                <div className="mb-3 text-xs uppercase tracking-[0.18em] text-rose-300">Doom sources</div>
                <DomainImpactList title="Pulled down by" impacts={selectedPoint.doomDomains} tone="doom" />
                {selectedPoint.doomDomains.length === 0 ? (
                  <div className="text-sm text-zinc-500">Nothing pulled the score down in this bucket.</div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
