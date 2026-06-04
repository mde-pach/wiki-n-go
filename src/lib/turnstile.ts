const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
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

export async function renderTurnstile(
  el: HTMLElement,
  sitekey: string,
  onToken: (token: string) => void,
): Promise<void> {
  await loadScript();
  window.turnstile?.render(el, {
    sitekey,
    action: "turnstile-spin-v1",
    callback: onToken,
  });
}
