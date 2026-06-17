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

// The shared scaffold for the page-lifecycle ops (move/merge/split): a titled
// view that needs a source `page` query param, switching between the operation
// form (children) and a success message once `done` is set. Each op supplies only
// its copy, its form, and its success render.
export function PageOp(props: {
  cls: string;
  title: string;
  sub: string;
  from: string;
  // The link label in the "open this from a page's …" hint when no page is given.
  action: string;
  done: string | undefined;
  success: (to: string) => JSX.Element;
  children: JSX.Element;
}) {
  return (
    <div class={props.cls}>
      <ViewHead title={props.title} sub={props.sub} />
      <Show
        when={props.from}
        fallback={
          <Status>
            No page specified — open this from a page's “{props.action}” link.
          </Status>
        }
      >
        <Show when={props.done} fallback={props.children}>
          {(to) => props.success(to())}
        </Show>
      </Show>
    </div>
  );
}
