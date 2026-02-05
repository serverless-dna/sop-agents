import * as esbuild from "esbuild";

const isWatch = process.argv.includes("--watch");

/** @type {esbuild.BuildOptions} */
const buildOptions = {
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "es2022",
  outdir: "dist",
  format: "cjs",
  sourcemap: true,
  treeShaking: true,
  minify: process.env.NODE_ENV === "production",
  external: [
    // Mark dependencies as external to avoid bundling them
    "@strands-agents/sdk",
  ],
};

if (isWatch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log("Watching for changes...");
} else {
  await esbuild.build(buildOptions);
  console.log("Build complete!");
}
