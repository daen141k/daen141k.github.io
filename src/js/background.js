/**
 * Living background — four cooperating layers, all driven by the shared ticker:
 *   1. grid                               (CSS, masked, very low contrast)
 *   2. particles                          (2D canvas, depth + pointer drift)
 *   3. light & colour fields              (CSS radial gradients, slow keyframes)
 *   4. per-section accents                (CSS, see sections.css)
 */

import { onTick } from "./ticker.js";

const rand = (a, b) => a + Math.random() * (b - a);

export function initBackground({ theme } = {}) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const canvas = document.querySelector("[data-particles]");

  /* ------------------------------------------------------ particles */
  let particles = [];
  let ctx = null;
  let w = 0;
  let h = 0;
  let dpr = 1;

  const palette = () => {
    const dark = theme?.get?.() === "dark";
    // one accent only: the teal family
    return dark
      ? ["46, 230, 208", "120, 240, 226", "30, 190, 178"]
      : ["0, 150, 136", "38, 178, 164", "0, 122, 112"];
  };
  let colors = palette();
  theme?.onChange?.(() => (colors = palette()));

  const seed = () => {
    const small = w < 700;
    const count = small ? 10 : w < 1100 ? 18 : 26;
    particles = Array.from({ length: count }, (_, i) => ({
      x: rand(0, w),
      y: rand(0, h),
      r: rand(0.7, small ? 1.8 : 2.6),
      depth: rand(0.25, 1),
      vx: rand(-6, 6) * 0.5,
      vy: rand(-8, 4) * 0.5,
      phase: rand(0, Math.PI * 2),
      color: colors[i % colors.length],
      ring: i % 7 === 0,
    }));
  };

  const resize = () => {
    if (!canvas) return;
    dpr = Math.min(window.devicePixelRatio || 1, 1);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
  };

  /* -------------------------------------------------------- pointer */
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  if (canvas) {
    window.addEventListener(
      "pointermove",
      (e) => {
        pointer.tx = (e.clientX / w - 0.5) * 2;
        pointer.ty = (e.clientY / h - 0.5) * 2;
      },
      { passive: true }
    );
  }

  if (reduce) {
    resize();
    window.addEventListener("resize", resize);
    return;
  }

  resize();
  window.addEventListener("resize", resize);

  let acc = 0;
  let t = 0;

  onTick((dt) => {
    t += dt;
    pointer.x += (pointer.tx - pointer.x) * 0.06;
    pointer.y += (pointer.ty - pointer.y) * 0.06;

    /* particles at ~15 fps — they are slow, nobody counts the frames */
    acc += dt;
    if (!ctx || acc < 0.066) return;
    acc = 0;

    ctx.clearRect(0, 0, w, h);
    for (const p of particles) {
      p.x += (p.vx + pointer.x * 26 * p.depth) * 0.016;
      p.y += (p.vy + pointer.y * 20 * p.depth) * 0.016;
      if (p.x < -20) p.x = w + 20;
      if (p.x > w + 20) p.x = -20;
      if (p.y < -20) p.y = h + 20;
      if (p.y > h + 20) p.y = -20;

      const flicker = 0.45 + 0.55 * Math.sin(t * 0.9 + p.phase);
      ctx.globalAlpha = (0.1 + p.depth * 0.34) * flicker;
      if (p.ring) {
        ctx.strokeStyle = `rgba(${p.color}, 0.8)`;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 3.4, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = `rgba(${p.color}, 0.9)`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (0.6 + p.depth * 0.6), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  });

  document.documentElement.classList.add("has-particles");
}
