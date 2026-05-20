import type { IncomingMessage, ServerResponse } from "node:http";
import { DiscordService } from "../services/discordService.js";
import { FocusRulesStore } from "../services/focusRulesStore.js";
import type { FocusRules } from "../types/focusRules.js";
import { BadJsonBodyError, readJsonBody } from "../utils/readJsonBody.js";

interface FocusRulesDependencies {
  focusRulesStore: FocusRulesStore;
  discord: DiscordService;
}

export function handleGetFocusRules(res: ServerResponse, deps: FocusRulesDependencies): void {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(deps.focusRulesStore.get()));
}

export async function handleUpdateFocusRules(
  req: IncomingMessage,
  res: ServerResponse,
  deps: FocusRulesDependencies
): Promise<void> {
  try {
    const previousRules = deps.focusRulesStore.get();
    const payload = await readJsonBody<Partial<FocusRules>>(req);
    const saved = await deps.focusRulesStore.save(payload);

    if (previousRules.studyMode.enabled !== saved.studyMode.enabled) {
      await deps.discord.handleNotificationEvent({
        type: "study-mode-status",
        occurredAt: new Date().toISOString(),
        enabled: saved.studyMode.enabled,
        source: "dashboard"
      });
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(saved));
  } catch (error) {
    if (error instanceof BadJsonBodyError) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: error.message }));
      return;
    }

    throw error;
  }
}
