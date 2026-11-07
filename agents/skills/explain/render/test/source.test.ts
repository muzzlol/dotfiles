// Resolves every kind of source against a throwaway repository.
import { $ } from "bun";
import { beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveRefs } from "../refs";
import { resolveSource } from "../source";

let repo: string;
const git = (...args: string[]) => $`git ${args}`.cwd(repo).quiet().text().then((t) => t.trim());
const write = (path: string, text: string) => writeFileSync(join(repo, path), text);
async function commit(message: string) {
  await git("add", "-A");
  await git("commit", "-q", "-m", message);
  return git("rev-parse", "HEAD");
}

beforeEach(async () => {
  repo = mkdtempSync(join(tmpdir(), "explain-source-"));
  await git("init", "-q", "-b", "main");
  await git("config", "user.name", "t");
  await git("config", "user.email", "t@example.com");
  write("app.ts", "export function greet(name: string) {\n  return `hi ${name}`\n}\n");
  await commit("Add greet");
});

describe("sources", () => {
  test("commit:<rev> is one commit against its parent; the first commit is against nothing", async () => {
    const first = await git("rev-parse", "HEAD");
    write("app.ts", "export function greet(name: string) {\n  return `hello ${name}`\n}\n");
    const second = await commit("Say hello");
    const { resolved, ctx } = await resolveSource("commit:HEAD", repo);
    expect(resolved).toMatchObject({ base: first, head: second, title: "Say hello", repo: expect.stringMatching(/^explain-source-/) });
    expect(resolved.files).toEqual([{ path: "app.ts", status: "modified", additions: 1, deletions: 1 }]);
    expect(ctx.link?.(second, "app.ts", 1, 3)).toBeUndefined();
    const root = await resolveSource(`commit:${first}`, repo);
    expect(root.resolved.files).toEqual([{ path: "app.ts", status: "added", additions: 3, deletions: 0 }]);
  });

  test("a..b is against a; a...b is against where b left a", async () => {
    const fork = await git("rev-parse", "HEAD");
    await git("checkout", "-q", "-b", "feature");
    write("feature.ts", "export const on = true\n");
    const tip = await commit("Add feature");
    await git("checkout", "-q", "main");
    write("main.ts", "export const later = 1\n");
    await commit("Main moves on");
    const two = await resolveSource("main..feature", repo);
    expect(two.resolved.files.map((f) => `${f.status} ${f.path}`).sort()).toEqual(["added feature.ts", "removed main.ts"]);
    const three = await resolveSource("main...feature", repo);
    expect(three.resolved).toMatchObject({ base: fork, head: tip, title: "Add feature" });
    expect(three.resolved.files.map((f) => f.path)).toEqual(["feature.ts"]);
  });

  test("worktree snapshots staged, unstaged, and untracked work without touching the index", async () => {
    write("app.ts", "export function greet(name: string) {\n  return `hey ${name}`\n}\n");
    write("staged.ts", "export const staged = 1\n");
    await git("add", "staged.ts");
    write("new.ts", "export function fresh() {\n  return 1\n}\n");
    const before = await Promise.all([git("status", "--porcelain"), git("diff", "--cached"), git("for-each-ref"), git("stash", "list")]);
    const { resolved, ctx } = await resolveSource("worktree", repo);
    const after = await Promise.all([git("status", "--porcelain"), git("diff", "--cached"), git("for-each-ref"), git("stash", "list")]);
    expect(after).toEqual(before);
    expect(resolved.title).toBe("Uncommitted work on main");
    expect(resolved.base).toBe(await git("rev-parse", "HEAD"));
    expect(resolved.files.map((f) => `${f.status} ${f.path}`).sort()).toEqual(["added new.ts", "added staged.ts", "modified app.ts"]);
    // Refs resolve against the snapshot, including files git doesn't track yet.
    const { refs, errors } = await resolveRefs([{ file: "new.ts", symbol: "fresh", at: "page.tsx:1" }], ctx);
    expect(errors).toEqual([]);
    expect(Object.values(refs)[0]).toMatchObject({ status: "added", url: undefined });
  });

  test("paths after -- narrow any source", async () => {
    write("app.ts", "changed\n");
    write("notes.md", "scratch\n");
    const { resolved } = await resolveSource("worktree -- app.ts", repo);
    expect(resolved.files.map((f) => f.path)).toEqual(["app.ts"]);
    expect(resolved.source).toBe("worktree -- app.ts");
  });

  test("worktree:<rev> covers a branch's commits and its uncommitted work", async () => {
    const fork = await git("rev-parse", "HEAD");
    await git("checkout", "-q", "-b", "feature");
    write("one.ts", "export const one = 1\n");
    await commit("One");
    write("two.ts", "export const two = 2\n");
    const { resolved } = await resolveSource("worktree:main", repo);
    expect(resolved.base).toBe(fork);
    expect(resolved.title).toBe("feature since main, with uncommitted work");
    expect(resolved.files.map((f) => f.path).sort()).toEqual(["one.ts", "two.ts"]);
  });

  test("any path survives: non-ASCII, spaces, and tabs", async () => {
    write("app.ts", "changed\n");
    write("café.ts", "export {}\n");
    write("my notes.ts", "export {}\n");
    write("tab\tname.ts", "a\nb\nc\n");
    const { resolved } = await resolveSource("worktree", repo);
    expect(resolved.files.map((f) => `${f.status} ${f.path} +${f.additions}`).sort()).toEqual([
      "added café.ts +1",
      "added my notes.ts +1",
      "added tab\tname.ts +3",
      "modified app.ts +1",
    ]);
    const quoted = await resolveSource(`worktree -- "my notes.ts" 'café.ts'`, repo);
    expect(quoted.resolved.files.map((f) => f.path).sort()).toEqual(["café.ts", "my notes.ts"]);
  });

  test("refs: a copy isn't a move, unsupported files don't block, and new code ships whole", async () => {
    write("style.css", "body { color: red; }\n");
    write("original.ts", "export function same() {\n  return 1\n}\nexport const other = 1\n");
    await commit("Add original");
    write("style.css", "body { color: blue; }\n");
    write("original.ts", "export function same() {\n  return 1\n}\nexport const other = 2\n");
    write("copy.ts", "export function same() {\n  return 1\n}\n");
    write("long.ts", `export function long() {\n${Array.from({ length: 150 }, (_, i) => `  step(${i})`).join("\n")}\n  return "last"\n}\n`);
    const { ctx } = await resolveSource("worktree", repo);
    const { refs, errors } = await resolveRefs(
      [
        { file: "copy.ts", symbol: "same", at: "page.tsx:1" },
        { file: "long.ts", symbol: "long", at: "page.tsx:2" },
      ],
      ctx,
    );
    expect(errors).toEqual([]);
    const [copy, long] = Object.values(refs);
    expect(copy.status).toBe("added");
    expect(long.lines).toHaveLength(153);
    expect(long.lines.some((l) => l.kind === "gap")).toBe(false);
  });

  test("refs: Go method renames, ambiguity elsewhere, and a match deep in new code", async () => {
    write("a.go", "package p\ntype A struct{}\nfunc (a *A) Old() int {\n\tx := 1\n\ty := 2\n\treturn x + y\n}\n");
    write("other.ts", "class A {\n  run() {}\n}\nclass B {\n  run() {}\n}\n");
    await commit("Base");
    write("a.go", "package p\ntype A struct{}\nfunc (a *A) New() int {\n\tx := 1\n\ty := 2\n\treturn x + y\n}\n");
    write("other.ts", "class A {\n  run() {}\n}\nclass B {\n  run() { return 1 }\n}\n");
    write("new.ts", "export function run() {\n  return 2\n}\n");
    write("long.ts", `export function long() {\n${Array.from({ length: 600 }, (_, i) => `  step(${i})`).join("\n")}\n}\n`);
    const { ctx } = await resolveSource("worktree", repo);
    const requests = [
      { file: "a.go", symbol: "A.New", at: "page.tsx:1" },
      { file: "new.ts", symbol: "run", at: "page.tsx:2" },
      { file: "long.ts", symbol: "long", match: "step(590)", at: "page.tsx:3" },
    ];
    const { refs, errors } = await resolveRefs(requests, ctx);
    expect(errors).toEqual([]);
    const [renamed, fresh, long] = Object.values(refs);
    expect(renamed).toMatchObject({ status: "renamed", was: "Old" });
    expect(fresh.status).toBe("added");
    expect(long.lines.filter((l) => l.kind !== "gap" && l.marked)).toHaveLength(1);
  });

  test("lockfiles and linguist-generated files are flagged", async () => {
    write(".gitattributes", "schema.gen.ts linguist-generated\n");
    write("bun.lock", "{}\n");
    write("schema.gen.ts", "export {}\n");
    write("real.ts", "export {}\n");
    await commit("Add files");
    const { resolved } = await resolveSource("commit:HEAD", repo);
    expect(Object.fromEntries(resolved.files.map((f) => [f.path, f.generated ?? false]))).toEqual({
      ".gitattributes": false,
      "bun.lock": true,
      "real.ts": false,
      "schema.gen.ts": true,
    });
  });

  test("refuses a worktree mid-merge, an empty change, and an unknown form", async () => {
    await git("checkout", "-q", "-b", "other");
    write("app.ts", "other\n");
    await commit("Other");
    await git("checkout", "-q", "main");
    write("app.ts", "main\n");
    await commit("Main");
    await $`git merge other`.cwd(repo).nothrow().quiet();
    await expect(resolveSource("worktree", repo)).rejects.toThrow("in the middle of a merge");
    await git("merge", "--abort");
    await expect(resolveSource("worktree", repo)).rejects.toThrow("has no changes");
    await expect(resolveSource("branch:main", repo)).rejects.toThrow("Use one of:");
    await expect(resolveSource("commit:nope", repo)).rejects.toThrow('no commit "nope"');
  });

  test("links point at GitHub only for commits a remote has", async () => {
    await git("remote", "add", "origin", "git@github.com:acme/widgets.git");
    write("app.ts", "changed\n");
    const head = await commit("Change");
    const { resolved, ctx } = await resolveSource("commit:HEAD", repo);
    expect(resolved.repo).toBe("acme/widgets");
    expect(ctx.link?.(head, "app.ts", 1, 1)).toBeUndefined();
    await git("update-ref", "refs/remotes/origin/main", head);
    const pushed = await resolveSource("commit:HEAD", repo);
    expect(pushed.ctx.link?.(head, "app.ts", 1, 1)).toBe(`https://github.com/acme/widgets/blob/${head}/app.ts#L1-L1`);
  });
});
