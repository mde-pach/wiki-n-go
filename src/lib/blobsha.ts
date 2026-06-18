import { createHash } from "node:crypto";

// Git's blob object hash: sha1 of `blob <byteLength>\0` followed by the raw bytes.
// It equals the GitHub trees API `sha` for identical content, so a page rendered
// at build can be compared byte-for-byte against the live per-page sha (from the
// Worker's /version) to decide whether its baked HTML is still current — without
// refetching the file. Build-time only (Node); never imported by a client island.
export function gitBlobSha(raw: string): string {
  const bytes = Buffer.from(raw, "utf8");
  return createHash("sha1")
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest("hex");
}
