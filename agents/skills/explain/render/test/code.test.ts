// Finding definitions by symbol across the languages refs support.
import { describe, expect, test } from "bun:test";
import { locate } from "../code";

const found = async (file: string, text: string, symbol: string) => {
  const result = await locate(file, text, symbol);
  if (!("found" in result)) throw new Error(`${symbol} in ${file}: ${JSON.stringify(result)}`);
  return text.split("\n").slice(result.found.start, result.found.end + 1).join("\n");
};

describe("locate", () => {
  test.each([
    ["a.ts", "export class A {\n  /** doc */\n  b(): void {}\n}\n", "A.b", "  /** doc */\n  b(): void {}"],
    ["a.ts", "export type T = { x: number }\n", "T", "export type T = { x: number }"],
    ["a.js", "const f = () => {\n  return 1\n}\n", "f", "const f = () => {\n  return 1\n}"],
    ["a.py", "class A:\n    @property\n    def b(self):\n        return 1\n", "A.b", "    @property\n    def b(self):\n        return 1"],
    ["a.py", "X = 3\n", "X", "X = 3"],
    ["a.go", "package m\n\ntype S struct{ A int }\n", "S", "type S struct{ A int }"],
    ["a.go", "package m\ntype A struct{}\nfunc (a *A) Run() {}\nfunc (b B) Run() {}\n", "A.Run", "func (a *A) Run() {}"],
    ["a.rs", "struct Foo;\nimpl Foo {\n    fn bar(&self) {}\n}\n", "Foo.bar", "    fn bar(&self) {}"],
    ["a.sh", "#!/bin/bash\ndeploy() {\n  echo hi\n}\n", "deploy", "deploy() {\n  echo hi\n}"],
    ["A.java", "class A {\n  void run() {}\n}\n", "A.run", "  void run() {}"],
    ["A.cs", "class A {\n  void Run() {}\n}\n", "A.Run", "  void Run() {}"],
    ["a.rb", "class A\n  def run\n    1\n  end\nend\n", "A.run", "  def run\n    1\n  end"],
    ["a.php", "<?php\nclass A {\n  function run() {}\n}\n", "A.run", "  function run() {}"],
    ["a.yaml", "jobs:\n  build:\n    runs-on: x\n  test:\n    runs-on: y\n", "jobs.test", "  test:\n    runs-on: y"],
    ["a.toml", "[package]\nname = \"x\"\n\n[deps]\nfoo = 1\n", "deps.foo", "foo = 1"],
    ["a.toml", "[settings.review]\nenabled = true\n", "settings.review", "[settings.review]\nenabled = true"],
    ["a.md", "# T\n\n## Setup\n\ntext\n\n## Next\n", "Setup", "## Setup\n\ntext"],
  ])("%s %s", async (file, text, symbol, expected) => {
    expect(await found(file, text, symbol)).toBe(expected);
  });

  test("a Go method belongs to its receiver's type, not its receiver's name", async () => {
    const text = "package p\ntype A struct{}\ntype B struct{}\nfunc (A *B) Run() {}\n";
    expect(await found("a.go", text, "B.Run")).toBe("func (A *B) Run() {}");
    expect(await locate("a.go", text, "A.Run")).toMatchObject({ missing: expect.any(Array) });
  });

  test("a Rust method in a generic impl is found by its type's name", async () => {
    expect(await found("a.rs", "struct Cache<T>(T);\nimpl<T> Cache<T> {\n    fn get(&self) {}\n}\n", "Cache.get")).toBe("    fn get(&self) {}");
  });

  test("same-named methods of two classes are ambiguous, not overloads", async () => {
    expect(await locate("a.ts", "class A {\n  run() {}\n}\nclass B {\n  run() {}\n}\n", "run")).toEqual({
      ambiguous: ["method definition at line 2", "method definition at line 5"],
    });
  });
});
