// Lean esbuild bundler for the MV3 extension. Works on Node 20.17 (unlike WXT's
// Vite 7 toolchain, which needs Node >= 20.19). Outputs an unpacked extension to
// extension/dist — load that folder via chrome://extensions (Developer mode).
import * as esbuild from "esbuild";
import { cp, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const r = (...p) => resolve(root, ...p);
const watch = process.argv.includes("--watch");

await mkdir(r("dist"), { recursive: true });

const common = {
  bundle: true,
  format: "iife",
  target: "chrome120",
  logLevel: "info",
  sourcemap: watch ? "inline" : false,
  minify: !watch,
  define: { "process.env.NODE_ENV": JSON.stringify(watch ? "development" : "production") },
};

const builds = [
  { entryPoints: [r("src/content.ts")], outfile: r("dist/content.js") },
  { entryPoints: [r("src/background.ts")], outfile: r("dist/background.js") },
  { entryPoints: [r("src/sidepanel/main.tsx")], outfile: r("dist/sidepanel.js"), jsx: "automatic" },
];

async function copyStatic() {
  await cp(r("manifest.json"), r("dist/manifest.json"));
  await cp(r("src/sidepanel/index.html"), r("dist/sidepanel.html"));
}

if (watch) {
  const contexts = await Promise.all(builds.map((b) => esbuild.context({ ...common, ...b })));
  await copyStatic();
  await Promise.all(contexts.map((c) => c.watch()));
  console.log("watching for changes… (reload the extension in chrome://extensions after edits)");
} else {
  await Promise.all(builds.map((b) => esbuild.build({ ...common, ...b })));
  await copyStatic();
  console.log("built extension to", r("dist"));
}
