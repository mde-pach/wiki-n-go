export interface DLine {
  num: string;
  sign: string;
  text: string;
  cls: string;
}

// Turn a unified-diff patch into renderable lines, tracking old/new line numbers
// across hunks. File headers (---, +++, diff, index) are dropped.
export function parseDiff(patch: string): DLine[] {
  const out: DLine[] = [];
  let oldLn = 0;
  let newLn = 0;
  for (const line of patch.split("\n")) {
    if (line.startsWith("@@")) {
      const m = line.match(/@@ -(\d+),?\d* \+(\d+),?\d* @@/);
      if (m) {
        oldLn = Number(m[1]);
        newLn = Number(m[2]);
      }
      out.push({ num: "", sign: "", text: line, cls: "hunk" });
    } else if (line.startsWith("+") && !line.startsWith("+++")) {
      out.push({ num: String(newLn++), sign: "+", text: line.slice(1), cls: "add" });
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      out.push({ num: String(oldLn++), sign: "-", text: line.slice(1), cls: "del" });
    } else if (!/^(\+\+\+|---|diff |index )/.test(line)) {
      out.push({
        num: String(newLn++),
        sign: " ",
        text: line.replace(/^ /, ""),
        cls: "",
      });
      oldLn++;
    }
  }
  return out;
}
