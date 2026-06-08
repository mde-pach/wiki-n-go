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
export default function MainMenu() {
  const [open, setOpen] = createSignal(false);

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
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
        onClick={() => setOpen(true)}
      >
        <Icons.Menu />
      </button>

      <Show when={open()}>
        <Portal>
          <div class="menu-overlay">
            <button
              type="button"
              class="menu-scrim"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
            />
            <nav class="menu-drawer" aria-label="Main menu">
              <div class="menu-drawer-head">
                <span class="menu-drawer-title">Navigate</span>
                <button
                  type="button"
                  class="btn-icon"
                  aria-label="Close menu"
                  onClick={() => setOpen(false)}
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
