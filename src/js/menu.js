/** Accessible overlay menu for small screens. */

export function initMenu() {
  const burger = document.querySelector("[data-burger]");
  const menu = document.querySelector("[data-menu]");
  if (!burger || !menu) return;

  const items = () => [...menu.querySelectorAll("a[href], button")];
  let lastFocused = null;
  let closeTimer = 0;
  const open = () => menu.classList.contains("is-open");

  const show = () => {
    clearTimeout(closeTimer);
    lastFocused = document.activeElement;
    menu.hidden = false;
    requestAnimationFrame(() => menu.classList.add("is-open"));
    burger.setAttribute("aria-expanded", "true");
    document.body.dataset.locked = "true";
    setTimeout(() => items()[0]?.focus({ preventScroll: true }), 80);
  };

  const hide = ({ restore = true } = {}) => {
    menu.classList.remove("is-open");
    burger.setAttribute("aria-expanded", "false");
    delete document.body.dataset.locked;
    closeTimer = window.setTimeout(() => {
      menu.hidden = true;
    }, 460);
    if (restore && lastFocused instanceof HTMLElement) lastFocused.focus({ preventScroll: true });
  };

  burger.addEventListener("click", () => (open() ? hide() : show()));
  menu.addEventListener("click", (e) => {
    if (e.target.closest("a")) hide({ restore: false });
  });

  document.addEventListener("keydown", (e) => {
    if (!open()) return;
    if (e.key === "Escape") {
      e.preventDefault();
      hide();
      return;
    }
    if (e.key === "Tab") {
      const list = items();
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  window.addEventListener("resize", () => {
    if (open() && window.innerWidth > 900) hide({ restore: false });
  });
}
