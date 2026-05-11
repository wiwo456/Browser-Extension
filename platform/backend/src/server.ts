import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { ActivityStore } from "./services/activityStore.js";
import { CategoryLookupService } from "./services/categoryLookup.js";
import { DiscordService } from "./services/discordService.js";
import { FocusRulesStore } from "./services/focusRulesStore.js";
import { handleClassify } from "./routes/classify.js";
import { handleGetFocusRules, handleUpdateFocusRules } from "./routes/focusRules.js";
import { handleTrack } from "./routes/track.js";
import { handleSummary } from "./routes/summary.js";

const store = new ActivityStore(join(process.cwd(), "data", "activities.json"));
const categoryLookup = new CategoryLookupService(join(process.cwd(), "data", "domain-category-lookup.json"));
const focusRulesStore = new FocusRulesStore(join(process.cwd(), "data", "focus-rules.json"));
const discord = new DiscordService();
const dashboardDir = join(process.cwd(), "..", "dashboard", "dist");
const dashboardIndexPath = join(dashboardDir, "index.html");

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
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Dashboard not found");
    return true;
  }
}

function setCors(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
}

async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === "/track" && req.method === "POST") {
    await handleTrack(req, res, { store, categoryLookup, discord });
    return;
  }

  if (req.method === "GET" && req.url?.startsWith("/summary/today")) {
    handleSummary(req, res, store);
    return;
  }

  if (req.method === "GET" && req.url?.startsWith("/classify")) {
    handleClassify(req, res, categoryLookup);
    return;
  }

  if (req.url === "/focus-rules" && req.method === "GET") {
    handleGetFocusRules(res, { focusRulesStore });
    return;
  }

  if (req.url === "/focus-rules" && req.method === "PUT") {
    await handleUpdateFocusRules(req, res, { focusRulesStore });
    return;
  }

  if (req.method === "GET" && req.url) {
    const served = await serveDashboardFile(req.url, res);
    if (served) {
      return;
    }
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
}

const port = Number(process.env.PORT ?? 8787);

async function start(): Promise<void> {
  await categoryLookup.init();
  await focusRulesStore.init();
  await store.init();

  createServer((req, res) => {
    route(req, res).catch((error) => {
      console.error(error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal server error" }));
    });
  }).listen(port, () => {
    console.log(`Activity backend listening on http://localhost:${port}`);
  });
}

void start();
