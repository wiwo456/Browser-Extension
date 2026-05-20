import { DEFAULT_NOTIFICATION_SETTINGS, type NotificationSettings } from "../types/notifications.js";
import { RuntimeJsonStore } from "./runtimeJsonStore.js";

function normalizeMinimumSessionMinutes(value: number | undefined): number {
  const normalized = Math.floor(Number(value));
  return Number.isFinite(normalized) && normalized > 0 ? normalized : DEFAULT_NOTIFICATION_SETTINGS.minimumSessionMinutes;
}

export class NotificationSettingsStore {
  private settings: NotificationSettings = DEFAULT_NOTIFICATION_SETTINGS;
  private readonly store: RuntimeJsonStore<NotificationSettings>;

  constructor(storagePath: string) {
    this.store = new RuntimeJsonStore<NotificationSettings>(
      "notification-settings",
      storagePath,
      DEFAULT_NOTIFICATION_SETTINGS
    );
  }

  async init(): Promise<void> {
    this.settings = this.normalizeSettings(await this.store.read());
  }

  get(): NotificationSettings {
    return {
      enabled: this.settings.enabled,
      discordWebhookUrl: this.settings.discordWebhookUrl,
      minimumSessionMinutes: this.settings.minimumSessionMinutes,
      preferences: {
        timeAlert: this.settings.preferences.timeAlert,
        blockedAction: this.settings.preferences.blockedAction,
        studyModeStatus: this.settings.preferences.studyModeStatus,
        repeatDistraction: this.settings.preferences.repeatDistraction
      }
    };
  }

  async save(input: Partial<NotificationSettings>): Promise<NotificationSettings> {
    this.settings = this.normalizeSettings(input);
    await this.store.write(this.settings);
    return this.get();
  }

  private normalizeSettings(input: Partial<NotificationSettings> | null | undefined): NotificationSettings {
    return {
      enabled: Boolean(input?.enabled),
      discordWebhookUrl: typeof input?.discordWebhookUrl === "string" ? input.discordWebhookUrl.trim() : "",
      minimumSessionMinutes: normalizeMinimumSessionMinutes(input?.minimumSessionMinutes),
      preferences: {
        timeAlert: input?.preferences?.timeAlert ?? DEFAULT_NOTIFICATION_SETTINGS.preferences.timeAlert,
        blockedAction: input?.preferences?.blockedAction ?? DEFAULT_NOTIFICATION_SETTINGS.preferences.blockedAction,
        studyModeStatus: input?.preferences?.studyModeStatus ?? DEFAULT_NOTIFICATION_SETTINGS.preferences.studyModeStatus,
        repeatDistraction: input?.preferences?.repeatDistraction ?? DEFAULT_NOTIFICATION_SETTINGS.preferences.repeatDistraction
      }
    };
  }
}
