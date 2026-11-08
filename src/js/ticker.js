/**
 * One requestAnimationFrame for the whole page.
 * Every moving part subscribes here, so the browser sees a single loop and the
 * work stops completely when the tab is hidden.
 */

const subs = new Set();
let raf = 0;
let last = 0;

function frame(now) {
  raf = requestAnimationFrame(frame);
  const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
  last = now;
  for (const fn of subs) fn(dt, now);
}

function run() {
  if (raf || !subs.size) return;
  last = 0;
  raf = requestAnimationFrame(frame);
}

function halt() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  last = 0;
}

export function onTick(fn) {
  subs.add(fn);
  run();
  return () => {
    subs.delete(fn);
    if (!subs.size) halt();
  };
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) halt();
  else run();
});
