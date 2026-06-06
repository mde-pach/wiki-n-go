import { type Accessor, createResource, createSignal, type Resource } from "solid-js";
import { isServer } from "solid-js/web";
import { config } from "../config";
import { getWhoami, type WhoAmI } from "./api";
import { createTurnstile, type Turnstile } from "./turnstile";
import { errMessage } from "./util";

// createResource that never runs during SSR. Pass a source accessor for resources
// keyed on reactive input (refetched when it changes); omit it to fetch once on
// the client. `undefined` from the source suspends the fetch, as Solid expects.
export function clientResource<T>(fetcher: () => Promise<T>): Resource<T>;
export function clientResource<S, T>(
  source: Accessor<S | undefined>,
  fetcher: (value: S) => Promise<T>,
): Resource<T>;
export function clientResource<S, T>(
  fetcherOrSource: (() => Promise<T>) | Accessor<S | undefined>,
  fetcher?: (value: S) => Promise<T>,
): Resource<T> {
  if (fetcher) {
    const source = fetcherOrSource as Accessor<S | undefined>;
    const [r] = createResource(() => (isServer ? undefined : source()), fetcher);
    return r;
  }
  const [r] = createResource(
    () => (isServer ? undefined : true),
    fetcherOrSource as () => Promise<T>,
  );
  return r;
}

export interface Submit {
  busy: Accessor<boolean>;
  error: Accessor<string | undefined>;
  setError: (msg?: string) => void;
  run: (action: (token: string | undefined) => Promise<void>) => Promise<void>;
}

// The shared "call the Worker" flow: flip busy, clear the error, fetch a Turnstile
// token if configured, run the action, surface any error, reset the widget on
// failure. `mount` is undefined when Turnstile isn't configured.
export function useSubmit(): Submit & { mount: Turnstile["mount"] | undefined } {
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string>();
  const turnstile = config.turnstileSiteKey
    ? createTurnstile(config.turnstileSiteKey)
    : null;

  async function run(action: (token: string | undefined) => Promise<void>) {
    setBusy(true);
    setError(undefined);
    try {
      const token = turnstile ? await turnstile.getToken() : undefined;
      await action(token);
    } catch (e) {
      setError(errMessage(e));
      turnstile?.reset();
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, setError, run, mount: turnstile?.mount };
}

export function useWhoami(): {
  who: Resource<WhoAmI>;
  isMaintainer: Accessor<boolean>;
} {
  const who = clientResource(getWhoami);
  return { who, isMaintainer: () => who()?.tier === "maintainer" };
}
