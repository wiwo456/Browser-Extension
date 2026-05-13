import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

type RuntimeStorageMode = "file" | "memory";

declare global {
  // eslint-disable-next-line no-var
  var __browserExtRuntimeJsonStore: Map<string, string> | undefined;
  // eslint-disable-next-line no-var
  var __browserExtRuntimeJsonStoreWarningShown: boolean | undefined;
}

function getRuntimeStorageMode(): RuntimeStorageMode {
  const configured = process.env.APP_STORAGE_MODE?.trim().toLowerCase();
  if (configured === "file" || configured === "memory") {
    return configured;
  }

  return process.env.VERCEL ? "memory" : "file";
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function getMemoryStore(): Map<string, string> {
  globalThis.__browserExtRuntimeJsonStore ??= new Map<string, string>();
  return globalThis.__browserExtRuntimeJsonStore;
}

function warnMemoryMode(): void {
  if (!process.env.VERCEL || globalThis.__browserExtRuntimeJsonStoreWarningShown) {
    return;
  }

  globalThis.__browserExtRuntimeJsonStoreWarningShown = true;
  console.warn(
    "Running on Vercel without durable storage. Data will stay available only for the lifetime of a warm function instance."
  );
}

export class RuntimeJsonStore<T> {
  private readonly mode = getRuntimeStorageMode();

  constructor(
    private readonly key: string,
    private readonly filePath: string,
    private readonly fallbackValue: T
  ) {}

  async read(): Promise<T> {
    if (this.mode === "memory") {
      warnMemoryMode();
      const raw = getMemoryStore().get(this.key);
      return raw ? (JSON.parse(raw) as T) : cloneValue(this.fallbackValue);
    }

    try {
      const file = await readFile(this.filePath, "utf8");
      return JSON.parse(file) as T;
    } catch {
      return cloneValue(this.fallbackValue);
    }
  }

  async write(value: T): Promise<void> {
    if (this.mode === "memory") {
      warnMemoryMode();
      getMemoryStore().set(this.key, JSON.stringify(value));
      return;
    }

    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(value, null, 2), "utf8");
  }
}
