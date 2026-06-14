// Shared modal-dialog behavior for our `role="dialog"` overlays (sign-in,
// confirm-publish): move focus into the dialog on open, trap Tab inside it,
// close on Escape, and restore focus to the previously-focused element on close.
// Wire it on the dialog element via a ref + onCleanup:
//   ref={(el) => onCleanup(dialogBehavior(el, onCancel))}
// Returns a cleanup function (removing it restores focus + detaches listeners).
const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function dialogBehavior(el: HTMLElement, onCancel: () => void): () => void {
  const previouslyFocused = document.activeElement as HTMLElement | null;

  const focusables = (): HTMLElement[] =>
    Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (n) => n.offsetParent !== null || n === document.activeElement,
    );

  // Move focus inside on open (first focusable, else the dialog itself). Deferred
  // to the next frame: the ref fires before the portaled overlay is laid out, so
  // children have no offsetParent yet and would be filtered out.
  requestAnimationFrame(() => {
    const first = focusables()[0];
    if (first) first.focus();
    else {
      el.tabIndex = -1;
      el.focus();
    }
  });

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
      return;
    }
    if (e.key !== "Tab") return;
    const items = focusables();
    if (items.length === 0) return;
    const firstEl = items[0];
    const lastEl = items[items.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (e.shiftKey && active === firstEl) {
      e.preventDefault();
      lastEl.focus();
    } else if (!e.shiftKey && active === lastEl) {
      e.preventDefault();
      firstEl.focus();
    }
  }

  el.addEventListener("keydown", onKeyDown);
  return () => {
    el.removeEventListener("keydown", onKeyDown);
    previouslyFocused?.focus?.();
  };
}
