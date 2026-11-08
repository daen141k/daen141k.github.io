/** Moscow time (UTC+3) — the only timezone shown on the page. */

const zone = (() => {
  try {
    return new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", hour: "2-digit", minute: "2-digit", hour12: false });
  } catch {
    return null;
  }
})();

export function initClock() {
  const nodes = document.querySelectorAll("[data-clock]");
  if (!nodes.length) return;

  const tick = () => {
    const now = new Date();
    let value;
    if (zone) value = zone.format(now);
    else {
      const msk = new Date(now.getTime() + 3 * 3600 * 1000);
      value = `${String(msk.getUTCHours()).padStart(2, "0")}:${String(msk.getUTCMinutes()).padStart(2, "0")}`;
    }
    nodes.forEach((n) => {
      n.textContent = value;
      n.setAttribute("datetime", now.toISOString());
    });
  };

  tick();
  const toNextMinute = (60 - new Date().getSeconds()) * 1000;
  setTimeout(() => {
    tick();
    setInterval(tick, 20000);
  }, toNextMinute);
}
