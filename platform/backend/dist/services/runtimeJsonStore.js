import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
function getRuntimeStorageMode() {
    const configured = process.env.APP_STORAGE_MODE?.trim().toLowerCase();
    if (configured === "file" || configured === "memory") {
        return configured;
    }
    return process.env.VERCEL ? "memory" : "file";
}
function cloneValue(value) {
    return JSON.parse(JSON.stringify(value));
}
function getMemoryStore() {
    globalThis.__browserExtRuntimeJsonStore ?? (globalThis.__browserExtRuntimeJsonStore = new Map());
    return globalThis.__browserExtRuntimeJsonStore;
}
function warnMemoryMode() {
    if (!process.env.VERCEL || globalThis.__browserExtRuntimeJsonStoreWarningShown) {
        return;
    }
    globalThis.__browserExtRuntimeJsonStoreWarningShown = true;
    console.warn("Running on Vercel without durable storage. Data will stay available only for the lifetime of a warm function instance.");
}
export class RuntimeJsonStore {
    constructor(key, filePath, fallbackValue) {
        this.key = key;
        this.filePath = filePath;
        this.fallbackValue = fallbackValue;
        this.mode = getRuntimeStorageMode();
    }
    async read() {
        if (this.mode === "memory") {
            warnMemoryMode();
            const raw = getMemoryStore().get(this.key);
            return raw ? JSON.parse(raw) : cloneValue(this.fallbackValue);
        }
        try {
            const file = await readFile(this.filePath, "utf8");
            return JSON.parse(file);
        }
        catch {
            return cloneValue(this.fallbackValue);
        }
    }
    async write(value) {
        if (this.mode === "memory") {
            warnMemoryMode();
            getMemoryStore().set(this.key, JSON.stringify(value));
            return;
        }
        await mkdir(dirname(this.filePath), { recursive: true });
        await writeFile(this.filePath, JSON.stringify(value, null, 2), "utf8");
    }
}
