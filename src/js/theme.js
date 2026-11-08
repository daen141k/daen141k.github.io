/** Light / dark theme with localStorage memory and a soft cross-fade. */

const KEY = "daen141kk:theme";
const root = document.documentElement;
const meta = document.querySelector('meta[name="theme-color"]');
const COLORS = { light: "#f6f8f4", dark: "#0b0f0e" };

export function initTheme() {
  const toggles = [...document.querySelectorAll("[data-theme-toggle]")];
  const listeners = new Set();
  let timer = 0;

  const current = () => (root.dataset.theme === "dark" ? "dark" : "light");

  const paint = (next, { animate = true, persist = true } = {}) => {
    if (animate) {
      root.classList.add("is-theming");
      clearTimeout(timer);
      timer = window.setTimeout(() => root.classList.remove("is-theming"), 640);
    }
    root.dataset.theme = next;
    root.style.colorScheme = next;
    if (meta) meta.setAttribute("content", COLORS[next]);
    toggles.forEach((btn) => {
      btn.setAttribute("aria-pressed", String(next === "dark"));
      btn.setAttribute("aria-label", next === "dark" ? "Включить светлую тему" : "Включить тёмную тему");
      const label = btn.querySelector("[data-theme-label]");
      if (label) label.textContent = next === "dark" ? "Dark" : "Light";
    });
    if (persist) {
      try {
        localStorage.setItem(KEY, next);
      } catch {
        /* private mode */
      }
    }
    listeners.forEach((fn) => fn(next));
  };

  let saved = null;
  try {
    saved = localStorage.getItem(KEY);
  } catch {
    saved = null;
  }
  paint(saved === "light" ? "light" : "dark", { animate: false, persist: false });

  toggles.forEach((btn) => {
    btn.addEventListener("click", () => paint(current() === "dark" ? "light" : "dark"));
  });

  return {
    get: current,
    set: paint,
    onChange: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
