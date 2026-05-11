export function handleClassify(req, res, categoryLookup) {
    const url = new URL(req.url ?? "/", "http://localhost");
    const domain = url.searchParams.get("domain")?.trim().toLowerCase() ?? "";
    if (!domain) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing domain" }));
        return;
    }
    const result = categoryLookup.matchDomain(domain);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
}
