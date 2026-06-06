// Git blob SHA of a string — sha1("blob <bytes>\0" + content) — matching what
// the GitHub contents API reports for a file. Lets the editor name the exact
// version it loaded so the Worker can detect a concurrent edit on save.
export async function gitBlobSha(text: string): Promise<string> {
  const body = new TextEncoder().encode(text);
  const header = new TextEncoder().encode(`blob ${body.length}\0`);
  const bytes = new Uint8Array(header.length + body.length);
  bytes.set(header);
  bytes.set(body, header.length);
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
