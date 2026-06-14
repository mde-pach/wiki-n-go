import { HttpError } from "./http";

// SSRF guard for the one place the Worker fetches arbitrary user-supplied URLs
// (citation lookup). The old guard was a string regex on the hostname, which
// missed decimal/octal/hex/IPv6 IP literals and never re-checked redirect hops —
// so a public URL could 30x to http://169.254.169.254/ (cloud metadata). This
// parses numeric IP literals the way inet_aton/browsers do and range-checks them,
// and `fetchGuarded` follows redirects manually, re-validating every hop.

type Ip = { family: 4 | 6; bytes: number[] };

// Parse an IPv4 literal in any inet_aton form (1–4 parts, decimal/octal/hex).
// Returns null if it isn't a numeric IPv4 literal (e.g. a DNS name).
function parseIpv4(host: string): Ip | null {
  if (!/^[0-9a-fx.]+$/i.test(host)) return null;
  const parts = host.split(".");
  if (parts.length === 0 || parts.length > 4) return null;
  const nums: number[] = [];
  for (const p of parts) {
    if (p === "") return null;
    let n: number;
    if (/^0x[0-9a-f]+$/i.test(p)) n = parseInt(p.slice(2), 16);
    else if (/^0[0-7]+$/.test(p)) n = parseInt(p, 8);
    else if (/^[0-9]+$/.test(p)) n = parseInt(p, 10);
    else return null;
    if (!Number.isFinite(n) || n < 0) return null;
    nums.push(n);
  }
  // Combine per inet_aton: the last part absorbs the remaining bytes.
  const last = nums[nums.length - 1];
  const lead = nums.slice(0, -1);
  if (lead.some((b) => b > 255)) return null;
  const maxLast = 2 ** (8 * (4 - lead.length));
  if (last >= maxLast) return null;
  const bytes = [...lead];
  for (let i = 0; i < 4 - lead.length; i++) {
    bytes.push((last >>> (8 * (4 - lead.length - 1 - i))) & 0xff);
  }
  return { family: 4, bytes };
}

// Parse a bracketed or bare IPv6 literal into 16 bytes. Handles `::` compression
// and IPv4-mapped tails (::ffff:127.0.0.1). Returns null if not IPv6.
function parseIpv6(raw: string): Ip | null {
  let h = raw;
  if (h.startsWith("[") && h.endsWith("]")) h = h.slice(1, -1);
  if (!h.includes(":")) return null;
  h = h.replace(/%.*$/, ""); // strip zone id
  const halves = h.split("::");
  if (halves.length > 2) return null;
  const toGroups = (s: string): number[] | null => {
    if (s === "") return [];
    const out: number[] = [];
    for (const g of s.split(":")) {
      if (/^[0-9a-f]{1,4}$/i.test(g)) {
        out.push(parseInt(g, 16));
      } else if (/^\d+\.\d+\.\d+\.\d+$/.test(g)) {
        const v4 = parseIpv4(g);
        if (!v4) return null;
        out.push((v4.bytes[0] << 8) | v4.bytes[1], (v4.bytes[2] << 8) | v4.bytes[3]);
      } else return null;
    }
    return out;
  };
  const head = toGroups(halves[0]);
  const tail = halves.length === 2 ? toGroups(halves[1]) : [];
  if (!head || !tail) return null;
  const groups =
    halves.length === 2
      ? [...head, ...Array(8 - head.length - tail.length).fill(0), ...tail]
      : head;
  if (groups.length !== 8 || groups.some((g) => g < 0 || g > 0xffff)) return null;
  const bytes: number[] = [];
  for (const g of groups) bytes.push((g >> 8) & 0xff, g & 0xff);
  return { family: 6, bytes };
}

function v4Reserved(b: number[]): boolean {
  const [a, b1] = b;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 169 && b1 === 254) return true; // link-local incl. cloud metadata
  if (a === 172 && b1 >= 16 && b1 <= 31) return true; // private
  if (a === 192 && b1 === 168) return true; // private
  if (a === 100 && b1 >= 64 && b1 <= 127) return true; // CGNAT 100.64/10
  if (a === 192 && b1 === 0 && b[2] === 0) return true; // 192.0.0/24
  if (a >= 224) return true; // multicast + reserved (224/4, 240/4)
  return false;
}

function ipReserved(ip: Ip): boolean {
  if (ip.family === 4) return v4Reserved(ip.bytes);
  const b = ip.bytes;
  const allZeroBut1 = b.slice(0, 15).every((x) => x === 0);
  if (allZeroBut1 && (b[15] === 0 || b[15] === 1)) return true; // :: and ::1
  if ((b[0] & 0xfe) === 0xfc) return true; // fc00::/7 unique-local
  if (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) return true; // fe80::/10 link-local
  // IPv4-mapped/compatible (::ffff:a.b.c.d / ::a.b.c.d) → check the embedded v4
  const first10Zero = b.slice(0, 10).every((x) => x === 0);
  if (first10Zero && b[10] === 0xff && b[11] === 0xff) {
    return v4Reserved(b.slice(12));
  }
  if (first10Zero && b[10] === 0 && b[11] === 0) {
    return v4Reserved(b.slice(12));
  }
  return false;
}

// True for a hostname we must refuse to fetch: any IP literal in a reserved
// range, or an internal-looking DNS name. DNS names that resolve to private IPs
// (DNS rebinding) are a known residual risk we can't fully close in-Worker (no
// resolve-and-pin); the per-hop literal re-check in fetchGuarded covers the
// common metadata-via-redirect case, which is the realistic exploit.
export function isBlockedHost(hostname: string): boolean {
  const ip = parseIpv6(hostname) ?? parseIpv4(hostname);
  if (ip) return ipReserved(ip);
  const h = hostname.toLowerCase().replace(/\.$/, "");
  return (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h.endsWith(".internal") ||
    h.endsWith(".local")
  );
}

export function assertFetchableUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpError(400, "Invalid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new HttpError(400, "Only http(s) URLs are supported.");
  if (isBlockedHost(url.hostname))
    throw new HttpError(400, "Refusing to fetch a private address.");
  return url;
}

// Fetch following redirects manually so every hop's target is re-validated —
// `redirect:"follow"` would let a public URL bounce to a private one unchecked.
// Returns the final response plus the URL actually fetched (for `res.url`).
export async function fetchGuarded(
  raw: string,
  init: RequestInit,
  maxHops = 5,
): Promise<{ res: Response; finalUrl: string }> {
  let current = assertFetchableUrl(raw).toString();
  for (let hop = 0; hop <= maxHops; hop++) {
    const res = await fetch(current, { ...init, redirect: "manual" });
    const loc =
      res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (!loc) return { res, finalUrl: current };
    current = assertFetchableUrl(new URL(loc, current).toString()).toString();
  }
  throw new HttpError(422, "Too many redirects.");
}
