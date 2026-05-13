import { build } from "esbuild";

const sharedConfig = {
  bundle: true,
  format: "esm",
  target: "chrome114",
  platform: "browser",
  sourcemap: false,
  logLevel: "info"
};

await build({
  ...sharedConfig,
  entryPoints: ["src/background/index.ts"],
  outfile: "dist/background/index.js"
});

await build({
  ...sharedConfig,
  entryPoints: ["src/popup/index.ts"],
  outfile: "dist/popup/index.js"
});

await build({
  ...sharedConfig,
  entryPoints: ["src/options/index.ts"],
  outfile: "dist/options/index.js"
});

await build({
  ...sharedConfig,
  entryPoints: ["src/stay-focused/index.ts"],
  outfile: "dist/stay-focused/index.js"
});
