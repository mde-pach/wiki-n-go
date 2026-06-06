// Set/clear the `protection:` frontmatter field with a targeted line edit, so
// the rest of the frontmatter + body are untouched (clean diffs). `tier === null`
// removes the field (page falls back to the env default). Returns the raw page.
export function setProtectionField(raw: string, tier: string | null): string {
  const fm = raw.match(/^(---\r?\n)([\s\S]*?)(\r?\n---\r?\n?)/);
  if (!fm) {
    return tier ? `---\nprotection: ${tier}\n---\n\n${raw}` : raw;
  }
  const [whole, open, inner, close] = fm;
  const line = /^protection:.*$/m;
  let next = inner;
  if (tier) {
    next = line.test(inner)
      ? inner.replace(line, `protection: ${tier}`)
      : `${inner}\nprotection: ${tier}`;
  } else {
    next = inner.replace(/^protection:.*(\r?\n)?/m, "");
  }
  return `${open}${next}${close}${raw.slice(whole.length)}`;
}
