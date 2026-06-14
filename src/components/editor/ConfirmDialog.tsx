import { type JSX, onCleanup } from "solid-js";
import { dialogBehavior } from "../../lib/dialog";

export function ConfirmDialog(props: {
  title: string;
  subtitle: JSX.Element;
  body: JSX.Element;
  confirmLabel: string;
  cancelLabel: string;
  busy: boolean;
  wide?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div class="overlay">
      <div
        class={`modal${props.wide ? " modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        ref={(el) => onCleanup(dialogBehavior(el, props.onCancel))}
      >
        <div class="modal-head">
          <div>
            <p class="mh-title">{props.title}</p>
            <p class="mh-sub">{props.subtitle}</p>
          </div>
        </div>
        <div class="modal-body">{props.body}</div>
        <div class="modal-foot">
          <button
            type="button"
            class="btn btn-primary"
            disabled={props.busy}
            onClick={props.onConfirm}
          >
            {props.confirmLabel}
          </button>
          <button type="button" class="btn btn-ghost" onClick={props.onCancel}>
            {props.cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
