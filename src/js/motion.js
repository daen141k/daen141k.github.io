/**
 * Scroll + pointer motion: section reveals, parallax, card tilt, magnetic buttons.
 * All of it runs inside the shared ticker. The system cursor is never touched.
 */

import { onTick } from "./ticker.js";

const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function initMotion() {
  /* ---------------------------------------------------------- reveals */
  const targets = [...document.querySelectorAll("[data-anim]")];
  if (reduce.matches || !("IntersectionObserver" in window)) {
    targets.forEach((el) => el.classList.add("is-in"));
  } else {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.06 }
    );
    targets.forEach((el) => io.observe(el));
  }

  /* ------------------------------------------------ type: word splitting */
  document.querySelectorAll("[data-split]").forEach((el) => {
    const text = el.textContent.trim();
    el.textContent = "";
    [...text].forEach((ch, i) => {
      const span = document.createElement("span");
      span.className = "glyph";
      span.style.setProperty("--gi", String(i));
      span.textContent = ch === " " ? "\u00a0" : ch;
      el.append(span);
    });
    el.classList.add("is-split");
  });

  if (reduce.matches) return;

  /* --------------------------------------------------------- parallax */
  const parallax = [...document.querySelectorAll("[data-parallax]")].map((el) => ({
    el,
    speed: parseFloat(el.dataset.parallax) || 0.1,
    y: 0,
    off: 0,
    skip: false,
    target: 0,
  }));

  const tilts = fine.matches
    ? [...document.querySelectorAll("[data-tilt]")].map((el) => ({
        el,
        max: parseFloat(el.dataset.tilt) || 6,
        rx: 0,
        ry: 0,
        tx: 0,
        ty: 0,
        active: false,
      }))
    : [];

  const magnets = fine.matches
    ? [...document.querySelectorAll("[data-magnetic]")].map((el) => ({
        el,
        strength: parseFloat(el.dataset.magnetic) || 7,
        x: 0,
        y: 0,
        tx: 0,
        ty: 0,
      }))
    : [];

  tilts.forEach((t) => {
    const onMove = (e) => {
      const r = t.el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      t.tx = -py * t.max * 2;
      t.ty = px * t.max * 2;
      t.active = true;
      t.el.style.setProperty("--mx", `${((px + 0.5) * 100).toFixed(1)}%`);
      t.el.style.setProperty("--my", `${((py + 0.5) * 100).toFixed(1)}%`);
    };
    const reset = () => {
      t.active = false;
      t.tx = 0;
      t.ty = 0;
    };
    t.el.addEventListener("pointermove", onMove);
    t.el.addEventListener("pointerleave", reset);
  });

  magnets.forEach((m) => {
    const onMove = (e) => {
      const r = m.el.getBoundingClientRect();
      m.tx = clamp((e.clientX - (r.left + r.width / 2)) * 0.2, -m.strength, m.strength);
      m.ty = clamp((e.clientY - (r.top + r.height / 2)) * 0.2, -m.strength, m.strength);
    };
    const reset = () => {
      m.tx = 0;
      m.ty = 0;
    };
    m.el.addEventListener("pointermove", onMove);
    m.el.addEventListener("pointerleave", reset);
  });

  const view = { h: window.innerHeight };
  window.addEventListener("resize", () => (view.h = window.innerHeight), { passive: true });

  /* layout is read once per scroll frame, never in the tick: interleaving
     getBoundingClientRect with style writes forced a synchronous layout every
     frame, which is what made the marquee crawl while the page was scrolling. */
  let layoutDirty = true;
  const touch = () => (layoutDirty = true);
  window.addEventListener("scroll", touch, { passive: true });
  window.addEventListener("resize", touch, { passive: true });

  onTick(() => {
    if (parallax.length && layoutDirty) {
      layoutDirty = false;
      const h = view.h;
      for (const p of parallax) {
        const r = p.el.getBoundingClientRect();
        p.off = r.height ? r.top + r.height / 2 - h / 2 : 0;
        p.skip = r.bottom < -240 || r.top > h + 240;
      }
    }
    for (const p of parallax) {
      if (p.skip) continue;
      p.target = -(p.off || 0) * p.speed;
      p.y += (p.target - p.y) * 0.1;
      p.el.style.transform = `translate3d(0, ${p.y.toFixed(2)}px, 0)`;
    }

    for (const t of tilts) {
      t.rx += (t.tx - t.rx) * 0.12;
      t.ry += (t.ty - t.ry) * 0.12;
      if (!t.active && Math.abs(t.rx) + Math.abs(t.ry) < 0.02) continue;
      t.el.style.transform = `perspective(1000px) rotateX(${t.rx.toFixed(2)}deg) rotateY(${t.ry.toFixed(2)}deg)`;
    }

    for (const m of magnets) {
      m.x += (m.tx - m.x) * 0.16;
      m.y += (m.ty - m.y) * 0.16;
      if (m.tx === 0 && m.ty === 0 && Math.abs(m.x) + Math.abs(m.y) < 0.05) {
        m.el.style.transform = "";
        continue;
      }
      m.el.style.transform = `translate3d(${m.x.toFixed(2)}px, ${m.y.toFixed(2)}px, 0)`;
    }
  });
}
