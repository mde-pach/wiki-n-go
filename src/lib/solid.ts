import {
  type Accessor,
  createEffect,
  createResource,
  createSignal,
  onCleanup,
  type Resource,
  type ResourceReturn,
} from "solid-js";
import { isServer } from "solid-js/web";
import { getWhoami, type Tier, type WhoAmI } from "./api";
import { solvePow } from "./pow";
import { errMessage } from "./util";

// Trailing-debounced mirror of a reactive value: re-emits `source` only after it
// has stayed unchanged for `ms`. Keeps expensive per-keystroke work (markdown
// re-render, draft autosave) off the hot path. Effects don't run during SSR, so
// the debounced value stays at the initial `source()` there.
export function createDebounced<T>(source: Accessor<T>, ms: number): Accessor<T> {
  const [value, setValue] = createSignal(source());
  createEffect(() => {
    const next = source();
    const id = setTimeout(() => setValue(() => next), ms);
    onCleanup(() => clearTimeout(id));
  });
  return value;
}

// createResource that never runs during SSR — the one place the "no partial
// SSR/hydration" rule is enforced, so islands never re-implement the isServer
// guard. Same `[resource, { mutate, refetch }]` shape as createResource. Pass a
// source accessor for resources keyed on reactive input (refetched when it
// changes); omit it to fetch once on the client. `undefined` from the source
// suspends the fetch, as Solid expects.
export function clientResource<T>(fetcher: () => Promise<T>): ResourceReturn<T>;
export function clientResource<S, T>(
  source: Accessor<S | undefined>,
  fetcher: (value: S) => Promise<T>,
): ResourceReturn<T>;
export function clientResource<S, T>(
  fetcherOrSource: (() => Promise<T>) | Accessor<S | undefined>,
  fetcher?: (value: S) => Promise<T>,
): ResourceReturn<T> {
  if (fetcher) {
    const source = fetcherOrSource as Accessor<S | undefined>;
    return createResource(() => (isServer ? undefined : source()), fetcher);
  }
  return createResource(
    () => (isServer ? undefined : true),
    fetcherOrSource as () => Promise<T>,
  );
}

export interface Submit {
  busy: Accessor<boolean>;
  error: Accessor<string | undefined>;
  setError: (msg?: string) => void;
  run: (action: (token: string | undefined) => Promise<void>) => Promise<void>;
}

// The shared "call the Worker" flow: flip busy, clear the error, solve the
// proof-of-work bot check (a no-op string when it's off), run the action, and
// surface any error. The PoW costs a little CPU here so the Worker doesn't have
// to trust an unauthenticated write blindly.
export function useSubmit(): Submit {
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string>();

  async function run(action: (token: string | undefined) => Promise<void>) {
    setBusy(true);
    setError(undefined);
    try {
      const token = (await solvePow()) || undefined;
      await action(token);
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, setError, run };
}

// The non-PoW sibling of useSubmit, for maintainer/admin forms (already proven
// human via sign-in): same busy/error/run shape, no proof-of-work, and the action
// takes no token. Lets the admin islands drop their hand-rolled try/finally.
export interface FormAction {
  busy: Accessor<boolean>;
  error: Accessor<string | undefined>;
  setError: (msg?: string) => void;
  run: (action: () => Promise<void>) => Promise<void>;
}

export function useFormAction(): FormAction {
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string>();
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, setError, run };
}

// Identity is the same for every island on the page and stable across an in-site
// navigation (the Worker reads it from the cookie). Share one in-flight request
// so the curation bar, auth button, etc. don't each fetch it — and so the bar
// resolves from cache (no flash) when you move between pages. A full reload
// (sign-in/out) drops the module and re-fetches.
let whoamiOnce: Promise<WhoAmI> | undefined;

// Last-known tier, cached like the avatar/providers chrome: lets maintainer-only
// UI (the curation bar) paint on the first frame of a repeat visit instead of
// waiting on the `/whoami` round-trip, then revalidate. Cleared on sign-out.
const TIER_KEY = "wiki_tier";
function cachedTier(): Tier | undefined {
  if (typeof window === "undefined") return undefined;
  return (localStorage.getItem(TIER_KEY) as Tier) || undefined;
}

export function useWhoami(): {
  who: Resource<WhoAmI>;
  isMaintainer: Accessor<boolean>;
} {
  const [who] = clientResource(() => {
    whoamiOnce ??= getWhoami().then((w) => {
      if (typeof window !== "undefined") localStorage.setItem(TIER_KEY, w.tier);
      return w;
    });
    return whoamiOnce;
  });
  return {
    who,
    isMaintainer: () => (who()?.tier ?? cachedTier()) === "maintainer",
  };
}
