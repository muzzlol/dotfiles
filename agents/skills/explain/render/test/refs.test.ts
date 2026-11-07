// Resolves refs against real pull requests. Needs `gh` and a clone of the repository
// in EXPLAIN_TEST_REPO (default ~/dev/work/greptilia); skipped without the clone.
import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { copiedCode, resolveRefs, scanRefs, type RefRequest } from "../refs";
import { resolveSource, type Resolved } from "../source";
import { refKey, type CodeLine, type ResolvedRef } from "../src/source";

const REPO = process.env.EXPLAIN_TEST_REPO ?? join(homedir(), "dev/work/greptilia");
const suite = existsSync(REPO) ? describe : describe.skip;

const SECRETS = "internal/secrets.ts";
const CODEX = "apps/worker/src/agent/frameworks/codex-agent";

type Line = Extract<CodeLine, { tokens: unknown }>;
const text = (l: Line) => l.tokens.map((t) => t[0]).join("");
const shown = (ref: ResolvedRef) => ref.lines.filter((l): l is Line => l.kind !== "gap");

async function resolve(source: Resolved, requests: Array<Omit<RefRequest, "at">>) {
  const result = await resolveRefs(
    requests.map((r) => ({ ...r, at: "page.tsx:1" })),
    source.ctx,
  );
  const get = (r: Omit<RefRequest, "at">) => result.refs[refKey(r.file, r.symbol, r.match)];
  return { ...result, get };
}

suite("refs on #14171, which rewrote how scripts find Infisical credentials", () => {
  let source: Resolved;
  beforeAll(async () => {
    source = await resolveSource("pr:14171", REPO);
  }, 60_000);

  test("an added function is added, with its declaration and a link", async () => {
    const { get, errors } = await resolve(source, [{ file: SECRETS, symbol: "resolveInfisicalCredentials" }]);
    expect(errors).toEqual([]);
    const ref = get({ file: SECRETS, symbol: "resolveInfisicalCredentials" });
    expect(ref.status).toBe("added");
    expect(text(shown(ref)[0])).toContain("async function resolveInfisicalCredentials()");
    expect(shown(ref)[0].header).toBe(true);
    expect(ref.url).toMatch(/github\.com\/.+\/blob\/24fa4e7d.+\/internal\/secrets\.ts#L\d+-L\d+$/);
  });

  test("a removed function is read at base", async () => {
    const r = { file: SECRETS, symbol: "loadInfisicalBootstrapEnv" };
    const { get, errors } = await resolve(source, [r]);
    expect(errors).toEqual([]);
    expect(get(r).status).toBe("removed");
    expect(text(shown(get(r))[0])).toContain("function loadInfisicalBootstrapEnv(): void");
  });

  test("a changed function diffs from its first line, not three lines above the change", async () => {
    const r = { file: SECRETS, symbol: "getInfisicalSecretsForEnvironment" };
    const { get } = await resolve(source, [r]);
    const ref = get(r);
    expect(ref.status).toBe("changed");
    expect(text(shown(ref)[0])).toContain("async function getInfisicalSecretsForEnvironment(");
    expect(shown(ref).some((l) => l.kind === "-" && text(l).includes("loadInfisicalBootstrapEnv()"))).toBe(true);
    expect(shown(ref).some((l) => l.kind === "+" && text(l).includes("resolveInfisicalCredentials()"))).toBe(true);
    // Removed lines are numbered at base, the rest at head.
    const removed = shown(ref).find((l) => l.kind === "-")!;
    expect(removed.n).toBe(115);
  });

  test("unchanged code, exported constants, and nested keys resolve", async () => {
    const rs = [
      { file: SECRETS, symbol: "isEnvName" },
      { file: SECRETS, symbol: "INFISICAL_PROJECT_ID" },
      { file: SECRETS, symbol: "INFISICAL_ENVIRONMENT.local" },
    ];
    const { get, errors } = await resolve(source, rs);
    expect(errors).toEqual([]);
    expect(get(rs[0]).status).toBe("unchanged");
    expect(get(rs[1]).status).toBe("added");
    expect(text(shown(get(rs[1]))[0])).toContain("export const INFISICAL_PROJECT_ID =");
    expect(shown(get(rs[2])).map(text)).toEqual(["  local: 'development',"]);
  });

  test("match marks the lines it names, across a line break", async () => {
    const r = { file: SECRETS, symbol: "resolveInfisicalCredentials", match: "No usable Infisical credentials. Run `infisical login`" };
    const { get, errors } = await resolve(source, [r]);
    expect(errors).toEqual([]);
    const marked = shown(get(r)).filter((l) => l.marked);
    expect(marked.length).toBe(1);
    expect(text(marked[0])).toContain("'No usable Infisical credentials. Run `infisical login`");
  });

  test("a file without a symbol shows its changes; a Markdown heading names a section", async () => {
    const doc = "docs/content/tutorials/setup-greptilia.md";
    const rs = [{ file: doc }, { file: doc, symbol: "Set Up Infisical Access Token" }];
    const { get, errors } = await resolve(source, rs);
    expect(errors).toEqual([]);
    for (const r of rs) {
      expect(get(r).status).toBe("changed");
      expect(shown(get(r)).filter((l) => l.kind !== " ").map((l) => l.kind)).toEqual(["-", "+"]);
    }
    expect(get(rs[0]).lines[0]).toEqual({ kind: "gap", hidden: expect.any(Number) });
    expect(text(shown(get(rs[1]))[0])).toBe("### Set Up Infisical Access Token");
  });

  test("tokens carry syntax colors from both themes", async () => {
    const r = { file: SECRETS, symbol: "INFISICAL_PROJECT_ID" };
    const { get, colors } = await resolve(source, [r]);
    const keyword = shown(get(r))[0].tokens.find((t) => t[0].includes("export"))!;
    expect(colors[keyword[1]]).toEqual(["#D73A49", "#F97583"]);
  });

  test("failures name the page line and suggest what exists", async () => {
    const { errors } = await resolve(source, [
      { file: SECRETS, symbol: "resolveCredentials" },
      { file: "internal/secret.ts", symbol: "x" },
      { file: SECRETS, symbol: "getTokenExpiry", match: "nowhere in this function" },
      { file: "packages/db/prisma/schema.prisma", symbol: "User" },
    ]);
    expect(errors).toHaveLength(4);
    expect(errors[0]).toStartWith('page.tsx:1 <Ref file="internal/secrets.ts" symbol="resolveCredentials">: no "resolveCredentials"');
    expect(errors[0]).toContain("resolveInfisicalCredentials (line");
    expect(errors[1]).toContain("internal/secrets.ts");
    expect(errors[2]).toContain('no line in it contains "nowhere in this function"');
    expect(errors[3]).toContain("symbols can't be found in this file type");
  });
});

suite("refs on #12358, which moved the Codex config writer into its own file", () => {
  let source: Resolved;
  beforeAll(async () => {
    source = await resolveSource("pr:12358", REPO);
  }, 120_000);

  test("moved code is one move, diffed against where it was", async () => {
    const rs = [
      { file: `${CODEX}/config.ts`, symbol: "generateConfigToml" },
      { file: `${CODEX}/runner.ts`, symbol: "generateConfigToml" },
      { file: `${CODEX}/config.ts`, symbol: "CODEX_MODEL_PROVIDER" },
    ];
    const { get, errors } = await resolve(source, rs);
    expect(errors).toEqual([]);
    for (const r of rs.slice(0, 2)) {
      expect(get(r).status).toBe("moved");
      expect(get(r).file).toBe(`${CODEX}/config.ts`);
      expect(get(r).from).toMatch(new RegExp(`^${CODEX}/runner\\.ts:\\d+$`));
    }
    // Unchanged lines outnumber edits; re-indentation alone isn't an edit.
    const lines = shown(get(rs[0]));
    expect(lines.filter((l) => l.kind === " ").length).toBeGreaterThan(lines.filter((l) => l.kind !== " ").length);
    expect(get(rs[2]).status).toBe("moved");
    expect(shown(get(rs[2])).every((l) => l.kind === " ")).toBe(true);
  });
});

suite("refs on #16032, which renamed the session processing starter", () => {
  let source: Resolved;
  beforeAll(async () => {
    source = await resolveSource("pr:16032", REPO);
  }, 120_000);

  test("a renamed definition diffs against its old name, from either name", async () => {
    const file = "apps/chunker/src/session-costs/processing-worker.ts";
    const rs = [
      { file, symbol: "startSessionProcessing" },
      { file, symbol: "startSessionProcessingWorker" },
    ];
    const { get, errors } = await resolve(source, rs);
    expect(errors).toEqual([]);
    for (const r of rs) {
      expect(get(r)).toMatchObject({ status: "renamed", was: "startSessionProcessingWorker", file });
      const [old, now] = shown(get(r));
      expect([old.kind, now.kind]).toEqual(["-", "+"]);
      expect(text(now)).toContain("export async function startSessionProcessing(");
    }
  });
});

describe("scanning a page", () => {
  test("a diagram step's code resolves like a Ref", async () => {
    const page = `<Flow label="x" nodes={[{ id: "a", label: "A", code: { file: "a.ts", symbol: "run", match: 'go()' } }, { id: "b", label: "B", code: { symbol: "x" } }]} edges={[]} />`;
    const { requests, errors } = await scanRefs(page);
    expect(requests).toEqual([{ file: "a.ts", symbol: "run", match: "go()", at: "page.tsx:1" }]);
    expect(errors).toEqual(["page.tsx:1 step code: needs file"]);
  });

  test("the source comes from the element, not a comment that mentions one", async () => {
    const page = `// Example: <Explanation source="commit:HEAD">
export default () => <Explanation source="worktree"><Opening>Hi</Opening></Explanation>;`;
    expect((await scanRefs(page)).source).toBe("worktree");
    const two = await scanRefs(`<><Explanation source="a..b" /><Explanation source="c..d" /></>`);
    expect(two.errors).toEqual(["the page has 2 <Explanation> elements; it explains one source"]);
  });

  test("a written Diff may summarize code but not copy a line of the change", async () => {
    const page = `<>
<Diff>{\`- workers.push(await hatchet.worker(name, { slots: 10 }))
+ one worker for every workflow\`}</Diff>
<Diff>{"- hatchet.worker(batch, 10 slots)"}</Diff>
</>`;
    const { written } = await scanRefs(page);
    expect(written.map((w) => w.at)).toEqual(["page.tsx:2", "page.tsx:4"]);
    const patch = "--- a/w.ts\n+++ b/w.ts\n@@ -1 +1 @@\n-    workers.push(await hatchet.worker(name, { slots: 10 }))\n+    start()\n";
    expect(copiedCode(written, patch)).toEqual([
      'page.tsx:2 <Diff>: copies code from the change ("workers.push(await hatchet.worker(name, { slots: 10 }))"); show it with <Diff file="…" symbol="…" match="…" /> instead',
    ]);
  });

  test("reads literal props, decodes them as JSX does, and rejects computed ones", async () => {
    const page = `
      const f = "x.ts";
      export default () => (
        <p>
          <Ref file="a.ts" symbol="A.b" match="x &amp;&amp; y">one</Ref>
          <Diff file={'b.ts'} match={\`c\\\`d\`} />
          <Diff>{"- literal"}</Diff>
          <Ref file={f}>two</Ref>
        </p>
      );`;
    const { requests, errors } = await scanRefs(page);
    expect(requests).toEqual([
      { file: "a.ts", symbol: "A.b", match: "x && y", at: "page.tsx:5" },
      { file: "b.ts", symbol: undefined, match: "c`d", at: "page.tsx:6" },
    ]);
    expect(errors).toEqual(["page.tsx:8 <Ref file>: write file as a string literal, so render can resolve it before building"]);
  });
});
