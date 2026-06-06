import { For } from "solid-js";

export function PagePicker(props: {
  id: string;
  label: string;
  value: string;
  slugs: string[];
  title: (slug: string) => string;
  onChange: (slug: string) => void;
}) {
  return (
    <div class="sp-picker">
      <label for={props.id}>{props.label}</label>
      <select
        id={props.id}
        class="input"
        value={props.value}
        onChange={(e) => props.onChange(e.currentTarget.value)}
      >
        <option value="">Choose a page…</option>
        <For each={props.slugs}>
          {(s) => <option value={s}>{props.title(s)}</option>}
        </For>
      </select>
    </div>
  );
}
