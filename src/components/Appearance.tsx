import { createSignal, For, onCleanup, onMount, Show } from "solid-js";

interface Opt {
  v: string;
  label: string;
}
const TEXT: Opt[] = [
  { v: "small", label: "Small" },
  { v: "standard", label: "Standard" },
  { v: "large", label: "Large" },
];
const WIDTH: Opt[] = [
  { v: "standard", label: "Standard" },
  { v: "wide", label: "Wide" },
];
const COLOR: Opt[] = [
  { v: "auto", label: "Automatic" },
  { v: "light", label: "Light" },
  { v: "dark", label: "Dark" },
];
const SKIN: Opt[] = [
  { v: "wiki-n-go", label: "Wiki-n-go" },
  { v: "wiki", label: "Wiki" },
];

// Vector-2022-style Appearance rail: text size, width, color and skin as radio
// lists. The pre-paint script applies the saved values (resolving "Automatic"
// against the OS) before first paint; this handles changes after mount and keeps
// "Automatic" in sync when the OS theme flips.
export default function Appearance() {
  const [textsize, setTextsize] = createSignal("standard");
  const [width, setWidth] = createSignal("standard");
  const [color, setColor] = createSignal("light");
  const [skin, setSkin] = createSignal("wiki-n-go");
  const [collapsed, setCollapsed] = createSignal(false);

  const setText = pick("textsize", "wng-textsize", setTextsize);
  const setW = pick("width", "wng-width", setWidth);
  const setS = pick("skin", "wng-skin", setSkin);
  const setColorPref = (v: string) => {
    localStorage.setItem("wng-theme", v);
    document.documentElement.dataset.theme = resolveColor(v);
    setColor(v);
  };

  onMount(() => {
    setTextsize(localStorage.getItem("wng-textsize") || "standard");
    setWidth(document.documentElement.dataset.width ?? "standard");
    setSkin(document.documentElement.dataset.skin ?? "wiki-n-go");
    setColor(localStorage.getItem("wng-theme") || "light");
    setCollapsed(localStorage.getItem("wng-appearance") === "collapsed");

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onSys = () => {
      if (color() === "auto")
        document.documentElement.dataset.theme = mq.matches ? "dark" : "light";
    };
    mq.addEventListener("change", onSys);
    onCleanup(() => mq.removeEventListener("change", onSys));
  });

  const toggle = () => {
    const next = !collapsed();
    setCollapsed(next);
    localStorage.setItem("wng-appearance", next ? "collapsed" : "open");
  };

  return (
    <aside class="appearance" classList={{ "is-collapsed": collapsed() }}>
      <div class="ap-head">
        <span class="ap-title">Appearance</span>
        <button type="button" class="ap-toggle" onClick={toggle}>
          {collapsed() ? "show" : "hide"}
        </button>
      </div>
      <Show when={!collapsed()}>
        <Section
          label="Text size"
          name="ap-text"
          opts={TEXT}
          value={textsize()}
          on={setText}
        />
        <Section label="Width" name="ap-width" opts={WIDTH} value={width()} on={setW} />
        <Section
          label="Color"
          name="ap-color"
          opts={COLOR}
          value={color()}
          on={setColorPref}
        />
        <Section label="Skin" name="ap-skin" opts={SKIN} value={skin()} on={setS} />
      </Show>
    </aside>
  );
}

function pick(
  key: "textsize" | "width" | "skin",
  store: string,
  set: (v: string) => void,
) {
  return (v: string) => {
    document.documentElement.dataset[key] = v;
    localStorage.setItem(store, v);
    set(v);
  };
}

function resolveColor(pref: string): string {
  if (pref === "dark") return "dark";
  if (pref === "light") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function Section(props: {
  label: string;
  name: string;
  opts: Opt[];
  value: string;
  on: (v: string) => void;
}) {
  return (
    <fieldset class="ap-sec">
      <legend class="ap-sec-title">{props.label}</legend>
      <For each={props.opts}>
        {(o) => (
          <label class="ap-opt">
            <input
              type="radio"
              name={props.name}
              value={o.v}
              checked={props.value === o.v}
              onChange={() => props.on(o.v)}
            />
            <span>{o.label}</span>
          </label>
        )}
      </For>
    </fieldset>
  );
}
