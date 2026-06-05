import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { Icons } from "./Icons";

interface Opt {
  v: string;
  label: string;
}
const COLOR: Opt[] = [
  { v: "light", label: "Light" },
  { v: "dark", label: "Dark" },
];
const WIDTH: Opt[] = [
  { v: "standard", label: "Standard" },
  { v: "wide", label: "Wide" },
];
const SKIN: Opt[] = [
  { v: "wiki-n-go", label: "Wiki-n-go" },
  { v: "wiki", label: "Wiki" },
];

// Vector-2022-style Appearance menu: color, reading width and skin in one panel.
// The pre-paint script in the page <head> applies the saved values before first
// paint; this only handles changes after mount.
export default function Appearance() {
  const [open, setOpen] = createSignal(false);
  const [theme, setTheme] = createSignal("light");
  const [width, setWidth] = createSignal("standard");
  const [skin, setSkin] = createSignal("wiki-n-go");
  let root: HTMLDivElement | undefined;

  const bind =
    (key: "theme" | "width" | "skin", store: string, set: (v: string) => void) =>
    (v: string) => {
      document.documentElement.dataset[key] = v;
      localStorage.setItem(store, v);
      set(v);
    };
  const setColor = bind("theme", "wng-theme", setTheme);
  const setW = bind("width", "wng-width", setWidth);
  const setS = bind("skin", "wng-skin", setSkin);

  onMount(() => {
    const d = document.documentElement.dataset;
    setTheme(d.theme ?? "light");
    setWidth(d.width ?? "standard");
    setSkin(d.skin ?? "wiki-n-go");
    const onDoc = (e: MouseEvent) => {
      if (root && !root.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("click", onDoc);
    document.addEventListener("keydown", onKey);
    onCleanup(() => {
      document.removeEventListener("click", onDoc);
      document.removeEventListener("keydown", onKey);
    });
  });

  return (
    <div class="appearance" ref={root}>
      <button
        type="button"
        class="btn btn-ghost btn-sm appearance-btn"
        aria-haspopup="dialog"
        aria-expanded={open()}
        onClick={() => setOpen(!open())}
      >
        <Show when={theme() === "dark"} fallback={<Icons.Sun />}>
          <Icons.Moon />
        </Show>
        <span class="ap-btn-label">Appearance</span>
      </button>
      <Show when={open()}>
        <div class="ap-panel" role="dialog" aria-label="Appearance">
          <Group label="Color" opts={COLOR} value={theme()} on={setColor} />
          <Group label="Width" opts={WIDTH} value={width()} on={setW} />
          <Group label="Skin" opts={SKIN} value={skin()} on={setS} />
        </div>
      </Show>
    </div>
  );
}

function Group(props: {
  label: string;
  opts: Opt[];
  value: string;
  on: (v: string) => void;
}) {
  return (
    <div class="ap-row">
      <span class="ap-label">{props.label}</span>
      <div class="seg" role="group" aria-label={props.label}>
        <For each={props.opts}>
          {(o) => (
            <button
              type="button"
              class={props.value === o.v ? "is-on" : ""}
              aria-pressed={props.value === o.v}
              onClick={() => props.on(o.v)}
            >
              {o.label}
            </button>
          )}
        </For>
      </div>
    </div>
  );
}
