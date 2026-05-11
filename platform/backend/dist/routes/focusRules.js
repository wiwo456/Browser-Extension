export function handleGetFocusRules(res, deps) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(deps.focusRulesStore.get()));
}
export async function handleUpdateFocusRules(req, res, deps) {
    const chunks = [];
    for await (const chunk of req) {
        chunks.push(Buffer.from(chunk));
    }
    const rawBody = Buffer.concat(chunks).toString("utf8");
    const payload = JSON.parse(rawBody || "{}");
    const saved = await deps.focusRulesStore.save(payload);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(saved));
}
