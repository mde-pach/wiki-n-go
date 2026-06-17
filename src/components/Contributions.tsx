import { For, Show } from "solid-js";
import { type Contribution, getContributions } from "../lib/contributions";
import { repoWebUrl } from "../lib/engine";
import { timeAgo } from "../lib/format";
import { prettify, readHref } from "../lib/paths";
import { clientResource } from "../lib/solid";
import { Status, ViewHead } from "./ui";

const TIER_LABEL: Record<string, string> = {
  open: "New contributor",
  auto: "Autoconfirmed",
  extended: "Extended-confirmed",
  maintainer: "Maintainer",
};

function commitUrl(sha: string): string {
  return repoWebUrl(`/commit/${sha}`);
}

const net = (c: Contribution) => c.additions - c.deletions;

// Auto-rendered stats panel beside the editable user page: the identity's edit
// history (direct commits + merged PRs) newest-first plus its trust tier. Mirrors
// the Recent-changes data shape and markup; links out to the existing diff views.
export default function Contributions(props: { login: string }) {
  const [data] = clientResource(() => props.login, getContributions);
  const rows = () => data()?.contributions ?? [];

  return (
    <section class="contribs">
      <ViewHead
        title="Contributions"
        sub="Edits by this user, newest first — from the wiki's git history."
      />
      <Show when={data()} fallback={<Status>Loading contributions…</Status>}>
        {(d) => (
          <>
            <p class="contribs-tier">
              <span class="chip">{TIER_LABEL[d().tier] ?? d().tier}</span>
              <span class="dot">·</span>
              {rows().length} edit{rows().length === 1 ? "" : "s"}
            </p>
            <Show when={rows().length > 0} fallback={<Status>No edits yet.</Status>}>
              <ul class="rc-list">
                <For each={rows()}>
                  {(c) => (
                    <li class="rc-row">
                      <span class="rc-time">{timeAgo(c.date)}</span>
                      <span class="rc-pages">
                        <Show when={c.slugs.length > 0} fallback={<span>—</span>}>
                          <For each={c.slugs}>
                            {(s, i) => (
                              <>
                                {i() > 0 ? ", " : ""}
                                <a href={readHref(s)}>{prettify(s)}</a>
                              </>
                            )}
                          </For>
                        </Show>
                      </span>
                      <span class={`rc-delta ${net(c) >= 0 ? "pos" : "neg"}`}>
                        {net(c) >= 0 ? "+" : "−"}
                        {Math.abs(net(c))}
                      </span>
                      <span class="rc-summary">
                        {c.message}
                        <Show when={c.created.length > 0}>
                          <span class="rc-tag">new page</span>
                        </Show>
                      </span>
                      <span class="rc-actions">
                        <Show when={c.slugs[0]}>
                          {(s) => (
                            <a class="link-btn" href={`${readHref(s())}?rev=${c.sha}`}>
                              permalink
                            </a>
                          )}
                        </Show>
                        <a
                          class="link-btn"
                          href={commitUrl(c.sha)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          diff
                        </a>
                      </span>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </>
        )}
      </Show>
    </section>
  );
}
