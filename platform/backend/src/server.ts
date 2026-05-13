import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { handleAppRequest } from "./app.js";

const port = Number(process.env.PORT ?? 8787);

function start(): void {
  createServer((req, res) => {
    handleAppRequest(req, res, { serveDashboard: true }).catch((error) => {
      console.error(error);
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Internal server error" }));
    });
  }).listen(port, () => {
    console.log(`Activity backend listening on http://localhost:${port}`);
  });
}

start();
