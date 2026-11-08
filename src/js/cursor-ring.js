/**
 * Decorative ring that trails the real pointer.
 * The system cursor stays visible and untouched: this is only a fixed,
 * pointer-events:none ornament updated once per frame from pointermove.
 */
import { onTick } from "./ticker.js";

const HOVER_SELECTOR = "a, button, [data-tilt], .tile, .theme, .burger, [data-copy]";

export function initCursorRing() {
  const coarse = window.matchMedia("(hover: none), (pointer: coarse)");
  if (coarse.matches) return;

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ring = document.createElement("div");
  ring.className = "cursor-ring";
  ring.setAttribute("aria-hidden", "true");
  ring.innerHTML = '<i></i>';
  document.body.appendChild(ring);

  const s = { x: window.innerWidth / 2, y: window.innerHeight / 2, tx: window.innerWidth / 2, ty: window.innerHeight / 2, on: false };
  const ease = reduce ? 1 : 0.2;

  const move = (e) => {
    if (e.pointerType === "touch") return;
    s.tx = e.clientX;
    s.ty = e.clientY;
    if (!s.on) {
      s.on = true;
      s.x = s.tx;
      s.y = s.ty;
      ring.classList.add("is-on");
    }
  };
  const leave = () => {
    s.on = false;
    ring.classList.remove("is-on");
  };
  const over = (e) => {
    const hit = e.target instanceof Element && e.target.closest(HOVER_SELECTOR);
    ring.classList.toggle("is-hover", Boolean(hit));
  };
  const down = () => ring.classList.add("is-press");
  const up = () => ring.classList.remove("is-press");

  window.addEventListener("pointermove", move, { passive: true });
  document.addEventListener("pointerleave", leave, { passive: true });
  window.addEventListener("pointerover", over, { passive: true });
  window.addEventListener("pointerdown", down, { passive: true });
  window.addEventListener("pointerup", up, { passive: true });
  window.addEventListener("blur", leave);

  // if the pointer never moves (touch, keyboard only) nothing is shown
  onTick(() => {
    if (!s.on) return;
    s.x += (s.tx - s.x) * ease;
    s.y += (s.ty - s.y) * ease;
    ring.style.transform = `translate3d(${s.x.toFixed(2)}px, ${s.y.toFixed(2)}px, 0)`;
  });
}
