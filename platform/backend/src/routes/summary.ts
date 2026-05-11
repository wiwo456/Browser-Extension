import type { IncomingMessage, ServerResponse } from "node:http";
import { ActivityStore } from "../services/activityStore.js";
import type { NormalizedCategory } from "../types/activity.js";

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

export function handleSummary(req: IncomingMessage, res: ServerResponse, store: ActivityStore): void {
  const summary = store.getToday(getCategoryFilter(req));
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(summary));
}
