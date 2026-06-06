import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "./index";

type Env = Parameters<typeof worker.fetch>[1];

function fakeKV() {
  const m = new Map<string, string>();
  return {
    get: async (k: string) => m.get(k) ?? null,
    put: async (k: string, v: string) => void m.set(k, v),
    delete: async (k: string) => void m.delete(k),
  };
}

function makeEnv(): Env {
  return {
    REPO_NAME: "r",
    REPO_OWNER: "o",
    ALLOWED_ORIGIN: "https://example.test",
    RATE_LIMIT: fakeKV(),
  } as unknown as Env;
}

const get = (path: string) => new Request(`https://w.dev${path}`);

afterEach(() => vi.unstubAllGlobals());

describe("GET /cite", () => {
  it("resolves a DOI via Crossref", async () => {
    vi.stubGlobal("fetch", async (input: string | URL) => {
      const url = String(input);
      expect(url).toContain("api.crossref.org/works/10.1038%2Fx");
      return Response.json({
        message: {
          title: ["Paper"],
          author: [{ given: "J", family: "Doe" }],
          URL: "https://doi.org/10.1038/x",
        },
      });
    });
    const res = await worker.fetch(get("/cite?q=10.1038/x"), makeEnv());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      citation: { title: string };
      markdown: string;
    };
    expect(body.citation.title).toBe("Paper");
    expect(body.markdown).toContain('"Paper."');
  });

  it("resolves an ISBN via OpenLibrary", async () => {
    vi.stubGlobal("fetch", async () =>
      Response.json({
        "ISBN:9780201485677": {
          title: "Refactoring",
          authors: [{ name: "Martin Fowler" }],
          publish_date: "1999",
        },
      }),
    );
    const res = await worker.fetch(get("/cite?q=978-0-201-48567-7"), makeEnv());
    const body = (await res.json()) as {
      citation: { authors: string[]; year: string };
    };
    expect(body.citation.authors).toEqual(["Martin Fowler"]);
    expect(body.citation.year).toBe("1999");
  });

  it("scrapes metadata from an arbitrary URL", async () => {
    vi.stubGlobal("fetch", async () => {
      const r = new Response(
        '<head><meta property="og:title" content="Hello"><meta property="og:site_name" content="Site"></head>',
      );
      Object.defineProperty(r, "url", { value: "https://blog.test/post" });
      return r;
    });
    const res = await worker.fetch(get("/cite?q=https://blog.test/post"), makeEnv());
    const body = (await res.json()) as {
      citation: { title: string; container: string };
    };
    expect(body.citation.title).toBe("Hello");
    expect(body.citation.container).toBe("Site");
  });

  it("rejects private addresses (SSRF guard)", async () => {
    const res = await worker.fetch(get("/cite?q=http://127.0.0.1/secret"), makeEnv());
    expect(res.status).toBe(400);
  });

  it("400s on unrecognized input", async () => {
    const res = await worker.fetch(get("/cite?q=gibberish here"), makeEnv());
    expect(res.status).toBe(400);
  });
});
