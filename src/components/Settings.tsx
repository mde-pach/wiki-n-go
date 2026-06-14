import { createMemo, createSignal, Show } from "solid-js";
import { saveSiteConfig } from "../lib/admin";
import { loadSiteConfig, type WikigitConfig } from "../lib/site-config";
import { clientResource, useWhoami } from "../lib/solid";
import { errMessage } from "../lib/util";
import { ErrorNote, Status, ViewHead } from "./ui";

type Appearance = NonNullable<WikigitConfig["appearance"]>;
const APPEARANCE: { key: keyof Appearance; label: string; options: string[] }[] = [
  { key: "skin", label: "Skin", options: ["wikigit", "wiki"] },
  { key: "theme", label: "Theme", options: ["light", "dark", "auto"] },
  { key: "width", label: "Width", options: ["standard", "wide"] },
  { key: "textsize", label: "Text size", options: ["small", "standard", "large"] },
];

// One login per line. Trimmed, blanks dropped — the Engine re-validates and
// unions these with the grant/revoke list when resolving maintainer tier.
function parseMaintainers(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

// One line per language, "code  Name" (e.g. "fr  Français"). Empty → inherit the
// platform default set, so a non-technical owner can leave it blank.
function parseLanguages(text: string): { code: string; name: string }[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [code, ...name] = l.split(/\s+/);
      return { code, name: name.join(" ") || code };
    });
}

export default function Settings() {
  const { isMaintainer } = useWhoami();
  const loaded = clientResource(loadSiteConfig);

  const [saved, setSaved] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [err, setErr] = createSignal<string>();
  const [form, setForm] = createSignal<WikigitConfig>({});

  // Seed the form from the loaded config once it arrives.
  const initial = createMemo(() => {
    const c = loaded();
    if (c) setForm({ ...c, languages: c.languages });
    return c;
  });

  const field = <K extends keyof WikigitConfig>(key: K, value: WikigitConfig[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  };

  async function save() {
    setBusy(true);
    setErr();
    try {
      const f = form();
      await saveSiteConfig({
        title: f.title,
        tagline: f.tagline,
        description: f.description,
        homeSlug: f.homeSlug,
        defaultLang: f.defaultLang,
        languages: f.languages,
        appearance: f.appearance,
        signin: f.signin,
        maintainers: f.maintainers,
      });
      setSaved(true);
    } catch (e) {
      setErr(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main id="main" class="view-wrap settings-page">
      <ViewHead
        title="Wiki settings"
        sub="Your wiki's name, languages and appearance. Saved to your repo as wikigit.json — no code, no rebuild."
      />

      <Show
        when={isMaintainer()}
        fallback={
          <Status>
            Only a maintainer can change settings. Sign in with a maintainer account to
            edit them.
          </Status>
        }
      >
        <Show when={initial()} fallback={<Status>Loading settings…</Status>}>
          <div class="settings-grid">
            <label class="settings-field">
              <span>Title</span>
              <input
                class="input"
                value={form().title ?? ""}
                placeholder="Wikigit"
                onInput={(e) => field("title", e.currentTarget.value)}
              />
            </label>
            <label class="settings-field">
              <span>Tagline</span>
              <input
                class="input"
                value={form().tagline ?? ""}
                placeholder="the open reference"
                onInput={(e) => field("tagline", e.currentTarget.value)}
              />
            </label>
            <label class="settings-field settings-wide">
              <span>Description</span>
              <input
                class="input"
                value={form().description ?? ""}
                placeholder="A short description of your wiki (used for search engines)."
                onInput={(e) => field("description", e.currentTarget.value)}
              />
            </label>
            <label class="settings-field">
              <span>Home page slug</span>
              <input
                class="input"
                value={form().homeSlug ?? ""}
                placeholder="index"
                onInput={(e) => field("homeSlug", e.currentTarget.value)}
              />
            </label>
            <label class="settings-field">
              <span>Default language code</span>
              <input
                class="input"
                value={form().defaultLang ?? ""}
                placeholder="en"
                onInput={(e) => field("defaultLang", e.currentTarget.value)}
              />
            </label>

            {APPEARANCE.map((a) => (
              <label class="settings-field">
                <span>{a.label}</span>
                <select
                  class="input"
                  value={form().appearance?.[a.key] ?? ""}
                  onChange={(e) =>
                    field("appearance", {
                      ...form().appearance,
                      [a.key]: e.currentTarget.value || undefined,
                    })
                  }
                >
                  <option value="">(default)</option>
                  {a.options.map((o) => (
                    <option value={o}>{o}</option>
                  ))}
                </select>
              </label>
            ))}

            <label class="settings-field settings-wide">
              <span>Languages — one per line, "code Name" (blank = default set)</span>
              <textarea
                class="input"
                rows={3}
                placeholder={"en English\nfr Français"}
                onInput={(e) =>
                  field("languages", parseLanguages(e.currentTarget.value))
                }
              >
                {(form().languages ?? []).map((l) => `${l.code} ${l.name}`).join("\n")}
              </textarea>
            </label>

            <label class="settings-field settings-wide">
              <span>Maintainers — one login per line (e.g. a GitHub login)</span>
              <textarea
                class="input"
                rows={3}
                placeholder={"alice\nbob"}
                onInput={(e) =>
                  field("maintainers", parseMaintainers(e.currentTarget.value))
                }
              >
                {(form().maintainers ?? []).join("\n")}
              </textarea>
            </label>

            <label class="settings-field settings-check">
              <input
                type="checkbox"
                checked={form().signin ?? true}
                onChange={(e) => field("signin", e.currentTarget.checked)}
              />
              <span>Offer sign-in (attribution). Anonymous editing always works.</span>
            </label>
          </div>

          <div class="settings-actions">
            <button
              type="button"
              class="btn btn-primary"
              disabled={busy()}
              onClick={save}
            >
              {busy() ? "Saving…" : "Save settings"}
            </button>
            <Show when={saved()}>
              <span class="settings-saved">Saved ✓ — changes are live.</span>
            </Show>
          </div>
          <ErrorNote msg={err()} />
        </Show>
      </Show>
    </main>
  );
}
