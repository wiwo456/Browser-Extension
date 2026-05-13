export class BadJsonBodyError extends Error {
    constructor(message = "Invalid JSON body") {
        super(message);
        this.name = "BadJsonBodyError";
    }
}
export async function readJsonBody(req) {
    const chunks = [];
    for await (const chunk of req) {
        chunks.push(Buffer.from(chunk));
    }
    const rawBody = Buffer.concat(chunks).toString("utf8").trim();
    if (!rawBody) {
        return {};
    }
    try {
        return JSON.parse(rawBody);
    }
    catch {
        throw new BadJsonBodyError();
    }
}
