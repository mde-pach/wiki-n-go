import { For, Show } from "solid-js";
import type { Tier } from "../lib/api";

export interface Fields {
  protection: string;
  tags: string;
  hatnote: string;
  bannerKind: string;
  bannerText: string;
  kicker: string;
  image: string;
}

// Frontmatter keys this form owns; everything else (e.g. infobox) is preserved
// verbatim on round-trip.
const MANAGED_KEYS = ["protection", "tags", "hatnote", "banner", "kicker", "image"];

const str = (v: unknown) => (typeof v === "string" ? v : "");

export function fieldsFrom(data: Record<string, unknown>): Fields {
  const b = (data.banner ?? {}) as { kind?: string; text?: string };
  return {
    protection: str(data.protection),
    tags: Array.isArray(data.tags) ? (data.tags as string[]).join(", ") : "",
    hatnote: str(data.hatnote),
    bannerKind: str(b.kind),
    bannerText: str(b.text),
    kicker: str(data.kicker),
    image: str(data.image),
  };
}

export function extraFrom(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(data).filter(([k]) => !MANAGED_KEYS.includes(k)),
  );
}

// Merge the form's fields back over the preserved keys → a frontmatter object.
export function assemble(
  extra: Record<string, unknown>,
  f: Fields,
): Record<string, unknown> {
  const data: Record<string, unknown> = { ...extra };
  const put = (k: string, v: string) => {
    const t = v.trim();
    if (t) data[k] = t;
    else delete data[k];
  };
  put("kicker", f.kicker);
  put("image", f.image);
  put("hatnote", f.hatnote);
  if (f.protection) data.protection = f.protection;
  else delete data.protection;
  const tags = f.tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  if (tags.length) data.tags = tags;
  else delete data.tags;
  const text = f.bannerText.trim();
  if (text) data.banner = { kind: f.bannerKind || "info", text };
  else delete data.banner;
  return data;
}

const TIER_ORDER = ["open", "auto", "extended", "maintainer"] as const;
const rank = (t: string) => Math.max(0, TIER_ORDER.indexOf(t as Tier));

const PROTECTION_OPTIONS: [string, string][] = [
  ["", "Default (reviewed)"],
  ["open", "Open — anyone, publishes instantly"],
  ["auto", "Autoconfirmed editors"],
  ["extended", "Extended-confirmed editors"],
  ["maintainer", "Maintainers only"],
];

export default function PageProperties(props: {
  fields: Fields;
  setField: (k: keyof Fields, v: string) => void;
  tier?: Tier;
}) {
  // You can only change protection if your tier clears the page's current
  // level (the Worker enforces this too; the UI just reflects it).
  const protectionLocked = () =>
    rank(props.tier ?? "open") < rank(props.fields.protection || "maintainer");

  return (
    <details class="props-panel" open>
      <summary>
        <span>Page properties</span>
        <span class="props-hint">metadata stored in the page's frontmatter</span>
      </summary>
      <div class="props-grid">
        <label class="field-label">
          Protection
          <select
            class="input"
            disabled={protectionLocked()}
            value={props.fields.protection}
            onChange={(e) => props.setField("protection", e.currentTarget.value)}
          >
            <For each={PROTECTION_OPTIONS}>
              {([value, label]) => (
                <option
                  value={value}
                  // "Default" means the conservative env default (maintainer),
                  // so removing protection is itself a privileged raise.
                  disabled={
                    (value === "" ? rank("maintainer") : rank(value)) >
                    rank(props.tier ?? "open")
                  }
                >
                  {label}
                </option>
              )}
            </For>
          </select>
          <Show
            when={protectionLocked()}
            fallback={<span class="field-hint">Who is allowed to edit this page.</span>}
          >
            <span class="field-hint">
              Only editors at this level or above can change it.
            </span>
          </Show>
        </label>

        <label class="field-label">
          Categories
          <input
            class="input"
            placeholder="comma, separated, tags"
            value={props.fields.tags}
            onInput={(e) => props.setField("tags", e.currentTarget.value)}
          />
        </label>

        <label class="field-label props-wide">
          Hatnote
          <input
            class="input"
            placeholder="This page is about… For…, see…"
            value={props.fields.hatnote}
            onInput={(e) => props.setField("hatnote", e.currentTarget.value)}
          />
        </label>

        <label class="field-label">
          Banner
          <select
            class="input"
            value={props.fields.bannerKind}
            onChange={(e) => props.setField("bannerKind", e.currentTarget.value)}
          >
            <option value="">None</option>
            <option value="info">Info</option>
            <option value="warn">Warning</option>
          </select>
        </label>
        <label class="field-label">
          Banner text
          <input
            class="input"
            placeholder="e.g. This article needs more citations."
            value={props.fields.bannerText}
            onInput={(e) => props.setField("bannerText", e.currentTarget.value)}
          />
        </label>

        <label class="field-label">
          Infobox kicker
          <input
            class="input"
            placeholder="e.g. Concept"
            value={props.fields.kicker}
            onInput={(e) => props.setField("kicker", e.currentTarget.value)}
          />
        </label>
        <label class="field-label">
          Infobox image
          <input
            class="input"
            placeholder="URL or caption label"
            value={props.fields.image}
            onInput={(e) => props.setField("image", e.currentTarget.value)}
          />
        </label>
      </div>
    </details>
  );
}
