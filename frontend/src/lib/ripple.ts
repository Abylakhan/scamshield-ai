/** Material-style click ripple for every .btn* button, installed once for the whole app (CSS in index.css). */
export function installRipple() {
  if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  document.addEventListener("pointerdown", (e) => {
    const target = (e.target as HTMLElement | null)?.closest<HTMLElement>(".btn, .btn-primary, .btn-ghost, .btn-danger");
    if (!target || (target as HTMLButtonElement).disabled) return;
    const rect = target.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2;
    const span = document.createElement("span");
    span.className = "ripple";
    span.style.width = span.style.height = `${size}px`;
    span.style.left = `${e.clientX - rect.left - size / 2}px`;
    span.style.top = `${e.clientY - rect.top - size / 2}px`;
    if (getComputedStyle(target).position === "static") target.style.position = "relative";
    target.style.overflow = "hidden";
    target.appendChild(span);
    span.addEventListener("animationend", () => span.remove(), { once: true });
  }, { passive: true });
}
