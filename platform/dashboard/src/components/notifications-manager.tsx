import { useEffect, useState } from "react";
import { ArrowLeft, Bell, CheckSquare, Send, Square } from "lucide-react";
import DashboardBeamsShell from "@/components/ui/dashboard-beams-shell";
import { GlassButton } from "@/components/ui/glass-button";
import { getApiUrl } from "@/lib/api";
import { DEFAULT_NOTIFICATION_SETTINGS, type NotificationSettings } from "@/types/notifications";

function normalizeNotificationSettings(input: Partial<NotificationSettings> | null | undefined): NotificationSettings {
  return {
    enabled: Boolean(input?.enabled),
    discordWebhookUrl: typeof input?.discordWebhookUrl === "string" ? input.discordWebhookUrl : "",
    minimumSessionMinutes: Number.isFinite(Number(input?.minimumSessionMinutes))
      ? Math.max(1, Math.floor(Number(input?.minimumSessionMinutes)))
      : DEFAULT_NOTIFICATION_SETTINGS.minimumSessionMinutes,
    preferences: {
      timeAlert: input?.preferences?.timeAlert ?? DEFAULT_NOTIFICATION_SETTINGS.preferences.timeAlert,
      blockedAction: input?.preferences?.blockedAction ?? DEFAULT_NOTIFICATION_SETTINGS.preferences.blockedAction,
      studyModeStatus: input?.preferences?.studyModeStatus ?? DEFAULT_NOTIFICATION_SETTINGS.preferences.studyModeStatus,
      repeatDistraction: input?.preferences?.repeatDistraction ?? DEFAULT_NOTIFICATION_SETTINGS.preferences.repeatDistraction
    }
  };
}

const NOTIFICATION_OPTIONS = [
  {
    key: "timeAlert",
    title: "Time alert",
    description: "Send a Discord message when a tracked active browsing session reaches the built-in threshold."
  },
  {
    key: "blockedAction",
    title: "Blocked action",
    description: "Send a message when Doom2Bloom blocks a website, category, timer-limited site, or study-mode violation."
  },
  {
    key: "studyModeStatus",
    title: "Study mode status",
    description: "Send a message when study mode is turned on or off anywhere in the system."
  },
  {
    key: "repeatDistraction",
    title: "Repeat distraction",
    description: "Send a message when the same distracting domain is reopened repeatedly within a short time window."
  }
] as const;

interface NotificationsManagerProps {
  onBack: () => void;
}

export default function NotificationsManager({ onBack }: NotificationsManagerProps) {
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [saveLabel, setSaveLabel] = useState("Save notifications");
  const [testStatus, setTestStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [testMessage, setTestMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      try {
        const response = await fetch(getApiUrl("/notifications/settings"));
        if (!response.ok) {
          throw new Error("Failed to load notification settings");
        }

        const data = normalizeNotificationSettings((await response.json()) as Partial<NotificationSettings>);
        if (!cancelled) {
          setSettings(data);
        }
      } catch {
        if (!cancelled) {
          setSettings(DEFAULT_NOTIFICATION_SETTINGS);
        }
      }
    }

    void loadSettings();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveSettings(): Promise<void> {
    setSaving(true);
    setSaveLabel("Saving...");

    try {
      const response = await fetch(getApiUrl("/notifications/settings"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings)
      });

      if (!response.ok) {
        throw new Error("Failed to save notification settings");
      }

      const data = normalizeNotificationSettings((await response.json()) as Partial<NotificationSettings>);
      setSettings(data);
      setSaveLabel("Saved");
      window.setTimeout(() => setSaveLabel("Save notifications"), 1200);
    } finally {
      setSaving(false);
    }
  }

  function togglePreference(key: keyof NotificationSettings["preferences"]): void {
    setSettings((current) => ({
      ...current,
      preferences: {
        ...current.preferences,
        [key]: !current.preferences[key]
      }
    }));
  }

  async function sendTestNotification(): Promise<void> {
    setTestStatus("sending");
    setTestMessage("");

    try {
      const response = await fetch(getApiUrl("/notifications/test"), {
        method: "POST"
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Failed to send demo notifications");
      }

      setTestStatus("sent");
      setTestMessage("Demo notifications sent to Discord.");
      window.setTimeout(() => {
        setTestStatus("idle");
        setTestMessage("");
      }, 2000);
    } catch (error) {
      setTestStatus("error");
      setTestMessage(error instanceof Error ? error.message : "Failed to send demo notifications");
    }
  }

  return (
    <DashboardBeamsShell>
      <main className="mx-auto max-w-5xl">
        <div className="mb-8 flex flex-wrap items-center gap-3">
          <GlassButton onClick={onBack} size="sm" contentClassName="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </GlassButton>
          <GlassButton onClick={() => void saveSettings()} size="sm">
            {saving ? "Saving..." : saveLabel}
          </GlassButton>
          <GlassButton onClick={() => void sendTestNotification()} size="sm" contentClassName="flex items-center gap-2">
            <Send className="h-4 w-4" />
            {testStatus === "sending" ? "Sending..." : "Send demo"}
          </GlassButton>
        </div>

        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-zinc-500">Notifications</p>
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">Discord notification settings</h1>
            <p className="mt-3 max-w-3xl text-base text-zinc-400">
              Connect a Discord webhook and Doom2Bloom will send alerts for tracked browsing sessions that meet your threshold.
            </p>
          </div>
          <GlassButton
            onClick={() => setSettings((current) => ({ ...current, enabled: !current.enabled }))}
            size="sm"
            contentClassName="flex items-center gap-2"
          >
            <Bell className="h-4 w-4" />
            {settings.enabled ? "Notifications: On" : "Notifications: Off"}
          </GlassButton>
        </div>

        <section className="rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
              <h2 className="text-xl font-semibold text-white">Discord webhook</h2>
              <p className="mt-2 text-sm text-zinc-400">
                Paste your Discord channel webhook URL. Alerts are posted directly to that Discord channel.
              </p>
              <textarea
                value={settings.discordWebhookUrl}
                onChange={(event) => setSettings((current) => ({ ...current, discordWebhookUrl: event.target.value }))}
                rows={5}
                placeholder="https://discord.com/api/webhooks/..."
                className="mt-4 w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-white outline-none placeholder:text-zinc-500"
              />
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
              <h2 className="text-xl font-semibold text-white">Notification types</h2>
              <p className="mt-2 text-sm text-zinc-400">
                Choose which built-in Discord notifications Doom2Bloom can send when notifications are enabled.
              </p>
              <div className="mt-4 space-y-3">
                {NOTIFICATION_OPTIONS.map((option) => {
                  const checked = settings.preferences[option.key];

                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => togglePreference(option.key)}
                      className="flex w-full items-start gap-4 rounded-3xl border border-white/10 bg-white/5 p-4 text-left transition hover:bg-white/8"
                    >
                      <div className="pt-0.5 text-white">
                        {checked ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
                      </div>
                      <div>
                        <div className="text-base font-medium text-white">{option.title}</div>
                        <div className="mt-1 text-sm leading-6 text-zinc-400">{option.description}</div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-400">
                Time alerts use the current built-in threshold of {settings.minimumSessionMinutes} minutes. The demo button sends all 4
                Discord notification styles so you can preview exactly how the system looks in your channel.
              </div>
            </div>
          </div>

          {testMessage ? (
            <div
              className={`mt-6 rounded-2xl border px-4 py-3 text-sm ${
                testStatus === "error"
                  ? "border-red-400/20 bg-red-400/10 text-red-200"
                  : "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
              }`}
            >
              {testMessage}
            </div>
          ) : null}
        </section>
      </main>
    </DashboardBeamsShell>
  );
}
