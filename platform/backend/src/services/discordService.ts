import type { ActivityRecord } from "../types/activity";
import type { NotificationEvent } from "../types/notifications.js";
import { NotificationSettingsStore } from "./notificationSettingsStore.js";

function formatDuration(durationMs: number): string {
  const totalMinutes = Math.max(1, Math.round(durationMs / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${totalMinutes} minute${totalMinutes === 1 ? "" : "s"}`;
  }

  if (minutes === 0) {
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }

  return `${hours}h ${minutes}m`;
}

interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

interface DiscordEmbed {
  title: string;
  description?: string;
  color?: number;
  fields?: DiscordEmbedField[];
  footer?: { text: string };
  timestamp?: string;
}

function getCategoryLabel(category?: string | null): string {
  return category ? category.replace(/-/g, " ") : "uncategorized";
}

export class DiscordService {
  private readonly sentActivityKeys = new Set<string>();
  private readonly cooldownState = new Map<string, number>();

  constructor(private readonly notificationSettingsStore: NotificationSettingsStore) {}

  async maybeSendAlert(activity: ActivityRecord): Promise<void> {
    const settings = this.notificationSettingsStore.get();
    if (!settings.enabled || !settings.discordWebhookUrl || !settings.preferences.timeAlert) {
      return;
    }

    if (activity.state !== "active") {
      return;
    }

    if (activity.durationMs < settings.minimumSessionMinutes * 60000) {
      return;
    }

    const dedupeKey = `${activity.domain}:${activity.startedAt}:${activity.endedAt}:${activity.durationMs}`;
    if (this.sentActivityKeys.has(dedupeKey)) {
      return;
    }

    const categoryLabel = activity.normalizedCategory ?? "uncategorized";
    const result = await this.sendPayload(settings.discordWebhookUrl, {
      embeds: [
        this.buildEmbed({
          title: "Time Alert",
          description: `${activity.domain} crossed your tracked-session threshold.`,
          color: 0xf59e0b,
          timestamp: activity.endedAt,
          fields: [
            { name: "Site", value: activity.domain, inline: true },
            { name: "Duration", value: formatDuration(activity.durationMs), inline: true },
            { name: "Category", value: getCategoryLabel(categoryLabel), inline: true },
            { name: "Page", value: activity.title || activity.domain },
            { name: "Started", value: new Date(activity.startedAt).toLocaleString(), inline: true },
            { name: "Ended", value: new Date(activity.endedAt).toLocaleString(), inline: true }
          ]
        })
      ]
    });
    if (result.ok) {
      this.sentActivityKeys.add(dedupeKey);
    }
  }

  async handleNotificationEvent(event: NotificationEvent): Promise<void> {
    const settings = this.notificationSettingsStore.get();
    if (!settings.enabled || !settings.discordWebhookUrl) {
      return;
    }

    if (event.type === "blocked-action") {
      if (!settings.preferences.blockedAction) {
        return;
      }

      const cooldownKey = `blocked:${event.domain}:${event.reasonCode}`;
      if (!this.shouldSendWithCooldown(cooldownKey, 10 * 60_000)) {
        return;
      }

      await this.sendContent(
        settings.discordWebhookUrl,
        {
          embeds: [
            this.buildEmbed({
              title: "Blocked Action",
              description: `${event.domain} was blocked by Doom2Bloom.`,
              color: 0xef4444,
              timestamp: event.occurredAt,
              fields: [
                { name: "Site", value: event.domain, inline: true },
                { name: "Reason", value: event.reasonLabel, inline: true },
                { name: "Rule", value: event.reasonCode, inline: true },
                { name: "Details", value: event.reasonDescription }
              ]
            })
          ]
        }
      );
      return;
    }

    if (event.type === "study-mode-status") {
      if (!settings.preferences.studyModeStatus) {
        return;
      }

      await this.sendContent(
        settings.discordWebhookUrl,
        {
          embeds: [
            this.buildEmbed({
              title: event.enabled ? "Study Mode Enabled" : "Study Mode Disabled",
              description: event.enabled
                ? "🟢 Doom2Bloom is now in study mode."
                : "Study mode has been turned off.",
              color: event.enabled ? 0x22c55e : 0x64748b,
              timestamp: event.occurredAt,
              fields: [
                { name: "Status", value: event.enabled ? "On" : "Off", inline: true },
                { name: "Source", value: event.source, inline: true },
                { name: "Mode", value: event.enabled ? "Focused browsing protection active" : "Study restrictions inactive" }
              ]
            })
          ]
        }
      );
      return;
    }

    if (event.type === "repeat-distraction") {
      if (!settings.preferences.repeatDistraction) {
        return;
      }

      const cooldownKey = `repeat:${event.domain}`;
      if (!this.shouldSendWithCooldown(cooldownKey, 45 * 60_000)) {
        return;
      }

      await this.sendContent(
        settings.discordWebhookUrl,
        {
          embeds: [
            this.buildEmbed({
              title: "Repeat Distraction",
              description: `${event.domain} keeps pulling your attention back.`,
              color: 0xf97316,
              timestamp: event.occurredAt,
              fields: [
                { name: "Site", value: event.domain, inline: true },
                { name: "Reopened", value: `${event.visitCount} times`, inline: true },
                { name: "Window", value: `${event.windowMinutes} minutes`, inline: true },
                { name: "Category", value: getCategoryLabel(event.normalizedCategory), inline: true }
              ]
            })
          ]
        }
      );
    }
  }

  async sendTestAlert(): Promise<{ ok: true } | { ok: false; error: string }> {
    const settings = this.notificationSettingsStore.get();
    if (!settings.discordWebhookUrl) {
      return { ok: false, error: "Missing Discord webhook URL." };
    }

    const demoTimestamp = new Date().toISOString();
    const result = await this.sendPayload(settings.discordWebhookUrl, {
      embeds: [
        this.buildEmbed({
          title: "Time Alert",
          description: "youtube.com crossed your tracked-session threshold.",
          color: 0xf59e0b,
          timestamp: demoTimestamp,
          fields: [
            { name: "Site", value: "youtube.com", inline: true },
            { name: "Duration", value: `${settings.minimumSessionMinutes} minutes`, inline: true },
            { name: "Category", value: "entertainment", inline: true },
            { name: "Page", value: "Study With Me Live Stream" }
          ]
        }),
        this.buildEmbed({
          title: "Blocked Action",
          description: "instagram.com was blocked by Doom2Bloom.",
          color: 0xef4444,
          timestamp: demoTimestamp,
          fields: [
            { name: "Site", value: "instagram.com", inline: true },
            { name: "Reason", value: "Study mode block", inline: true },
            { name: "Rule", value: "study-mode", inline: true },
            { name: "Details", value: "instagram.com is not part of your current study-mode allowlist." }
          ]
        }),
        this.buildEmbed({
          title: "Study Mode Enabled",
          description: "🟢 Doom2Bloom is now in study mode.",
          color: 0x22c55e,
          timestamp: demoTimestamp,
          fields: [
            { name: "Status", value: "On", inline: true },
            { name: "Source", value: "dashboard", inline: true },
            { name: "Mode", value: "Focused browsing protection active" }
          ]
        }),
        this.buildEmbed({
          title: "Repeat Distraction",
          description: "twitter.com keeps pulling your attention back.",
          color: 0xf97316,
          timestamp: demoTimestamp,
          fields: [
            { name: "Site", value: "twitter.com", inline: true },
            { name: "Reopened", value: "3 times", inline: true },
            { name: "Window", value: "15 minutes", inline: true },
            { name: "Category", value: "social", inline: true }
          ]
        })
      ]
    });

    return result;
  }

  private buildEmbed(input: {
    title: string;
    description: string;
    color: number;
    fields: DiscordEmbedField[];
    timestamp: string;
  }): DiscordEmbed {
    return {
      title: input.title,
      description: input.description,
      color: input.color,
      fields: input.fields,
      timestamp: input.timestamp,
      footer: {
        text: "Doom2Bloom"
      }
    };
  }

  private async sendContent(
    webhookUrl: string,
    payload: { content?: string; embeds?: DiscordEmbed[] }
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    return this.sendPayload(webhookUrl, payload);
  }

  private async sendPayload(
    webhookUrl: string,
    payload: { content?: string; embeds?: DiscordEmbed[] }
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        return { ok: false, error: `Discord webhook responded with ${response.status}.` };
      }

      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown Discord webhook error."
      };
    }
  }

  private shouldSendWithCooldown(key: string, cooldownMs: number): boolean {
    const now = Date.now();
    const nextAllowedAt = this.cooldownState.get(key) ?? 0;
    if (nextAllowedAt > now) {
      return false;
    }

    this.cooldownState.set(key, now + cooldownMs);
    return true;
  }
}
