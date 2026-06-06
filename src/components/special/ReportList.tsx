import { For, type JSX, Show } from "solid-js";
import { readHref } from "../../lib/paths";
import { Status } from "../ui";

export function ReportList<T>(props: {
  items: T[];
  empty: string;
  render?: (item: T) => JSX.Element;
  trailing?: (item: T) => JSX.Element;
}) {
  return (
    <Show when={props.items.length > 0} fallback={<Status>{props.empty}</Status>}>
      <ul class="special-list">
        <For each={props.items}>
          {(item) => (
            <li>
              {props.render ? props.render(item) : defaultRow(item as string)}
              {props.trailing?.(item)}
            </li>
          )}
        </For>
      </ul>
    </Show>
  );
}

function defaultRow(slug: string): JSX.Element {
  return <a href={readHref(slug)}>{slug}</a>;
}
