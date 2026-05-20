import React, { useEffect, useState } from "react";
import {
  ArrowRight,
  Target,
  Crown,
  Star,
  Hexagon,
  Triangle,
  Command,
  Ghost,
  Gem,
  Cpu
} from "lucide-react";
import { GlassButton } from "@/components/ui/glass-button";
import { getApiUrl } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import type { DailySummary } from "@/types/activity";

const CLIENTS = [
  { name: "Chrome", icon: Hexagon },
  { name: "Focus Mode", icon: Triangle },
  { name: "Daily Limits", icon: Command },
  { name: "Calm Feed", icon: Ghost },
  { name: "Better Habits", icon: Gem },
  { name: "Live Tracking", icon: Cpu }
];

const StatItem = ({ value, label }: { value: string; label: string }) => (
  <div className="flex cursor-default flex-col items-center justify-center transition-transform hover:-translate-y-1">
    <span className="text-xl font-bold text-white sm:text-2xl">{value}</span>
    <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500 sm:text-xs">{label}</span>
  </div>
);

const EMPTY_SUMMARY: Pick<DailySummary, "lifetimeTotalMs"> = {
  lifetimeTotalMs: 0
};

interface HeroSectionProps {
  onOpenDashboard?: () => void;
}

export default function HeroSection({ onOpenDashboard }: HeroSectionProps) {
  const [summary, setSummary] = useState(EMPTY_SUMMARY);

  useEffect(() => {
    let cancelled = false;

    async function loadSummary() {
      try {
        const response = await fetch(getApiUrl("/summary/today"));
        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as Partial<DailySummary>;
        if (!cancelled) {
          setSummary({
            lifetimeTotalMs: data.lifetimeTotalMs ?? 0
          });
        }
      } catch {
        if (!cancelled) {
          setSummary(EMPTY_SUMMARY);
        }
      }
    }

    void loadSummary();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="relative w-full overflow-hidden bg-zinc-950 font-sans text-white">
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        .animate-fade-in {
          animation: fadeSlideIn 0.8s ease-out forwards;
          opacity: 0;
        }
        .animate-marquee {
          animation: marquee 40s linear infinite;
        }
        .delay-100 { animation-delay: 0.1s; }
        .delay-200 { animation-delay: 0.2s; }
        .delay-300 { animation-delay: 0.3s; }
        .delay-400 { animation-delay: 0.4s; }
        .delay-500 { animation-delay: 0.5s; }
      `}</style>

      <div
        className="absolute inset-0 z-0 bg-[url('https://images.unsplash.com/photo-1518005020951-eccb494ad742?auto=format&fit=crop&w=1600&q=80')] bg-cover bg-center opacity-40"
        style={{
          maskImage: "linear-gradient(180deg, transparent, black 0%, black 70%, transparent)",
          WebkitMaskImage: "linear-gradient(180deg, transparent, black 0%, black 70%, transparent)"
        }}
      />

      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.14),transparent_20%),radial-gradient(circle_at_80%_20%,rgba(255,205,117,0.18),transparent_22%),linear-gradient(180deg,rgba(9,9,11,0.3),rgba(9,9,11,0.9))]" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 pb-12 pt-24 sm:px-6 md:pb-20 md:pt-32 lg:px-8">
        <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-12 lg:gap-8">
          <div className="flex flex-col justify-center space-y-8 pt-8 lg:col-span-7">
            <div className="animate-fade-in delay-100">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 backdrop-blur-md transition-colors hover:bg-white/10">
                <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-300 sm:text-xs">
                  Built for intentional browsing
                  <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                </span>
              </div>
            </div>

            <h1
              className="animate-fade-in delay-200 text-5xl font-medium leading-[0.9] tracking-tighter sm:text-6xl lg:text-7xl xl:text-8xl"
              style={{
                maskImage: "linear-gradient(180deg, black 0%, black 80%, transparent 100%)",
                WebkitMaskImage: "linear-gradient(180deg, black 0%, black 80%, transparent 100%)"
              }}
            >
              <span className="bg-gradient-to-br from-white via-white to-[#ffcd75] bg-clip-text text-transparent">
                Doom2Bloom
              </span>
            </h1>

            <p className="animate-fade-in delay-300 max-w-xl text-lg leading-relaxed text-zinc-400">
              Struggling with doom scrolling? You are in the right place.
            </p>

            <div className="animate-fade-in delay-400 flex flex-col gap-4 sm:flex-row">
              <GlassButton
                onClick={onOpenDashboard}
                size="lg"
                className="group"
                contentClassName="flex items-center justify-center gap-2 text-white"
              >
                Open Dashboard
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </GlassButton>
            </div>
          </div>

          <div className="space-y-6 lg:col-span-5 lg:mt-12">
            <div className="animate-fade-in delay-500 relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-xl">
              <div className="pointer-events-none absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-white/5 blur-3xl" />

              <div className="relative z-10">
                <div className="mb-8 flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
                    <Target className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <div className="text-3xl font-bold tracking-tight text-white">Today</div>
                    <div className="text-sm text-zinc-400">Your focus snapshot</div>
                  </div>
                </div>

                <div className="mb-8 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-400">Focused browsing</span>
                    <span className="font-medium text-white">82%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800/50">
                    <div className="h-full w-[82%] rounded-full bg-gradient-to-r from-white to-zinc-400" />
                  </div>
                </div>

                <div className="mb-6 h-px w-full bg-white/10" />

                <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-4 text-center">
                  <StatItem value={formatDuration(summary.lifetimeTotalMs)} label="Tracked" />
                  <div className="mx-auto h-full w-px bg-white/10" />
                  <StatItem value="14" label="Sites" />
                  <div className="mx-auto h-full w-px bg-white/10" />
                  <StatItem value="3" label="Limits" />
                </div>

                <div className="mt-8 flex flex-wrap gap-2">
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-medium tracking-wide text-zinc-300">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                    </span>
                    TRACKING LIVE
                  </div>
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-medium tracking-wide text-zinc-300">
                    <Crown className="h-3 w-3 text-yellow-500" />
                    STAY FOCUSED
                  </div>
                </div>
              </div>
            </div>

            <div className="animate-fade-in delay-500 relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 py-8 backdrop-blur-xl">
              <h3 className="mb-6 px-8 text-sm font-medium text-zinc-400">What Doom2Bloom helps you manage</h3>

              <div
                className="relative flex overflow-hidden"
                style={{
                  maskImage: "linear-gradient(to right, transparent, black 20%, black 80%, transparent)",
                  WebkitMaskImage: "linear-gradient(to right, transparent, black 20%, black 80%, transparent)"
                }}
              >
                <div className="animate-marquee flex gap-12 whitespace-nowrap px-4">
                  {[...CLIENTS, ...CLIENTS, ...CLIENTS].map((client, index) => (
                    <div
                      key={`${client.name}-${index}`}
                      className="flex cursor-default items-center gap-2 opacity-50 grayscale transition-all hover:scale-105 hover:opacity-100 hover:grayscale-0"
                    >
                      <client.icon className="h-6 w-6 fill-current text-white" />
                      <span className="text-lg font-bold tracking-tight text-white">{client.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
