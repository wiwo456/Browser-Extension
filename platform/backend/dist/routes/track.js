export async function handleTrack(req, res, deps) {
    const chunks = [];
    for await (const chunk of req) {
        chunks.push(Buffer.from(chunk));
    }
    const rawBody = Buffer.concat(chunks).toString("utf8");
    const payload = JSON.parse(rawBody || "{}");
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
