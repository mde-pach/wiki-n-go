// Non-destructive edit-conflict banner: the textarea keeps the user's text
// (also saved as a local draft), so reloading re-fetches the latest version and
// restores their edit on top of it.
export function ConflictNotice(props: { viewHref: string; onReload: () => void }) {
  return (
    <div class="edit-conflict" role="alert">
      <strong>This page changed while you were editing.</strong>
      <p>
        Your text is safe — it's kept here and saved as a draft on this device. Someone
        else saved a change since you started, so saving now would overwrite theirs.
        Compare the current version, then reload to reapply your edit on top.
      </p>
      <div class="edit-conflict-actions">
        <a class="btn btn-ghost" href={props.viewHref} target="_blank" rel="noreferrer">
          Compare current version
        </a>
        <button type="button" class="btn btn-primary" onClick={props.onReload}>
          Reload latest &amp; keep my text
        </button>
      </div>
    </div>
  );
}
