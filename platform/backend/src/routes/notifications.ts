import type { IncomingMessage, ServerResponse } from "node:http";
import { DiscordService } from "../services/discordService.js";
import { NotificationSettingsStore } from "../services/notificationSettingsStore.js";
import type { NotificationEvent, NotificationSettings } from "../types/notifications.js";
import { BadJsonBodyError, readJsonBody } from "../utils/readJsonBody.js";

interface NotificationDependencies {
  notificationSettingsStore: NotificationSettingsStore;
  discord: DiscordService;
}

export function handleGetNotificationSettings(res: ServerResponse, deps: NotificationDependencies): void {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(deps.notificationSettingsStore.get()));
}

export async function handleUpdateNotificationSettings(
  req: IncomingMessage,
  res: ServerResponse,
  deps: NotificationDependencies
): Promise<void> {
  try {
    const payload = await readJsonBody<Partial<NotificationSettings>>(req);
    const saved = await deps.notificationSettingsStore.save(payload);

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

export async function handleSendTestNotification(
  _req: IncomingMessage,
  res: ServerResponse,
  deps: NotificationDependencies
): Promise<void> {
  const settings = deps.notificationSettingsStore.get();

  if (!settings.discordWebhookUrl) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Discord webhook URL is required before sending a test notification." }));
    return;
  }

  const result = await deps.discord.sendTestAlert();
  if (!result.ok) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: result.error ?? "Failed to send test notification." }));
    return;
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true }));
}

export async function handleNotificationEvent(
  req: IncomingMessage,
  res: ServerResponse,
  deps: NotificationDependencies
): Promise<void> {
  try {
    const payload = await readJsonBody<{ event?: NotificationEvent }>(req);
    if (!payload.event) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing notification event payload." }));
      return;
    }

    await deps.discord.handleNotificationEvent(payload.event);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  } catch (error) {
    if (error instanceof BadJsonBodyError) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: error.message }));
      return;
    }

    throw error;
  }
}
