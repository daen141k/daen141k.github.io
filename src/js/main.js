import { initTheme } from "./theme.js";
import { initMotion } from "./motion.js";
import { initBackground } from "./background.js";
import { initMenu } from "./menu.js";
import { initCopy } from "./copy.js";
import { initClock } from "./clock.js";
import { initUI } from "./ui.js";
import { initCursorRing } from "./cursor-ring.js";

const boot = () => {
  const theme = initTheme();
  initMotion();
  initUI();
  initClock();
  initMenu();
  initCopy();
  initBackground({ theme });
  initCursorRing();

  // the 3D scenes are the heaviest asset — fetch them after the first paint
  const canvases = [...document.querySelectorAll("[data-glass]")];
  const weak =
    navigator.hardwareConcurrency === 1 ||
    (navigator.deviceMemory && navigator.deviceMemory <= 1) ||
    window.matchMedia("(prefers-reduced-data: reduce)").matches;

  if (!canvases.length) return;
  if (weak) {
    document.documentElement.classList.add("no-3d");
    return;
  }

  const load = () => {
    const ready = window.__HERO3D__ ? Promise.resolve(window.__HERO3D__) : import("./hero3d.js");
    ready
      .then((mod) => {
        const scenes = [];
        let failed = 0;
        /* Only one sculpture animates at a time: a transmission pass is the most
           expensive thing on the page, and a scene sitting half offscreen next to
           the marquee was enough to starve the compositor. */
        let owner = null;
        const runs = (variant) => owner === null || owner === variant;
        for (const canvas of canvases) {
          const variant = canvas.dataset.glass || "hero";
          const scene = mod.createGlass({
            canvas,
            container: canvas.closest("[data-glass-stage]") || canvas.parentElement,
            variant,
            gate: () => runs(variant),
            onReady: () => document.documentElement.classList.add("has-3d"),
            onSlow:
              canvas.dataset.glass === "hero"
                ? () => {
                    scenes.forEach((s) => s?.stop());
                    document.documentElement.classList.remove("has-3d");
                    document.documentElement.classList.add("no-3d");
                  }
                : undefined,
          });
          if (scene) scenes.push(scene);
          else failed += 1;
        }

        /* the biggest visible stage wins; the rest stop at their last frame */
        const NONE = "\u0000none";
        const band = document.querySelector(".marquee");
        const choose = () => {
          const h = window.innerHeight;
          /* nothing renders while the band is being looked at (its loop has to
             stay perfectly smooth); a band merely peeking in at the very bottom
             of the screen does not count — that is the landing view */
          if (band) {
            const r = band.getBoundingClientRect();
            if (r.top < h * 0.78 && r.bottom > h * 0.22) {
              if (owner !== NONE) {
                owner = NONE;
                scenes.forEach((scene) => scene.refresh());
              }
              return;
            }
          }
          let best = null;
          let bestArea = 0;
          for (const scene of scenes) {
            const r = scene.el.getBoundingClientRect();
            const area = Math.max(0, Math.min(r.bottom, h) - Math.max(r.top, 0)) * r.width;
            if (area > bestArea) {
              bestArea = area;
              best = scene;
            }
          }
          const next = best ? best.el.querySelector("[data-glass]")?.dataset.glass ?? null : null;
          if (next === owner) return;
          owner = next;
          scenes.forEach((scene) => scene.refresh());
        };
        let queued = false;
        const ask = () => {
          if (queued) return;
          queued = true;
          requestAnimationFrame(() => {
            queued = false;
            choose();
          });
        };
        choose();
        window.addEventListener("scroll", ask, { passive: true });
        window.addEventListener("resize", ask, { passive: true });
        if (!scenes.length || failed === canvases.length) {
          document.documentElement.classList.add("no-3d");
          return;
        }
        theme.onChange((next) => scenes.forEach((s) => s.setTheme(next)));
      })
      .catch(() => document.documentElement.classList.add("no-3d"));
  };

  if ("requestIdleCallback" in window) requestIdleCallback(load, { timeout: 1200 });
  else setTimeout(load, 240);
};

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();
