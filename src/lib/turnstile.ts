const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      execute: (idOrEl: string | HTMLElement, opts?: Record<string, unknown>) => void;
      reset: (id?: string) => void;
    };
  }
}

let loading: Promise<void> | undefined;

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = SCRIPT_URL;
      s.async = true;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Failed to load the bot check."));
      document.head.appendChild(s);
    });
  }
  return loading;
}

export interface Turnstile {
  // Run the (invisible) challenge and resolve a fresh, single-use token. Rejects
  // if verification fails. Callers await this on submit so the check stays hidden
  // and the user just waits, never sees a widget.
  getToken(): Promise<string>;
  reset(): void;
}

export function createTurnstile(sitekey: string): Turnstile {
  let widgetId: string | undefined;
  let waiters: { ok: (t: string) => void; err: (e: Error) => void }[] = [];
  let starting: Promise<void> | undefined;

  const drain = (fn: (w: (typeof waiters)[number]) => void) => {
    const pending = waiters;
    waiters = [];
    for (const w of pending) fn(w);
  };

  function start(): Promise<void> {
    if (!starting) {
      starting = loadScript().then(() => {
        const host = document.createElement("div");
        host.style.display = "none";
        document.body.appendChild(host);
        widgetId = window.turnstile?.render(host, {
          sitekey,
          action: "turnstile-spin-v1",
          size: "invisible",
          execution: "execute",
          callback: (t: string) => drain((w) => w.ok(t)),
          "error-callback": () =>
            drain((w) =>
              w.err(new Error("Couldn’t verify you’re human. Please try again.")),
            ),
        });
      });
    }
    return starting;
  }

  return {
    async getToken() {
      await start();
      return new Promise<string>((ok, err) => {
        waiters.push({ ok, err });
        if (widgetId !== undefined) {
          window.turnstile?.reset(widgetId);
          window.turnstile?.execute(widgetId);
        } else {
          err(new Error("Failed to load the bot check."));
        }
      });
    },
    reset() {
      if (widgetId !== undefined) window.turnstile?.reset(widgetId);
    },
  };
}
