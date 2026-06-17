const UNITS: [number, string][] = [
  [31536000, "y"],
  [2592000, "mo"],
  [604800, "w"],
  [86400, "d"],
  [3600, "h"],
  [60, "m"],
];

export function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  for (const [sec, label] of UNITS)
    if (s >= sec) return `${Math.floor(s / sec)}${label} ago`;
  return "just now";
}

// `YYYY-MM-DD HH:MM` straight from the ISO (UTC) string — locale- and timezone-
// independent, unlike toLocaleString, so it renders identically everywhere and
// never flips on hydration.
export function isoDateTime(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}` : iso;
}
