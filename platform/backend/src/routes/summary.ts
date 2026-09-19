import type { IncomingMessage, ServerResponse } from "node:http";
import { ActivityStore } from "../services/activityStore.js";
import type { NormalizedCategory, TimelinePeriod } from "../types/activity.js";

const VALID_CATEGORIES = new Set<NormalizedCategory>([
  "adult",
  "entertainment",
  "gaming",
  "health",
  "learning",
  "news",
  "other",
  "shopping",
  "social",
  "work"
]);

const VALID_TIMELINE_PERIODS = new Set<TimelinePeriod>(["day", "week"]);

function getCategoryFilter(req: IncomingMessage): NormalizedCategory | undefined {
  if (!req.url) {
    return undefined;
  }

  const url = new URL(req.url, "http://localhost");
  const category = url.searchParams.get("category");
  if (!category) {
    return undefined;
  }

  return VALID_CATEGORIES.has(category as NormalizedCategory) ? (category as NormalizedCategory) : undefined;
}

function getTimelinePeriod(req: IncomingMessage): TimelinePeriod {
  if (!req.url) {
    return "day";
  }

  const url = new URL(req.url, "http://localhost");
  const period = url.searchParams.get("period");

  return VALID_TIMELINE_PERIODS.has(period as TimelinePeriod) ? (period as TimelinePeriod) : "day";
}

export function handleSummary(req: IncomingMessage, res: ServerResponse, store: ActivityStore): void {
  const summary = store.getToday(getCategoryFilter(req));
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(summary));
}

export function handleTimelineSummary(req: IncomingMessage, res: ServerResponse, store: ActivityStore): void {
  const timeline = store.getTimeline(getTimelinePeriod(req), getCategoryFilter(req));
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(timeline));
}
