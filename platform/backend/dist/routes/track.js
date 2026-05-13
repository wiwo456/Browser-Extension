import { BadJsonBodyError, readJsonBody } from "../utils/readJsonBody.js";
export async function handleTrack(req, res, deps) {
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
    if (!payload.activity) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing activity payload" }));
        return;
    }
    const categoryMatch = deps.categoryLookup.matchDomain(payload.activity.domain);
    const enrichedActivity = {
        ...payload.activity,
        rawCategory: categoryMatch.rawCategory,
        normalizedCategory: categoryMatch.normalizedCategory
    };
    await deps.store.add(enrichedActivity);
    await deps.discord.maybeSendAlert(enrichedActivity);
    res.writeHead(201, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, activity: enrichedActivity }));
}
