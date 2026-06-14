import { type JSX, Show } from "solid-js";

// The `view-head` h2+lede block every view opens with. Pass `sub` for a plain
// lede, or `children` when it carries inline markup.
export function ViewHead(props: {
  title: JSX.Element;
  sub?: JSX.Element;
  children?: JSX.Element;
}) {
  return (
    <div class="view-head">
      <h2>{props.title}</h2>
      <Show when={props.sub !== undefined} fallback={props.children}>
        <p>{props.sub}</p>
      </Show>
    </div>
  );
}

export function ErrorNote(props: { msg?: string }) {
  // role="alert" so a screen reader announces async failures (rate-limit, ban,
  // publish error) the moment they appear — they're otherwise silent.
  return (
    <Show when={props.msg}>
      <p class="editor-err" role="alert">
        {props.msg}
      </p>
    </Show>
  );
}

export function Status(props: { children: JSX.Element }) {
  return <p class="wiki-status">{props.children}</p>;
}
