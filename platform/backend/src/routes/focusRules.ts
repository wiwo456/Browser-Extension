import type { IncomingMessage, ServerResponse } from "node:http";
import { FocusRulesStore } from "../services/focusRulesStore.js";
import type { FocusRules } from "../types/focusRules.js";

interface FocusRulesDependencies {
  focusRulesStore: FocusRulesStore;
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
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");
  const payload = JSON.parse(rawBody || "{}") as Partial<FocusRules>;
  const saved = await deps.focusRulesStore.save(payload);

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(saved));
}
