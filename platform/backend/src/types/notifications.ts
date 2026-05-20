export type NotificationType = "time-alert" | "blocked-action" | "study-mode-status" | "repeat-distraction";

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

export interface BlockedActionNotificationEvent {
  type: "blocked-action";
  occurredAt: string;
  domain: string;
  reasonCode: "domain" | "category" | "domain-timer" | "category-timer" | "study-mode";
  reasonLabel: string;
  reasonDescription: string;
}

export interface StudyModeStatusNotificationEvent {
  type: "study-mode-status";
  occurredAt: string;
  enabled: boolean;
  source: "dashboard" | "popup" | "study-page" | "unknown";
}

export interface RepeatDistractionNotificationEvent {
  type: "repeat-distraction";
  occurredAt: string;
  domain: string;
  visitCount: number;
  windowMinutes: number;
  normalizedCategory?: string | null;
}

export type NotificationEvent =
  | BlockedActionNotificationEvent
  | StudyModeStatusNotificationEvent
  | RepeatDistractionNotificationEvent;
