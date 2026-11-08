/** Copy the Telegram link, with visible + announced confirmation. */

async function write(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
    document.body.append(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}

export function initCopy() {
  document.querySelectorAll("[data-copy]").forEach((button) => {
    const label = button.querySelector("[data-copy-label]");
    const status = document.querySelector("[data-copy-status]");
    const idle = label ? label.textContent : "";
    let timer = 0;

    button.addEventListener("click", async () => {
      const value = button.dataset.copy;
      if (!value) return;
      const ok = await write(value);
      if (status) status.textContent = ok ? "Ссылка скопирована" : "Не удалось скопировать";
      if (!ok) return;
      button.classList.add("is-done");
      if (label) label.textContent = "Скопировано";
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        button.classList.remove("is-done");
        if (label) label.textContent = idle;
      }, 2200);
    });
  });
}
