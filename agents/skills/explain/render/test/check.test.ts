// The page checker, on hand-written pages. Needs Chrome.
import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { check } from "../check";

test("a page that loads a local file isn't self-contained", async () => {
  const dir = mkdtempSync(join(tmpdir(), "explain-check-"));
  await Bun.write(join(dir, "asset.svg"), '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"/>');
  await Bun.write(join(dir, "page.html"), `<!doctype html><html aria-busy="false"><body><div class="opening">Hi</div><img src="file://${dir}/asset.svg"></body></html>`);
  const findings = await check(join(dir, "page.html"), join(dir, "shots"));
  expect(findings).toContainEqual(expect.objectContaining({ severity: "error", problem: `loads file://${dir}/asset.svg; pages must be self-contained` }));
}, 60_000);

test("a lazy local image in collapsed specifics is caught; a space in the page's path isn't a load", async () => {
  const dir = mkdtempSync(join(tmpdir(), "explain check-"));
  await Bun.write(
    join(dir, "a page.html"),
    `<!doctype html><html aria-busy="false"><body><div class="opening">Hi</div><ul class="files"></ul><details class="specifics"><summary>S</summary><img loading="lazy" src="file:///tmp/nowhere.svg"></details></body></html>`,
  );
  const findings = await check(join(dir, "a page.html"), join(dir, "shots"));
  expect(findings.filter((f) => f.severity === "error").map((f) => `${f.element}: ${f.problem}`)).toEqual(["img[src]: loads file:///tmp/nowhere.svg; pages must be self-contained"]);
}, 60_000);

test("a page without Files fails", async () => {
  const dir = mkdtempSync(join(tmpdir(), "explain-check-"));
  await Bun.write(join(dir, "page.html"), `<!doctype html><html aria-busy="false"><body><div class="opening">Hi</div></body></html>`);
  const findings = await check(join(dir, "page.html"), join(dir, "shots"));
  expect(findings).toContainEqual(expect.objectContaining({ severity: "error", problem: "no <Files />; every touched file belongs in it" }));
}, 60_000);
