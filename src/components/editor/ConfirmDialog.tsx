import type { JSX } from "solid-js";

export function ConfirmDialog(props: {
  title: string;
  subtitle: JSX.Element;
  body: JSX.Element;
  confirmLabel: string;
  cancelLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div class="overlay">
      <div class="modal" role="dialog" aria-modal="true">
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
