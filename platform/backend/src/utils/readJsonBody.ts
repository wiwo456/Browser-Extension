import type { IncomingMessage } from "node:http";

export class BadJsonBodyError extends Error {
  constructor(message = "Invalid JSON body") {
    super(message);
    this.name = "BadJsonBodyError";
  }
}

export async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }

  const rawBody = Buffer.concat(chunks).toString("utf8").trim();
  if (!rawBody) {
    return {} as T;
  }

  try {
    return JSON.parse(rawBody) as T;
  } catch {
    throw new BadJsonBodyError();
  }
}
