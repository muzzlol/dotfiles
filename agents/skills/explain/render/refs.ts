// Resolves the code a page names with <Ref> and <Diff file>, at the source's base and
// head commits, so the page never copies code it could misquote. Every failure names
// the page line, what was found, and what was expected. See DESIGN.md, "Resolve refs".
import { diffArrays } from "diff";
import { canNameSymbols, highlight, locate, parse, siblings, TSX_GRAMMAR, type Span } from "./code";
import { refKey, type ChangedFile, type CodeLine, type ResolvedRef } from "./src/source";

export type RefRequest = { file: string; symbol?: string; match?: string; at: string };

export type RefContext = {
  base: string;
  head: string;
  files: ChangedFile[];
  /** A file's text at a commit, or undefined when it doesn't exist there. */
  read: (sha: string, path: string) => Promise<string | undefined>;
  /** Paths at a commit, to suggest when a page names a file that doesn't exist. */
  paths: (sha: string) => Promise<string[]>;
  /** A link to lines of a file at a commit, when the host has that commit. */
  link?: (sha: string, path: string, start: number, end: number) => string | undefined;
};

/**
 * Every `<Ref>` and `<Diff file>` in a page, read from its syntax tree. Their props
 * must be string literals so they resolve before the page builds. `written` holds each
 * `<Diff>` whose lines the page wrote itself.
 */
export async function scanRefs(
  page: string,
): Promise<{ source?: string; requests: RefRequest[]; written: Array<{ at: string; text: string }>; errors: string[] }> {
  const requests: RefRequest[] = [];
  const written: Array<{ at: string; text: string }> = [];
  const errors: string[] = [];
  const sources: string[] = [];
  const visit = (node: Awaited<ReturnType<typeof parse>>) => {
    if (node.type === "jsx_opening_element" || node.type === "jsx_self_closing_element") {
      const tag = node.childForFieldName("name")?.text;
      if (tag === "Explanation") {
        const value = node.namedChildren.find((c) => c.type === "jsx_attribute" && c.namedChildren[0]?.text === "source")?.namedChildren[1];
        const literal = value && stringLiteral(value);
        if (literal === undefined) errors.push(`page.tsx:${node.startPosition.row + 1} <Explanation source>: write source as a string literal`);
        else sources.push(literal);
      }
      if (tag === "Ref" || tag === "Diff") {
        const at = `page.tsx:${node.startPosition.row + 1}`;
        const props: Record<string, string> = {};
        for (const attr of node.namedChildren.filter((c) => c.type === "jsx_attribute")) {
          const [name, value] = attr.namedChildren;
          if (!["file", "symbol", "match"].includes(name.text)) continue;
          const literal = value && stringLiteral(value);
          if (literal === undefined) errors.push(`${at} <${tag} ${name.text}>: write ${name.text} as a string literal, so render can resolve it before building`);
          else props[name.text] = literal;
        }
        if (props.file) requests.push({ file: props.file, symbol: props.symbol, match: props.match, at });
        else if (tag === "Ref" && !node.namedChildren.some((c) => c.type === "jsx_attribute" && c.namedChildren[0]?.text === "file"))
          errors.push(`${at} <Ref>: needs file`);
        else if (node.type === "jsx_opening_element") {
          const child = node.parent!.namedChildren.find((c) => c.type === "jsx_expression")?.namedChildren[0];
          const text = child && stringLiteral(node.parent!.namedChildren.find((c) => c.type === "jsx_expression")!);
          if (text !== undefined) written.push({ at, text });
        }
      }
    }
    // A diagram step's code: { file, symbol, match }, opened in place under the step.
    if (node.type === "pair" && node.childForFieldName("key")?.text === "code" && node.childForFieldName("value")?.type === "object") {
      const at = `page.tsx:${node.startPosition.row + 1}`;
      const props: Record<string, string> = {};
      for (const pair of node.childForFieldName("value")!.namedChildren.filter((c) => c.type === "pair")) {
        const name = pair.childForFieldName("key")!.text;
        const value = pair.childForFieldName("value")!;
        if (!["file", "symbol", "match"].includes(name)) continue;
        if (value.type === "string" || (value.type === "template_string" && !value.namedChildren.some((c) => c.type === "template_substitution")))
          props[name] = new Function(`return ${value.text}`)() as string;
        else errors.push(`${at} step code ${name}: write it as a string literal, so render can resolve it before building`);
      }
      if (props.file) requests.push({ file: props.file, symbol: props.symbol, match: props.match, at });
      else errors.push(`${at} step code: needs file`);
    }
    node.namedChildren.forEach(visit);
  };
  visit(await parse(TSX_GRAMMAR, page));
  if (sources.length > 1) errors.push(`the page has ${sources.length} <Explanation> elements; it explains one source`);
  return { source: sources[0], requests, written, errors };
}

/**
 * A `<Diff>` the page wrote is for a before and after in words. A line that is a line
 * of the change, word for word, is copied code, which a resolved `<Diff>` shows instead.
 */
export function copiedCode(written: Array<{ at: string; text: string }>, patch: string): string[] {
  const changed = new Set(
    patch
      .split("\n")
      .filter((l) => /^[-+ ]/.test(l) && !/^(\+\+\+|---) /.test(l))
      .map((l) => l.slice(1).trim())
      .filter((l) => l.length >= 12),
  );
  return written.flatMap(({ at, text }) => {
    const copied = text.split("\n").map((l) => l.replace(/^[-+ ]/, "").trim()).filter((l) => changed.has(l));
    return copied.length
      ? [`${at} <Diff>: copies code from the change (${JSON.stringify(copied[0])}); show it with <Diff file="…" symbol="…" match="…" /> instead`]
      : [];
  });
}

/** The value of a JSX attribute that is a plain string, or undefined. */
function stringLiteral(value: Awaited<ReturnType<typeof parse>>): string | undefined {
  // `name="…"` decodes HTML entities, as JSX does.
  if (value.type === "string") return decodeEntities(value.text.slice(1, -1));
  // `name={"…"}` or a template literal without substitutions: a JS literal.
  const inner = value.type === "jsx_expression" ? value.namedChildren[0] : undefined;
  if (inner?.type === "string" || (inner?.type === "template_string" && !inner.namedChildren.some((c) => c.type === "template_substitution")))
    return new Function(`return ${inner.text}`)() as string;
  return undefined;
}

function decodeEntities(text: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return text.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (m, e: string) =>
    e[0] === "#" ? String.fromCodePoint(parseInt(e.slice(e[1] === "x" ? 2 : 1), e[1] === "x" ? 16 : 10)) : (named[e] ?? m),
  );
}

/** Lines kept around a change or a marked line; the rest of a long span is dropped. */
const KEEP = 12;
/** Lines kept from unchanged code with nothing marked. */
const PLAIN_MAX = 80;
/** Lines kept from code that only one side has, all of which the change added or removed. */
const ONE_SIDED_MAX = 500;

type Side = { sha: string; path: string; text: string; span: Span };

/**
 * Resolves every request. Returns the refs keyed by `refKey`, the color pairs their
 * tokens index into, and one error per request that didn't resolve.
 */
export async function resolveRefs(
  requests: RefRequest[],
  ctx: RefContext,
): Promise<{ refs: Record<string, ResolvedRef>; colors: Array<[string, string]>; errors: string[] }> {
  const refs: Record<string, ResolvedRef> = {};
  const errors: string[] = [];
  const palette = new Map<string, number>();
  const tokenCache = new Map<string, Promise<Array<Array<{ text: string; light: string; dark: string }>>>>();
  const tokensOf = (side: Side) => {
    const key = `${side.sha}:${side.path}`;
    if (!tokenCache.has(key)) tokenCache.set(key, highlight(side.path, side.text));
    return tokenCache.get(key)!;
  };

  for (const req of requests) {
    const key = refKey(req.file, req.symbol, req.match);
    if (refs[key]) continue;
    const label = `${req.at} <Ref file="${req.file}"${req.symbol ? ` symbol="${req.symbol}"` : ""}${req.match ? ` match="${req.match}"` : ""}>`;
    try {
      const { before, after, status, moved, was } = await findSides(req, ctx);
      let lines = await toLines(before, after, moved, tokensOf, palette);
      if (req.match) {
        lines = markMatches(lines, req.match);
        if (!lines.some((l) => l.kind !== "gap" && l.marked)) throw new Error(`no line in it contains "${req.match}"`);
      }
      const shown = after ?? before!;
      const changed = lines.some((l) => l.kind === "+" || l.kind === "-");
      refs[key] = {
        file: shown.path,
        symbol: req.symbol,
        status: status === "found" ? (changed ? "changed" : "unchanged") : status,
        from: before && after && before.path !== after.path ? `${before.path}:${before.span.start + 1}` : undefined,
        was,
        lines: trim(lines, !before || !after),
        url: ctx.link?.(shown.sha, shown.path, shown.span.start + 1, shown.span.end + 1),
      };
    } catch (error) {
      errors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const colors = [...palette.keys()].map((k) => k.split("|") as [string, string]);
  return { refs, colors, errors };
}

/** Where the named code is at base and at head, and how the change touched it. */
async function findSides(
  req: RefRequest,
  ctx: RefContext,
): Promise<{ before?: Side; after?: Side; status: "found" | "added" | "removed" | "moved" | "renamed"; moved: boolean; was?: string }> {
  const changed = ctx.files.find((f) => f.path === req.file || f.from === req.file);
  const headPath = changed?.status === "removed" ? undefined : (changed?.path ?? req.file);
  const basePath = changed?.status === "added" ? undefined : (changed?.from ?? req.file);
  const headText = headPath ? await ctx.read(ctx.head, headPath) : undefined;
  const baseText = basePath ? await ctx.read(ctx.base, basePath) : undefined;
  if (headText === undefined && baseText === undefined) throw new Error(`no such file at either commit.${await suggestFiles(req.file, ctx)}`);

  const whole = (sha: string, path: string, text: string): Side => {
    const end = text.split("\n").length - (text.endsWith("\n") ? 2 : 1);
    return { sha, path, text, span: { start: 0, end, header: [-1, -1], kind: "file" } };
  };
  if (!req.symbol) {
    const before = baseText !== undefined ? whole(ctx.base, basePath!, baseText) : undefined;
    const after = headText !== undefined ? whole(ctx.head, headPath!, headText) : undefined;
    return { before, after, status: before && after ? "found" : after ? "added" : "removed", moved: false };
  }
  if (!canNameSymbols(req.file)) throw new Error(`symbols can't be found in this file type; drop symbol, and use match to mark lines`);

  // An ambiguous name is an error in the file the page named; elsewhere it rules that file out.
  const find = async (sha: string, path: string, text: string | undefined): Promise<Side | undefined> => {
    if (text === undefined || !canNameSymbols(path)) return undefined;
    const result = await locate(path, text, req.symbol!);
    if ("ambiguous" in result && path !== headPath && path !== basePath) return undefined;
    if ("ambiguous" in result) throw new Error(`"${req.symbol}" names ${result.ambiguous.length} definitions in ${path}: ${result.ambiguous.join(", ")}. Name the enclosing one, as in symbol="Outer.${req.symbol}"`);
    return "found" in result ? { sha, path, text, span: result.found } : undefined;
  };
  const after = await find(ctx.head, headPath!, headText);
  const before = await find(ctx.base, basePath!, baseText);
  if (after && before) return { before, after, status: "found", moved: false };

  // Only on one side: it may have been renamed in place.
  const last = req.symbol.split(".").pop()!;
  const renamed = async (side: Side, otherSha: string, otherPath: string | undefined, otherText: string | undefined) => {
    if (otherText === undefined) return undefined;
    const here = new Set((await siblings(side.path, side.text, req.symbol!)).map((d) => d.name));
    let best: { side: Side; name: string; score: number } | undefined;
    for (const d of await siblings(otherPath!, otherText, req.symbol!)) {
      if (d.name === last || here.has(d.name)) continue;
      const candidate: Side = { sha: otherSha, path: otherPath!, text: otherText, span: d.span };
      const score = similarity(candidate, side);
      if (score >= 0.5 && (!best || score > best.score)) best = { side: candidate, name: d.name, score };
    }
    return best;
  };
  if (after) {
    const origin = await renamed(after, ctx.base, basePath, baseText);
    if (origin) return { before: origin.side, after, status: "renamed", moved: false, was: origin.name };
  }
  if (before) {
    const destination = await renamed(before, ctx.head, headPath, headText);
    if (destination) return { before, after: destination.side, status: "renamed", moved: false, was: last };
  }

  // Or it moved to or from another changed file: one that had it and lost it, or gained it.
  // A file that keeps it on both sides holds a copy, not where it moved.
  const others = ctx.files.filter((f) => f.path !== changed?.path);
  if (after) {
    for (const f of others.filter((f) => f.status !== "added")) {
      const origin = await find(ctx.base, f.from ?? f.path, await ctx.read(ctx.base, f.from ?? f.path));
      const kept = f.status !== "removed" && (await find(ctx.head, f.path, await ctx.read(ctx.head, f.path)));
      if (origin && !kept && similarity(origin, after) >= 0.5) return { before: origin, after, status: "moved", moved: true };
    }
    return { after, status: "added", moved: false };
  }
  if (before) {
    for (const f of others.filter((f) => f.status !== "removed")) {
      const destination = await find(ctx.head, f.path, await ctx.read(ctx.head, f.path));
      const had = f.status !== "added" && (await find(ctx.base, f.from ?? f.path, await ctx.read(ctx.base, f.from ?? f.path)));
      if (destination && !had && similarity(before, destination) >= 0.5) return { before, after: destination, status: "moved", moved: true };
    }
    return { before, status: "removed", moved: false };
  }
  const located = await locate(req.file, headText ?? baseText!, req.symbol);
  const candidates = "missing" in located ? located.missing : [];
  throw new Error(`no "${req.symbol}" in ${req.file} at either commit.${candidates.length ? ` Defined there: ${candidates.join(", ")}` : ""}`);
}

function spanLines(side: Side): string[] {
  return side.text.split("\n").slice(side.span.start, side.span.end + 1);
}

/** The share of lines two spans have in common, ignoring indentation. Moved or renamed code keeps at least half. */
function similarity(a: Side, b: Side): number {
  const left = spanLines(a).map((l) => l.trim());
  const right = spanLines(b).map((l) => l.trim());
  const same = diffArrays(left, right)
    .filter((p) => !p.added && !p.removed)
    .reduce((n, p) => n + p.count!, 0);
  return same / Math.max(left.length, right.length);
}

async function toLines(
  before: Side | undefined,
  after: Side | undefined,
  moved: boolean,
  tokensOf: (side: Side) => Promise<Array<Array<{ text: string; light: string; dark: string }>>>,
  palette: Map<string, number>,
): Promise<CodeLine[]> {
  const color = (light: string, dark: string) => {
    const k = `${light}|${dark}`;
    if (!palette.has(k)) palette.set(k, palette.size);
    return palette.get(k)!;
  };
  const line = async (side: Side, row: number, kind: "+" | "-" | " "): Promise<CodeLine> => {
    const tokens: Array<[string, number]> = [];
    for (const t of (await tokensOf(side))[row] ?? []) {
      const prev = tokens[tokens.length - 1];
      const c = color(t.light, t.dark);
      // Whitespace takes any color, so it joins the token before it.
      if (prev && (prev[1] === c || !t.text.trim())) prev[0] += t.text;
      else tokens.push([t.text, c]);
    }
    const header = row >= side.span.header[0] && row <= side.span.header[1];
    return { kind, n: row + 1, tokens, ...(header ? { header: true as const } : {}) };
  };
  const only = after ?? before!;
  if (!before || !after) {
    const out: CodeLine[] = [];
    for (let row = only.span.start; row <= only.span.end; row++) out.push(await line(only, row, " "));
    return out;
  }
  // Moved code compares without indentation; otherwise trailing whitespace is ignored.
  const norm = moved ? (l: string) => l.trim() : (l: string) => l.trimEnd();
  const out: CodeLine[] = [];
  let o = before.span.start;
  let n = after.span.start;
  for (const part of diffArrays(spanLines(before), spanLines(after), { comparator: (a, b) => norm(a) === norm(b) })) {
    for (let i = 0; i < part.count!; i++) {
      if (part.removed) out.push(await line(before, o++, "-"));
      else if (part.added) out.push(await line(after, n++, "+"));
      else {
        out.push(await line(after, n++, " "));
        o++;
      }
    }
  }
  return out;
}

/** Marks lines that hold `match`; a match across lines marks each. Whitespace runs match any whitespace. */
function markMatches(lines: CodeLine[], match: string): CodeLine[] {
  const pattern = new RegExp(match.trim().split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+"), "g");
  const marked = new Set<number>();
  // Search the code as it is now, then as it was, so a match can't span both sides.
  for (const side of [" +", " -"]) {
    const idx = lines.map((l, i) => (l.kind !== "gap" && side.includes(l.kind) ? i : -1)).filter((i) => i >= 0);
    const texts = idx.map((i) => (lines[i] as Extract<CodeLine, { tokens: unknown }>).tokens.map((t) => t[0]).join(""));
    const starts: number[] = [];
    let joined = "";
    for (const t of texts) {
      starts.push(joined.length);
      joined += t + "\n";
    }
    for (const m of joined.matchAll(pattern)) {
      for (let k = 0; k < texts.length; k++) {
        const end = starts[k] + texts[k].length;
        if (starts[k] < m.index + m[0].length && end > m.index) marked.add(idx[k]);
      }
    }
  }
  return lines.map((l, i) => (marked.has(i) && l.kind !== "gap" ? { ...l, marked: true as const } : l));
}

/**
 * Drops lines the page won't need, leaving a gap that says how many: code only one
 * side has ships whole up to a limit, since all of it changed; otherwise lines far from
 * every change and mark go, or, with none, lines past a limit.
 */
function trim(lines: CodeLine[], oneSided: boolean): CodeLine[] {
  const focus = lines.flatMap((l, i) => (l.kind === "+" || l.kind === "-" || (l.kind !== "gap" && l.marked) ? [i] : []));
  const keep = (l: CodeLine, i: number) =>
    (l.kind !== "gap" && l.header) ||
    focus.some((f) => Math.abs(f - i) <= KEEP) ||
    (oneSided ? i < ONE_SIDED_MAX : !focus.length && i < PLAIN_MAX);
  const out: CodeLine[] = [];
  let run: CodeLine[] = [];
  const flush = () => {
    if (run.length >= 4) out.push({ kind: "gap", hidden: run.length });
    else out.push(...run);
    run = [];
  };
  lines.forEach((l, i) => {
    if (keep(l, i)) {
      flush();
      out.push(l);
    } else run.push(l);
  });
  flush();
  return out;
}

async function suggestFiles(file: string, ctx: RefContext): Promise<string> {
  const name = file.split("/").pop()!.toLowerCase();
  const stem = name.replace(/\.[^.]+$/, "");
  const all = [...new Set([...ctx.files.map((f) => f.path), ...(await ctx.paths(ctx.head))])];
  const hits = all.filter((p) => p.toLowerCase().split("/").pop()!.includes(stem)).slice(0, 6);
  const changed = ctx.files.map((f) => f.path);
  return hits.length ? ` Similar paths: ${hits.join(", ")}` : ` Changed files: ${changed.join(", ")}`;
}
