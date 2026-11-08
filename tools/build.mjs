/**
 * Build: two ES modules, no other tooling.
 *   assets/js/app.js     — page shell (small, no three)
 *   assets/js/hero3d.js  — 3D scene, imported lazily by app.js (three inlined)
 */
import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");

const common = {
  bundle: true,
  format: "esm",
  target: ["es2020"],
  minify: !watch,
  sourcemap: false,
  legalComments: "none",
  logLevel: "info",
};

const app = {
  ...common,
  entryPoints: ["src/js/main.js"],
  outfile: "assets/js/app.js",
  external: ["./hero3d.js"],
};

const hero = {
  ...common,
  entryPoints: ["src/js/hero3d.js"],
  outfile: "assets/js/hero3d.js",
};

if (watch) {
  const ctxApp = await esbuild.context(app);
  const ctxHero = await esbuild.context(hero);
  await Promise.all([ctxApp.watch(), ctxHero.watch()]);
  console.log("watching…");
} else {
  await Promise.all([esbuild.build(app), esbuild.build(hero)]);
}
