// The whole pipeline on a throwaway repository: source, refs, typecheck, layout,
// bundle, and checks. Needs Chrome; no network.
import { $ } from "bun";
import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");

test("a page about uncommitted work builds, with identical diagrams sharing a layout", async () => {
  const repo = mkdtempSync(join(tmpdir(), "explain-render-"));
  const git = (...args: string[]) => $`git ${args}`.cwd(repo).quiet();
  await git("init", "-q", "-b", "main");
  await git("config", "user.name", "t");
  await git("config", "user.email", "t@example.com");
  writeFileSync(join(repo, "app.ts"), "export function greet(name: string) {\n  return `hi ${name}`\n}\n");
  await git("add", "-A");
  await git("commit", "-qm", "Add greet");
  writeFileSync(join(repo, "app.ts"), "export function greet(name: string) {\n  return `hello ${name}`\n}\n");
  const flow = `<Flow label="Greeting" nodes={[{ id: "a", label: "Caller" }, { id: "b", label: "Greet", mark: "~" }]} edges={[{ from: "a", to: "b" }]} />`;
  const pages = mkdtempSync(join(tmpdir(), "explain-pages-"));
  writeFileSync(
    join(pages, "greet.tsx"),
    `import { Explanation, Files, Flow, Note, Opening, Ref } from "explain";
// Example: <Explanation source="commit:HEAD">
export default function Page() {
  return (
    <Explanation source="worktree">
      <Opening><p>Greetings say <Ref file="app.ts" symbol="greet" match="hello">hello</Ref> now.</p></Opening>
      <Note mark="~" risk="low" title="Hello instead of hi">${flow}</Note>
      <Note mark="~" risk="low" title="The same diagram again">${flow}</Note>
      <Files />
    </Explanation>
  );
}
`,
  );
  const out = await $`bun ${join(ROOT, "render.ts")} ${join(pages, "greet.tsx")} --no-archive`.cwd(repo).nothrow().quiet();
  expect(out.stderr.toString()).toBe("");
  expect(out.exitCode).toBe(0);
  const html = await Bun.file(out.stdout.toString().trim()).text();
  expect(html).toContain("hello");

  // A map's node must name a note that exists.
  const page = await Bun.file(join(pages, "greet.tsx")).text();
  writeFileSync(join(pages, "bad-map.tsx"), page.replace('{ id: "b", label: "Greet", mark: "~" }', '{ id: "b", label: "Greet", mark: "~", note: "Hello instead of hey" }'));
  const bad = await $`bun ${join(ROOT, "render.ts")} ${join(pages, "bad-map.tsx")} --no-archive`.cwd(repo).nothrow().quiet();
  expect(bad.exitCode).toBe(1);
  expect(bad.stderr.toString()).toContain("map node b: names a note that does not exist");
}, 240_000);
