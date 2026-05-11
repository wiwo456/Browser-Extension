const VALID_CATEGORIES = new Set([
    "adult",
    "entertainment",
    "gaming",
    "health",
    "learning",
    "news",
    "other",
    "shopping",
    "social",
    "work"
]);
function getCategoryFilter(req) {
    if (!req.url) {
        return undefined;
    }
    const url = new URL(req.url, "http://localhost");
    const category = url.searchParams.get("category");
    if (!category) {
        return undefined;
    }
    return VALID_CATEGORIES.has(category) ? category : undefined;
}
export function handleSummary(req, res, store) {
    const summary = store.getToday(getCategoryFilter(req));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(summary));
}
