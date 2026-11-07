// Language-aware helpers for resolving code at build time. tree-sitter finds where a
// symbol is defined in any language with a grammar; Shiki turns code into tokens the
// page colors with CSS. Neither ships in the page. [twoslash; Code Hike]
import { join } from "node:path";
import { createHighlighter, type BundledLanguage, type Highlighter } from "shiki";
import { Language, Parser, type Node } from "web-tree-sitter";

const MODULES = join(import.meta.dir, "node_modules");
const VSCODE = "@vscode/tree-sitter-wasm/wasm";

/** Grammar and highlighting per file type. A type without a grammar can't name symbols. */
const LANGUAGES: Array<{ test: RegExp; grammar?: string; highlight: string }> = [
  { test: /\.(ts|mts|cts)$/, grammar: `${VSCODE}/tree-sitter-typescript.wasm`, highlight: "typescript" },
  { test: /\.tsx$/, grammar: `${VSCODE}/tree-sitter-tsx.wasm`, highlight: "tsx" },
  { test: /\.(js|mjs|cjs|jsx)$/, grammar: `${VSCODE}/tree-sitter-javascript.wasm`, highlight: "jsx" },
  { test: /\.py$/, grammar: `${VSCODE}/tree-sitter-python.wasm`, highlight: "python" },
  { test: /\.go$/, grammar: `${VSCODE}/tree-sitter-go.wasm`, highlight: "go" },
  { test: /\.rs$/, grammar: `${VSCODE}/tree-sitter-rust.wasm`, highlight: "rust" },
  { test: /\.(sh|bash|zsh)$/, grammar: `${VSCODE}/tree-sitter-bash.wasm`, highlight: "bash" },
  { test: /\.java$/, grammar: `${VSCODE}/tree-sitter-java.wasm`, highlight: "java" },
  { test: /\.cs$/, grammar: `${VSCODE}/tree-sitter-c-sharp.wasm`, highlight: "csharp" },
  { test: /\.rb$/, grammar: `${VSCODE}/tree-sitter-ruby.wasm`, highlight: "ruby" },
  { test: /\.php$/, grammar: `${VSCODE}/tree-sitter-php.wasm`, highlight: "php" },
  { test: /\.jsonc?$/, grammar: "tree-sitter-json/tree-sitter-json.wasm", highlight: "jsonc" },
  { test: /\.ya?ml$/, grammar: "@tree-sitter-grammars/tree-sitter-yaml/tree-sitter-yaml.wasm", highlight: "yaml" },
  { test: /\.toml$/, grammar: "@tree-sitter-grammars/tree-sitter-toml/tree-sitter-toml.wasm", highlight: "toml" },
  // Markdown sections are found by heading, without a grammar.
  { test: /\.mdx?$/, highlight: "markdown" },
  { test: /\.css$/, highlight: "css" },
  { test: /\.(c|cc|cpp|h|hpp)$/, highlight: "cpp" },
  { test: /\.prisma$/, highlight: "prisma" },
  { test: /\.sql$/, highlight: "sql" },
  { test: /\.(tf|tfvars|hcl)$/, highlight: "hcl" },
  { test: /\.html?$/, highlight: "html" },
  { test: /(^|\/)Dockerfile[^/]*$/, highlight: "docker" },
];

export function languageOf(path: string) {
  return LANGUAGES.find((l) => l.test.test(path)) ?? { test: /$/, highlight: "text" };
}

export function canNameSymbols(path: string): boolean {
  const lang = languageOf(path);
  return Boolean(lang.grammar) || lang.highlight === "markdown";
}

let ready: Promise<void> | undefined;
const grammars = new Map<string, Promise<Language>>();

/** Parses `text` with a grammar under node_modules. */
export async function parse(grammar: string, text: string): Promise<Node> {
  await (ready ??= Parser.init());
  if (!grammars.has(grammar)) grammars.set(grammar, Language.load(join(MODULES, grammar)));
  const parser = new Parser();
  parser.setLanguage(await grammars.get(grammar)!);
  return parser.parse(text)!.rootNode;
}

export const TSX_GRAMMAR = `${VSCODE}/tree-sitter-tsx.wasm`;

/** Rows are 0-based and inclusive. `header` is the declaration up to its body. */
export type Span = { start: number; end: number; header: [number, number]; kind: string };

export type Located =
  | { found: Span }
  | { missing: string[] } // candidate names with their lines, closest first
  | { ambiguous: string[] }; // each definition with its line

/**
 * Finds `symbol`, a dotted path such as `Class.method` or `settings.review`, in a
 * file. Each segment matches the shallowest definition with that name inside the
 * previous one, or any definition at all when none is shallow. Adjacent matches,
 * such as overload signatures, form one span.
 */
export async function locate(path: string, text: string, symbol: string): Promise<Located> {
  const lang = languageOf(path);
  if (lang.highlight === "markdown") return locateHeading(text, symbol);
  const root = await parse(lang.grammar!, text);
  let scopes: Node[] = [root];
  const segments = symbol.split(".");
  for (let pos = 0; pos < segments.length; ) {
    // A name can itself hold dots, such as the TOML table `[settings.review]`; the longest match wins.
    let next: Node[] = [];
    let take = segments.length - pos;
    for (; take >= 1 && !next.length; take--) {
      const name = segments.slice(pos, pos + take).join(".");
      const last = pos + take === segments.length;
      for (const scope of scopes) {
        const named = (defs: Iterable<Def>) => [...defs].filter((d) => d.name === name && (!last || d.node.type !== "impl_item"));
        const shallow = named(shallowDefinitions(scope));
        next.push(...(shallow.length ? shallow : named(allDefinitions(scope))).map((d) => d.node));
      }
      // Go declares a method beside its type, naming the type as the method's receiver.
      if (!next.length && pos > 0 && take === 1)
        next.push(...[...allDefinitions(root)].filter((d) => d.name === name && receiverType(d.node) === segments[pos - 1]).map((d) => d.node));
    }
    if (!next.length) {
      const known = scopes.flatMap((s) => [...shallowDefinitions(s)]);
      return { missing: closest(segments[pos], known.map((d) => ({ name: d.name, line: d.node.startPosition.row + 1 }))) };
    }
    scopes = next;
    pos += take + 1;
  }
  const spans = scopes.map(spanOf).sort((a, b) => a.start - b.start);
  const merged = spans.reduce<Span[]>((out, span) => {
    const prev = out[out.length - 1];
    const between = prev ? text.split("\n").slice(prev.end + 1, span.start) : [];
    if (prev && between.every((l) => /^\s*(\/\/.*|#.*|\/?\*.*)?$/.test(l))) prev.end = Math.max(prev.end, span.end);
    else out.push({ ...span });
    return out;
  }, []);
  if (merged.length > 1) return { ambiguous: merged.map((s) => `${s.kind} at line ${s.header[0] + 1}`) };
  return { found: merged[0] };
}

/**
 * The definitions beside `symbol`: the shallowest ones in the scope that holds its
 * last segment. A renamed definition is looked for among them.
 */
export async function siblings(path: string, text: string, symbol: string): Promise<Array<{ name: string; span: Span }>> {
  const lang = languageOf(path);
  if (!lang.grammar) return [];
  const segments = symbol.split(".");
  let scope = await parse(lang.grammar, text);
  const methods = [...allDefinitions(scope)].filter((d) => segments.length > 1 && receiverType(d.node) === segments[segments.length - 2]);
  if (methods.length) return methods.map((d) => ({ name: d.name, span: spanOf(d.node) }));
  if (segments.length > 1) {
    const outer = await locate(path, text, segments.slice(0, -1).join("."));
    if (!("found" in outer)) return [];
    // Find the node again by its span, since locate returns rows.
    const found = [...allDefinitions(scope)].find((d) => spanOf(d.node).header[0] === outer.found.header[0]);
    if (!found) return [];
    scope = found.node;
  }
  return [...shallowDefinitions(scope)].filter((d) => d.node.type !== "impl_item").map((d) => ({ name: d.name, span: spanOf(d.node) }));
}

type Def = { name: string; node: Node };

const DEFINITION =
  /declaration|definition|declarator|_item$|_spec$|signature|^(pair|block_mapping_pair|flow_pair|table|module|internal_module|enum_variant|enum_assignment|assignment|variable_assignment|method|singleton_method|class)$/;
const NOT_DEFINITION = /import|export_specifier|^jsx|keyword_argument/;

/** The name a node defines, if it is a definition. */
/** The type a Go method's receiver names, without a pointer or type arguments. */
function receiverType(node: Node): string | undefined {
  let type = node.childForFieldName("receiver")?.namedChildren[0]?.childForFieldName("type");
  while (type && /^(pointer_type|generic_type|parenthesized_type)$/.test(type.type))
    type = type.type === "generic_type" ? type.childForFieldName("type") : type.namedChildren[0];
  return type?.text;
}

function nameOf(node: Node): string | undefined {
  // An impl block names its type, without type arguments; it only ever holds the
  // methods a path looks inside.
  if (node.type === "impl_item") {
    const type = node.childForFieldName("type");
    return (type?.type === "generic_type" ? type.childForFieldName("type") : type)?.text;
  }
  if (!DEFINITION.test(node.type) || NOT_DEFINITION.test(node.type)) return undefined;
  const field =
    node.childForFieldName("name") ??
    node.childForFieldName("key") ??
    (node.type === "assignment" ? node.childForFieldName("left") : null) ??
    // TOML's grammar has no field names; the key comes first.
    (node.type === "pair" || node.type === "table" ? node.firstNamedChild : null);
  if (!field || (node.type === "assignment" && field.type !== "identifier")) return undefined;
  const name = field.text.replace(/^["'`]|["'`]$/g, "");
  // Destructuring patterns aren't names.
  return /[\s{}[\]]/.test(name) && node.type !== "block_mapping_pair" ? undefined : name;
}

/** Definitions inside `scope` that aren't nested in another definition. */
function* shallowDefinitions(scope: Node): Generator<Def> {
  for (const child of scope.namedChildren) {
    const name = nameOf(child);
    if (name !== undefined) yield { name, node: child };
    else yield* shallowDefinitions(child);
  }
}

function* allDefinitions(scope: Node): Generator<Def> {
  for (const child of scope.namedChildren) {
    const name = nameOf(child);
    if (name !== undefined) yield { name, node: child };
    yield* allDefinitions(child);
  }
}

// Nodes that wrap a single definition without adding to it, such as `export` or a
// decorator list. A span grows through them.
const WRAPPER =
  /^(export_statement|lexical_declaration|variable_declaration|decorated_definition|ambient_declaration|expression_statement|const_declaration|var_declaration|type_declaration|field_declaration)$/;

function spanOf(def: Node): Span {
  let node = def;
  while (node.parent && WRAPPER.test(node.parent.type) && node.parent.namedChildren.every((c) => c.equals(node) || nameOf(c) === undefined))
    node = node.parent;
  // Doc comments, attributes, and decorators directly above belong to the definition.
  let start = node.startPosition.row;
  for (
    let prev = node.previousNamedSibling;
    prev && /comment|attribute|decorator|annotation/.test(prev.type) && !prev.text.startsWith("#!") && prev.endPosition.row >= start - 1;
    prev = prev.previousNamedSibling
  )
    start = prev.startPosition.row;
  const body = def.childForFieldName("body") ?? def.childForFieldName("value")?.childForFieldName("body");
  const headerEnd = body ? body.startPosition.row : def.startPosition.row;
  const end = node.endPosition.column === 0 && node.endPosition.row > node.startPosition.row ? node.endPosition.row - 1 : node.endPosition.row;
  return { start, end, header: [node.startPosition.row, Math.min(headerEnd, node.startPosition.row + 5)], kind: def.type.replace(/_/g, " ") };
}

/** A Markdown section: its heading through the line before the next heading at its level or above. */
function locateHeading(text: string, symbol: string): Located {
  const lines = text.split("\n");
  const headings: Array<{ name: string; level: number; row: number }> = [];
  let fenced = false;
  lines.forEach((line, row) => {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    const m = !fenced && line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (m) headings.push({ name: m[2], level: m[1].length, row });
  });
  const hits = headings.filter((h) => h.name === symbol);
  if (!hits.length) return { missing: closest(symbol, headings.map((h) => ({ name: h.name, line: h.row + 1 }))) };
  if (hits.length > 1) return { ambiguous: hits.map((h) => `heading at line ${h.row + 1}`) };
  const h = hits[0];
  const next = headings.find((o) => o.row > h.row && o.level <= h.level);
  let end = (next ? next.row : lines.length) - 1;
  while (end > h.row && !lines[end].trim()) end--;
  return { found: { start: h.row, end, header: [h.row, h.row], kind: "section" } };
}

/** Names ordered by how close they are to `wanted`, with their line, at most eight. */
function closest(wanted: string, names: Array<{ name: string; line: number }>): string[] {
  const w = wanted.toLowerCase();
  const score = (n: string) => {
    const l = n.toLowerCase();
    return l.includes(w) || w.includes(l) ? 0 : distance(w, l);
  };
  const seen = new Set<string>();
  return names
    .filter((n) => !seen.has(n.name) && seen.add(n.name))
    .sort((a, b) => score(a.name) - score(b.name))
    .slice(0, 8)
    .map((n) => `${n.name} (line ${n.line})`);
}

function distance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length];
}

let highlighter: Promise<Highlighter> | undefined;

/** Per line, each token's text with its light and dark theme colors. */
export async function highlight(path: string, text: string): Promise<Array<Array<{ text: string; light: string; dark: string }>>> {
  const h = await (highlighter ??= createHighlighter({ themes: ["github-light", "github-dark"], langs: [] }));
  const lang = languageOf(path).highlight as BundledLanguage | "text";
  if (lang !== "text" && !h.getLoadedLanguages().includes(lang)) await h.loadLanguage(lang);
  const { tokens } = h.codeToTokens(text, { lang, themes: { light: "github-light", dark: "github-dark" }, defaultColor: false });
  return tokens.map((line) =>
    line.map((t) => {
      const style = (t.htmlStyle ?? {}) as Record<string, string>;
      return { text: t.content, light: style["--shiki-light"] ?? "", dark: style["--shiki-dark"] ?? "" };
    }),
  );
}
