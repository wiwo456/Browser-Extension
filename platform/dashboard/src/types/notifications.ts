export interface NotificationPreferences {
  timeAlert: boolean;
  blockedAction: boolean;
  studyModeStatus: boolean;
  repeatDistraction: boolean;
}

export interface NotificationSettings {
  enabled: boolean;
  discordWebhookUrl: string;
  minimumSessionMinutes: number;
  preferences: NotificationPreferences;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: false,
  discordWebhookUrl: "",
  minimumSessionMinutes: 15,
  preferences: {
    timeAlert: true,
    blockedAction: true,
    studyModeStatus: true,
    repeatDistraction: true
  }
};
