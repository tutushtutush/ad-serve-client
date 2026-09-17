import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  outfile: "dist/ad-serve-client.js",
  format: "iife",
  target: "es2020",
  minify: true,
  sourcemap: true,
});
