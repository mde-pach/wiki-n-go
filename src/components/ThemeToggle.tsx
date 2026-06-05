import { createSignal } from "solid-js";

export default function ThemeToggle() {
  const [theme, setThemeS] = createSignal(
    document.documentElement.dataset.theme ?? "light",
  );
  const [skin, setSkinS] = createSignal(
    document.documentElement.dataset.skin ?? "editorial",
  );

  const setTheme = (t: string) => {
    document.documentElement.dataset.theme = t;
    localStorage.setItem("wng-theme", t);
    setThemeS(t);
  };
  const setSkin = (s: string) => {
    document.documentElement.dataset.skin = s;
    localStorage.setItem("wng-skin", s);
    setSkinS(s);
  };

  return (
    <>
      <div class="seg" role="group" aria-label="Skin">
        <button
          type="button"
          class={skin() === "editorial" ? "is-on" : ""}
          onClick={() => setSkin("editorial")}
        >
          Editorial
        </button>
        <button
          type="button"
          class={skin() === "vector" ? "is-on" : ""}
          onClick={() => setSkin("vector")}
        >
          Vector
        </button>
      </div>
      <button
        type="button"
        class="btn btn-ghost btn-icon"
        title="Toggle light/dark"
        onClick={() => setTheme(theme() === "dark" ? "light" : "dark")}
      >
        {theme() === "dark" ? "☀" : "☾"}
      </button>
    </>
  );
}
