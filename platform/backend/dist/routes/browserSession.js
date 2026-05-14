import { BadJsonBodyError, readJsonBody } from "../utils/readJsonBody.js";
function isValidBrowserSessionRecord(input) {
    if (!input) {
        return false;
    }
    const startedAtMs = new Date(input.startedAt).getTime();
    const endedAtMs = new Date(input.endedAt).getTime();
    return (Number.isFinite(startedAtMs) &&
        Number.isFinite(endedAtMs) &&
        endedAtMs >= startedAtMs &&
        Number.isFinite(input.durationMs) &&
        input.durationMs >= 0 &&
        input.source === "extension" &&
        (input.endReason === "browser-closed" || input.endReason === "startup-recovery" || input.endReason === "manual-reset"));
}
export async function handleTrackBrowserSession(req, res, deps) {
    let payload;
    try {
        payload = await readJsonBody(req);
    }
    catch (error) {
        if (error instanceof BadJsonBodyError) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: error.message }));
            return;
        }
        throw error;
    }
    if (!isValidBrowserSessionRecord(payload.session)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing or invalid session payload" }));
        return;
    }
    await deps.store.addBrowserSession(payload.session);
    res.writeHead(201, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, session: payload.session }));
}
