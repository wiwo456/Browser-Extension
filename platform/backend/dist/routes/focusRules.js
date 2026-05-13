import { BadJsonBodyError, readJsonBody } from "../utils/readJsonBody.js";
export function handleGetFocusRules(res, deps) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(deps.focusRulesStore.get()));
}
export async function handleUpdateFocusRules(req, res, deps) {
    try {
        const payload = await readJsonBody(req);
        const saved = await deps.focusRulesStore.save(payload);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(saved));
    }
    catch (error) {
        if (error instanceof BadJsonBodyError) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: error.message }));
            return;
        }
        throw error;
    }
}
