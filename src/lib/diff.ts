export interface DLine {
  num: string;
  sign: string;
  text: string;
  cls: string;
  onum: string; // old-file line number ("" on added lines)
  nnum: string; // new-file line number ("" on removed lines)
  hidden?: DLine[]; // on a collapse marker: the unchanged lines it stands in for
}

// Turn a unified-diff patch into renderable lines, tracking old/new line numbers
// across hunks. File headers (---, +++, diff, index) are dropped. `num` is the
// single number shown in the unified view; `onum`/`nnum` feed the split view.
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
      out.push({ num: "", sign: "", text: line, cls: "hunk", onum: "", nnum: "" });
    } else if (line.startsWith("+") && !line.startsWith("+++")) {
      out.push({
        num: String(newLn),
        sign: "+",
        text: line.slice(1),
        cls: "add",
        onum: "",
        nnum: String(newLn),
      });
      newLn++;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      out.push({
        num: String(oldLn),
        sign: "-",
        text: line.slice(1),
        cls: "del",
        onum: String(oldLn),
        nnum: "",
      });
      oldLn++;
    } else if (!/^(\+\+\+|---|diff |index )/.test(line)) {
      out.push({
        num: String(newLn),
        sign: " ",
        text: line.replace(/^ /, ""),
        cls: "",
        onum: String(oldLn),
        nnum: String(newLn),
      });
      oldLn++;
      newLn++;
    }
  }
  return out;
}

export function diffStats(lines: DLine[]): { add: number; del: number } {
  let add = 0;
  let del = 0;
  for (const l of lines) {
    if (l.cls === "add") add++;
    else if (l.cls === "del") del++;
  }
  return { add, del };
}

export interface Seg {
  t: string;
  changed: boolean;
}
export interface SplitCell {
  num: string;
  segs: Seg[];
}
export interface SplitRow {
  cls: "context" | "add" | "del" | "change" | "hunk";
  text?: string; // hunk header
  left: SplitCell | null;
  right: SplitCell | null;
  hidden?: DLine[]; // on a collapse marker: the unchanged lines it stands in for
}

// Re-shape the unified lines into side-by-side rows: paired removed/added lines
// become a single "change" row (with word-level highlights), unpaired ones get a
// blank cell opposite, and context lines mirror on both sides.
export function splitDiff(lines: DLine[]): SplitRow[] {
  const rows: SplitRow[] = [];
  for (let i = 0; i < lines.length; ) {
    const l = lines[i];
    if (l.cls === "hunk") {
      rows.push({
        cls: "hunk",
        text: l.text,
        left: null,
        right: null,
        hidden: l.hidden,
      });
      i++;
    } else if (l.cls === "") {
      const plain = [{ t: l.text, changed: false }];
      rows.push({
        cls: "context",
        left: { num: l.onum, segs: plain },
        right: { num: l.nnum, segs: plain },
      });
      i++;
    } else {
      const dels: DLine[] = [];
      while (i < lines.length && lines[i].cls === "del") dels.push(lines[i++]);
      const adds: DLine[] = [];
      while (i < lines.length && lines[i].cls === "add") adds.push(lines[i++]);
      const n = Math.max(dels.length, adds.length);
      for (let k = 0; k < n; k++) {
        const d = dels[k];
        const a = adds[k];
        if (d && a) {
          const w = wordDiff(d.text, a.text);
          rows.push({
            cls: "change",
            left: { num: d.onum, segs: w.left },
            right: { num: a.nnum, segs: w.right },
          });
        } else if (d) {
          rows.push({
            cls: "del",
            left: { num: d.onum, segs: [{ t: d.text, changed: true }] },
            right: null,
          });
        } else {
          rows.push({
            cls: "add",
            left: null,
            right: { num: a.nnum, segs: [{ t: a.text, changed: true }] },
          });
        }
      }
    }
  }
  return rows;
}

// Word-level diff of two lines via LCS, so a small edit highlights only the
// changed words instead of the whole line.
export function wordDiff(a: string, b: string): { left: Seg[]; right: Seg[] } {
  const A = tokenize(a);
  const B = tokenize(b);
  const n = A.length;
  const m = B.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] =
        A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);

  const left: Seg[] = [];
  const right: Seg[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      merge(left, A[i], false);
      merge(right, B[j], false);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      merge(left, A[i++], true);
    } else {
      merge(right, B[j++], true);
    }
  }
  while (i < n) merge(left, A[i++], true);
  while (j < m) merge(right, B[j++], true);
  return { left, right };
}

// Line-level diff of two whole documents (LCS), shaped exactly like parseDiff's
// output so DiffView can render an edit that isn't a commit yet (e.g. the submit
// preview). Unchanged runs longer than 2*context collapse to a single hunk
// separator, keeping `context` lines of surroundings. Returns [] when equal.
export function diffLines(a: string, b: string, context = 3): DLine[] {
  const A = a.length ? a.split("\n") : [];
  const B = b.length ? b.split("\n") : [];
  const n = A.length;
  const m = B.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] =
        A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);

  const ops: DLine[] = [];
  let i = 0;
  let j = 0;
  let oldLn = 1;
  let newLn = 1;
  const del = () => {
    ops.push({
      num: String(oldLn),
      sign: "-",
      text: A[i],
      cls: "del",
      onum: String(oldLn),
      nnum: "",
    });
    i++;
    oldLn++;
  };
  const add = () => {
    ops.push({
      num: String(newLn),
      sign: "+",
      text: B[j],
      cls: "add",
      onum: "",
      nnum: String(newLn),
    });
    j++;
    newLn++;
  };
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      ops.push({
        num: String(newLn),
        sign: " ",
        text: A[i],
        cls: "",
        onum: String(oldLn),
        nnum: String(newLn),
      });
      i++;
      j++;
      oldLn++;
      newLn++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) del();
    else add();
  }
  while (i < n) del();
  while (j < m) add();

  return collapseContext(ops, context);
}

function collapseContext(ops: DLine[], context: number): DLine[] {
  const keep = new Array(ops.length).fill(false);
  let changed = false;
  for (let k = 0; k < ops.length; k++) {
    if (ops[k].cls === "add" || ops[k].cls === "del") {
      changed = true;
      for (let d = -context; d <= context; d++) {
        const idx = k + d;
        if (idx >= 0 && idx < ops.length) keep[idx] = true;
      }
    }
  }
  if (!changed) return [];

  const out: DLine[] = [];
  let hidden: DLine[] = [];
  for (let k = 0; k < ops.length; k++) {
    if (!keep[k]) {
      hidden.push(ops[k]);
      continue;
    }
    if (hidden.length > 0) {
      const n = hidden.length;
      out.push({
        num: "",
        sign: "",
        text: `⋯ ${n} unchanged line${n === 1 ? "" : "s"} ⋯`,
        cls: "hunk",
        onum: "",
        nnum: "",
        hidden,
      });
      hidden = [];
    }
    out.push(ops[k]);
  }
  return out;
}

function tokenize(s: string): string[] {
  return s.match(/\s+|[^\s]+/g) ?? [];
}

function merge(arr: Seg[], t: string, changed: boolean): void {
  const last = arr[arr.length - 1];
  if (last && last.changed === changed) last.t += t;
  else arr.push({ t, changed });
}
