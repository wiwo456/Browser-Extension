import { handleAppRequest } from "../platform/backend/dist/app.js";

export default async function handler(req, res) {
  try {
    await handleAppRequest(req, res, { serveDashboard: false });
  } catch (error) {
    console.error(error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Internal server error" }));
  }
}
