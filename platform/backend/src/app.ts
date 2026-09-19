import type { IncomingMessage, ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { ActivityStore } from "./services/activityStore.js";
import { CategoryLookupService } from "./services/categoryLookup.js";
import { DiscordService } from "./services/discordService.js";
import { NotificationSettingsStore } from "./services/notificationSettingsStore.js";
import { FocusRulesStore } from "./services/focusRulesStore.js";
import { handleTrackBrowserSession } from "./routes/browserSession.js";
import { handleClassify } from "./routes/classify.js";
import { handleGetFocusRules, handleUpdateFocusRules } from "./routes/focusRules.js";
import { handleFocusRulesTest } from "./routes/focusRulesTest.js";
import {
  handleGetNotificationSettings,
  handleNotificationEvent,
  handleSendTestNotification,
  handleUpdateNotificationSettings
} from "./routes/notifications.js";
import { handleTrack } from "./routes/track.js";
import { handleSummary, handleTimelineSummary } from "./routes/summary.js";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const backendRootDir = join(moduleDir, "..");
const dataDir = join(backendRootDir, "data");
const dashboardDir = join(backendRootDir, "..", "dashboard", "dist");
const dashboardIndexPath = join(dashboardDir, "index.html");
const mlModelPath = join(dataDir, "ml-domain-logreg-model.json");

const store = new ActivityStore(join(dataDir, "activities.json"));
const categoryLookup = new CategoryLookupService(join(dataDir, "domain-category-lookup.json"), mlModelPath);
const focusRulesStore = new FocusRulesStore(join(dataDir, "focus-rules.json"));
const notificationSettingsStore = new NotificationSettingsStore(join(dataDir, "notification-settings.json"));
const discord = new DiscordService(notificationSettingsStore);

let initPromise: Promise<void> | null = null;

function getContentType(filePath: string): string {
  switch (extname(filePath)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    default:
      return "application/octet-stream";
  }
}

async function ensureReady(): Promise<void> {
  if (!initPromise) {
    initPromise = Promise.all([
      categoryLookup.init(),
      focusRulesStore.init(),
      notificationSettingsStore.init(),
      store.init()
    ]).then(() => undefined);
  }

  await initPromise;
}

async function serveDashboardFile(pathname: string, res: ServerResponse): Promise<boolean> {
  const requested = pathname === "/" ? "index.html" : pathname.slice(1);
  const safePath = normalize(requested).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = join(dashboardDir, safePath);

  try {
    const file = await readFile(filePath);
    res.writeHead(200, { "Content-Type": getContentType(filePath) });
    res.end(file);
    return true;
  } catch {
    if (pathname !== "/") {
      return false;
    }
  }

  try {
    const file = await readFile(dashboardIndexPath);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(file);
    return true;
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Dashboard not found");
    return true;
  }
}

function setCors(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
}

export async function handleAppRequest(
  req: IncomingMessage,
  res: ServerResponse,
  options: { serveDashboard?: boolean } = {}
): Promise<void> {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  await ensureReady();

  if (req.url === "/track" && req.method === "POST") {
    await handleTrack(req, res, { store, categoryLookup, discord });
    return;
  }

  if (req.url === "/browser-session" && req.method === "POST") {
    await handleTrackBrowserSession(req, res, { store });
    return;
  }

  if (req.method === "GET" && req.url?.startsWith("/summary/today")) {
    handleSummary(req, res, store);
    return;
  }

  if (req.method === "GET" && req.url?.startsWith("/summary/timeline")) {
    handleTimelineSummary(req, res, store);
    return;
  }

  if (req.method === "GET" && req.url?.startsWith("/classify")) {
    handleClassify(req, res, categoryLookup);
    return;
  }

  if (req.url === "/focus-rules" && req.method === "GET") {
    handleGetFocusRules(res, { focusRulesStore, discord });
    return;
  }

  if (req.url === "/focus-rules" && req.method === "PUT") {
    await handleUpdateFocusRules(req, res, { focusRulesStore, discord });
    return;
  }

  if (req.url === "/focus-rules/test" && req.method === "POST") {
    await handleFocusRulesTest(req, res, { activityStore: store, categoryLookup, focusRulesStore });
    return;
  }

  if (req.url === "/notifications/settings" && req.method === "GET") {
    handleGetNotificationSettings(res, { notificationSettingsStore, discord });
    return;
  }

  if (req.url === "/notifications/settings" && req.method === "PUT") {
    await handleUpdateNotificationSettings(req, res, { notificationSettingsStore, discord });
    return;
  }

  if (req.url === "/notifications/test" && req.method === "POST") {
    await handleSendTestNotification(req, res, { notificationSettingsStore, discord });
    return;
  }

  if (req.url === "/notifications/event" && req.method === "POST") {
    await handleNotificationEvent(req, res, { notificationSettingsStore, discord });
    return;
  }

  if (options.serveDashboard && req.method === "GET" && req.url) {
    const served = await serveDashboardFile(req.url, res);
    if (served) {
      return;
    }
  }

  res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ error: "Not found" }));
}
