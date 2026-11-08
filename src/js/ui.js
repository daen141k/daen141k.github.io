/** Header state, scroll progress, back-to-top, current year. */

const rafThrottle = (fn) => {
  let tick = false;
  return () => {
    if (tick) return;
    tick = true;
    requestAnimationFrame(() => {
      tick = false;
      fn();
    });
  };
};

export function initUI() {
  const headerEl = document.querySelector("[data-header]");
  const bar = document.querySelector("[data-progress]");
  const toTop = document.querySelector("[data-totop]");

  // in-page navigation: mark the section that currently holds the reading focus
  const links = [...document.querySelectorAll('a[href^="#"]')].filter((a) => {
    const id = a.getAttribute("href");
    return id.length > 1 && document.querySelector(id);
  });
  const targets = [...new Set(links.map((a) => a.getAttribute("href").slice(1)))].map((id) => ({
    id,
    el: document.getElementById(id),
  }));
  let active = "";

  const setActive = (id) => {
    if (id === active) return;
    active = id;
    links.forEach((a) => {
      const on = a.getAttribute("href") === `#${id}`;
      a.classList.toggle("is-active", on);
      if (on) a.setAttribute("aria-current", "location");
      else a.removeAttribute("aria-current");
    });
  };

  /* Last section wins only when it really is on screen. A click marks its
     section active straight away and the spy stays quiet until the smooth
     scroll has landed, otherwise the highlight trails one section behind. */
  let spyLock = 0;

  const spy = () => {
    if (!targets.length) return "";
    const vh = window.innerHeight;
    const y = window.scrollY;
    const max = Math.max(0, document.documentElement.scrollHeight - vh);
    const rows = [];
    for (const t of targets) {
      if (!t.el) continue;
      const r = t.el.getBoundingClientRect();
      if (r.bottom <= 0 || r.top >= vh) continue;
      rows.push({ id: t.id, top: r.top, bottom: r.bottom });
    }
    if (!rows.length) return "";

    // the short last section never reaches the middle of a tall viewport
    if (y >= max - 8) return rows[rows.length - 1].id;

    const line = vh * 0.5;
    let inside = "";
    for (const r of rows) if (r.top <= line && r.bottom > line) inside = r.id;
    if (inside) return inside;

    let best = "";
    let area = 0;
    for (const r of rows) {
      const visible = Math.min(r.bottom, vh) - Math.max(r.top, 0);
      if (visible > area) {
        area = visible;
        best = r.id;
      }
    }
    return best;
  };

  const update = () => {
    const y = window.scrollY;
    if (headerEl) headerEl.classList.toggle("is-scrolled", y > 12);
    if (bar) {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max).toFixed(4) : 0})`;
    }
    if (performance.now() >= spyLock) setActive(spy());
  };

  update();
  window.addEventListener("scroll", rafThrottle(update), { passive: true });
  window.addEventListener("resize", rafThrottle(update));

  if (toTop) {
    toTop.addEventListener("click", () => {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
      document.querySelector(".brand")?.focus({ preventScroll: true });
    });
  }

  /* In-page links scroll explicitly: clicking the same anchor twice used to do
     nothing, which made "Связь" feel broken after the first jump. */
  const header = document.querySelector("[data-header]");
  document.addEventListener("click", (event) => {
    const link = event.target instanceof Element ? event.target.closest('a[href^="#"]') : null;
    if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.button > 0) return;
    const href = link.getAttribute("href");
    if (!href || href.length < 2) return;
    const target = document.getElementById(href.slice(1));
    if (!target) return;
    event.preventDefault();
    const offset = (header?.offsetHeight || 0) + 14;
    const top = target.getBoundingClientRect().top + window.scrollY - offset;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const goal = Math.max(0, Math.round(top));
    const from = window.scrollY;
    const distance = Math.abs(goal - from);
    window.scrollTo({ top: goal, behavior: reduce ? "instant" : "smooth" });
    // a starved main thread can cancel the smooth animation — land anyway
    if (!reduce && distance > 40) {
      window.setTimeout(() => {
        if (Math.abs(window.scrollY - from) < distance * 0.35) {
          window.scrollTo({ top: goal, behavior: "instant" });
        }
      }, 640);
    }
    spyLock = performance.now() + 1300;
    setActive(href.slice(1));
    history.replaceState(null, "", href);
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
  });

  window.addEventListener("hashchange", () => {
    spyLock = 0;
    update();
  });

  document.querySelectorAll("[data-year]").forEach((n) => {
    n.textContent = String(new Date().getFullYear());
  });
}
