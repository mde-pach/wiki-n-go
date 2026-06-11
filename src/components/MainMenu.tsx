import { createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { isServer, Portal } from "solid-js/web";
import { config } from "../config";
import { BASE, changesHref, readHref } from "../lib/paths";
import { Icons } from "./Icons";

interface Link {
  href: string;
  label: string;
  desc: string;
}

const links: Link[] = [
  { href: readHref(config.homeSlug), label: "Home", desc: "The wiki's front page" },
  { href: `${BASE}/help`, label: "Help", desc: "How to read, edit, and format" },
  {
    href: `${BASE}/special`,
    label: "Special pages",
    desc: "Reports, indexes, and tools",
  },
  { href: changesHref, label: "Recent changes", desc: "What's been edited lately" },
  { href: `${BASE}/new`, label: "Create a page", desc: "Start a new article" },
];

// Vector-2022-style main-menu drawer: a left slide-out with the wiki's global
// navigation, surfacing destinations that aren't on the per-page tab bar.
const CLOSE_MS = 180;

export default function MainMenu() {
  const [open, setOpen] = createSignal(false);
  // `closing` plays the reverse slide before unmounting so dismissing animates
  // out the same way it animated in, instead of vanishing instantly (W7).
  const [closing, setClosing] = createSignal(false);
  let closeTimer: number | undefined;

  const show = () => {
    clearTimeout(closeTimer);
    setClosing(false);
    setOpen(true);
  };
  const dismiss = () => {
    if (closing()) return;
    setClosing(true);
    closeTimer = window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, CLOSE_MS);
  };

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    onCleanup(() => window.removeEventListener("keydown", onKey));
  });

  // Keep the page behind the drawer from scrolling while it's open.
  createEffect(() => {
    if (!isServer) document.body.style.overflow = open() ? "hidden" : "";
  });
  onCleanup(() => {
    if (!isServer) document.body.style.overflow = "";
  });

  return (
    <>
      <button
        type="button"
        class="btn-icon menu-btn"
        aria-label="Main menu"
        aria-expanded={open()}
        onClick={show}
      >
        <Icons.Menu />
      </button>

      <Show when={open()}>
        <Portal>
          <div class="menu-overlay" classList={{ closing: closing() }}>
            <button
              type="button"
              class="menu-scrim"
              aria-label="Close menu"
              onClick={dismiss}
            />
            <nav class="menu-drawer" aria-label="Main menu">
              <div class="menu-drawer-head">
                <span class="menu-drawer-title">Navigate</span>
                <button
                  type="button"
                  class="btn-icon"
                  aria-label="Close menu"
                  onClick={dismiss}
                >
                  <Icons.Close />
                </button>
              </div>
              <ul class="menu-links">
                <For each={links}>
                  {(l) => (
                    <li>
                      <a class="menu-link" href={l.href}>
                        <span class="menu-link-label">{l.label}</span>
                        <span class="menu-link-desc">{l.desc}</span>
                      </a>
                    </li>
                  )}
                </For>
              </ul>
            </nav>
          </div>
        </Portal>
      </Show>
    </>
  );
}
