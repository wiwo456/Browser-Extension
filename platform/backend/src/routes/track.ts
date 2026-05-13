import type { IncomingMessage, ServerResponse } from "node:http";
import type { ActivityRecord } from "../types/activity";
import { ActivityStore } from "../services/activityStore.js";
import { CategoryLookupService } from "../services/categoryLookup.js";
import { DiscordService } from "../services/discordService.js";
import { BadJsonBodyError, readJsonBody } from "../utils/readJsonBody.js";

interface TrackDependencies {
  store: ActivityStore;
  categoryLookup: CategoryLookupService;
  discord: DiscordService;
}

export async function handleTrack(req: IncomingMessage, res: ServerResponse, deps: TrackDependencies): Promise<void> {
  let payload: { activity?: ActivityRecord };

  try {
    payload = await readJsonBody<{ activity?: ActivityRecord }>(req);
  } catch (error) {
    if (error instanceof BadJsonBodyError) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: error.message }));
      return;
    }

    throw error;
  }

  if (!payload.activity) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Missing activity payload" }));
    return;
  }

  const categoryMatch = deps.categoryLookup.matchDomain(payload.activity.domain);
  const enrichedActivity: ActivityRecord = {
    ...payload.activity,
    rawCategory: categoryMatch.rawCategory,
    normalizedCategory: categoryMatch.normalizedCategory
  };

  await deps.store.add(enrichedActivity);
  await deps.discord.maybeSendAlert(enrichedActivity);

  res.writeHead(201, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true, activity: enrichedActivity }));
}
