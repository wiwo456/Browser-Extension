"use client";

import type { ReactNode } from "react";
import { PulseBeams } from "@/components/ui/pulse-beams";

const DASHBOARD_BEAMS = [
  {
    path: "M80 140H480C530 140 560 170 560 220V340",
    gradientConfig: {
      initial: { x1: "0%", x2: "0%", y1: "0%", y2: "100%" },
      animate: {
        x1: ["0%", "25%", "70%"],
        x2: ["10%", "45%", "90%"],
        y1: ["0%", "0%", "25%"],
        y2: ["25%", "60%", "100%"]
      },
      transition: {
        duration: 4,
        repeat: Infinity,
        repeatType: "loop",
        ease: "linear",
        repeatDelay: 1.5
      }
    },
    connectionPoints: [
      { cx: 80, cy: 140, r: 5 },
      { cx: 560, cy: 340, r: 5 }
    ]
  },
  {
    path: "M1120 180H760C700 180 660 220 660 300V520",
    gradientConfig: {
      initial: { x1: "100%", x2: "80%", y1: "0%", y2: "25%" },
      animate: {
        x1: ["100%", "70%", "35%"],
        x2: ["85%", "55%", "15%"],
        y1: ["0%", "10%", "55%"],
        y2: ["15%", "35%", "100%"]
      },
      transition: {
        duration: 4.6,
        repeat: Infinity,
        repeatType: "loop",
        ease: "linear",
        repeatDelay: 1
      }
    },
    connectionPoints: [
      { cx: 1120, cy: 180, r: 5 },
      { cx: 660, cy: 520, r: 5 }
    ]
  },
  {
    path: "M120 860H390C450 860 500 815 500 750V640",
    gradientConfig: {
      initial: { x1: "0%", x2: "20%", y1: "100%", y2: "85%" },
      animate: {
        x1: ["0%", "25%", "55%"],
        x2: ["12%", "45%", "78%"],
        y1: ["100%", "75%", "35%"],
        y2: ["90%", "58%", "10%"]
      },
      transition: {
        duration: 4.3,
        repeat: Infinity,
        repeatType: "loop",
        ease: "linear",
        repeatDelay: 1.8
      }
    },
    connectionPoints: [
      { cx: 120, cy: 860, r: 5 },
      { cx: 500, cy: 640, r: 5 }
    ]
  },
  {
    path: "M1180 830H880C800 830 745 770 745 690V610",
    gradientConfig: {
      initial: { x1: "100%", x2: "90%", y1: "100%", y2: "85%" },
      animate: {
        x1: ["100%", "85%", "60%"],
        x2: ["92%", "72%", "42%"],
        y1: ["100%", "82%", "38%"],
        y2: ["90%", "60%", "8%"]
      },
      transition: {
        duration: 5,
        repeat: Infinity,
        repeatType: "loop",
        ease: "linear",
        repeatDelay: 1.2
      }
    },
    connectionPoints: [
      { cx: 1180, cy: 830, r: 5 },
      { cx: 745, cy: 610, r: 5 }
    ]
  }
] as const;

const DASHBOARD_GRADIENT_COLORS = {
  start: "#22d3ee",
  middle: "#38bdf8",
  end: "#f59e0b"
};

interface DashboardBeamsShellProps {
  children: ReactNode;
  className?: string;
}

export default function DashboardBeamsShell({ children, className }: DashboardBeamsShellProps) {
  return (
    <PulseBeams
      beams={DASHBOARD_BEAMS}
      width={1440}
      height={1100}
      baseColor="rgba(82, 82, 91, 0.24)"
      accentColor="rgba(255,255,255,0.18)"
      gradientColors={DASHBOARD_GRADIENT_COLORS}
      className={className ?? "min-h-screen bg-zinc-950 px-4 py-8 text-white sm:px-6 lg:px-8"}
      background={
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),transparent_24%),linear-gradient(180deg,#09090b,#020617)]" />
      }
    >
      {children}
    </PulseBeams>
  );
}
