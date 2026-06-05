import { createSignal, onMount } from "solid-js";
import { Icons } from "./Icons";

export default function ThemeToggle() {
  // Render a stable default on the server / first client paint; the actual theme
  // is already applied to <html> by the pre-paint script. Sync after mount.
  const [theme, setThemeS] = createSignal("light");
  const [skin, setSkinS] = createSignal("wiki-n-go");

  onMount(() => {
    setThemeS(document.documentElement.dataset.theme ?? "light");
    setSkinS(document.documentElement.dataset.skin ?? "wiki-n-go");
  });

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
          class={skin() === "wiki-n-go" ? "is-on" : ""}
          onClick={() => setSkin("wiki-n-go")}
        >
          Wiki-n-go
        </button>
        <button
          type="button"
          class={skin() === "wiki" ? "is-on" : ""}
          onClick={() => setSkin("wiki")}
        >
          Wiki
        </button>
      </div>
      <button
        type="button"
        class="btn btn-ghost btn-icon"
        title="Toggle light/dark"
        onClick={() => setTheme(theme() === "dark" ? "light" : "dark")}
      >
        {theme() === "dark" ? <Icons.Sun /> : <Icons.Moon />}
      </button>
    </>
  );
}
