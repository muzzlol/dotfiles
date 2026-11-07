#!/usr/bin/env bun
// render <page.tsx> [--repo <dir>] [--slug <name>] [--model <id>] [--no-archive | --out <file>]
//
// Resolves the page's source, typechecks it, bundles it into one HTML file, checks
// it, and files it in ~/.explain. Prints the HTML path. See DESIGN.md.
import { $ } from "bun";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { check, expand, withBrowser } from "./check";
import { VARIANT_VIEWPORT } from "./src/engine";
import { resolveSource } from "./source";

const ROOT = import.meta.dir;
const ARCHIVE = join(homedir(), ".explain");

function fail(message: string): never {
  console.error(`render: ${message}`);
  process.exit(1);
}

function parseArgs(argv: string[]) {
  const args = { page: "", repo: process.cwd(), slug: "", model: "", archive: true, out: "" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--repo") args.repo = resolve(argv[++i] ?? fail("--repo needs a directory"));
    else if (a === "--slug") args.slug = argv[++i] ?? fail("--slug needs a name");
    else if (a === "--model") args.model = argv[++i] ?? fail("--model needs an id");
    else if (a === "--no-archive") args.archive = false;
    else if (a === "--out") {
      // Reference pages, such as the component gallery, go where you say instead of the archive.
      args.out = resolve(argv[++i] ?? fail("--out needs a file"));
      args.archive = false;
    }
    else if (!args.page) args.page = resolve(a);
    else fail(`unexpected argument ${a}`);
  }
  if (!args.page) fail("usage: render <page.tsx> [--repo <dir>] [--slug <name>] [--model <id>] [--no-archive | --out <file>]");
  return args;
}

/** Bundles the build folder into one HTML file, with the chosen layout engine. */
async function bundle(build: string, engine: "elk" | "static", outdir: string): Promise<string> {
  const engineFile = join(ROOT, "src", engine === "elk" ? "engine-elk.ts" : "engine-static.ts");
  // Bun picks the JSX runtime from NODE_ENV and nearby config, so build as production from here.
  process.env.NODE_ENV = "production";
  process.chdir(ROOT);
  const result = await Bun.build({
    entrypoints: [join(build, "index.html")],
    target: "browser",
    compile: true,
    outdir,
    // Renaming identifiers breaks elkjs's generated code; the published page has no elkjs.
    minify: engine === "static" ? true : { whitespace: true, syntax: true, identifiers: false },
    plugins: [
      {
        name: "explain",
        setup(builder) {
          builder.onResolve({ filter: /^explain$/ }, () => ({ path: join(ROOT, "src/index.ts") }));
          builder.onResolve({ filter: /^explain-engine$/ }, () => ({ path: engineFile }));
        },
      },
    ],
  } as Parameters<typeof Bun.build>[0]);
  if (!result.success) fail(`bundle failed:\n${result.logs.map(String).join("\n")}`);
  return join(outdir, "index.html");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  // A fresh checkout of the skill installs its own dependencies, then reruns, since
  // this process has already looked for them.
  if (!existsSync(join(ROOT, "node_modules"))) {
    const install = await $`bun install --frozen-lockfile`.cwd(ROOT).nothrow().quiet();
    if (install.exitCode !== 0) fail(`installing dependencies failed:\n${install.stderr}`);
    const rerun = Bun.spawn([process.execPath, ...process.argv.slice(1)], { stdio: ["inherit", "inherit", "inherit"] });
    process.exit(await rerun.exited);
  }
  if (!existsSync(args.page)) fail(`no page at ${args.page}`);
  const pageText = await Bun.file(args.page).text();
  // Read from the syntax tree, so a comment or string that mentions <Explanation> can't stand in.
  const { copiedCode, resolveRefs, scanRefs } = await import("./refs");
  const scanned = await scanRefs(pageText);
  const source = scanned.source;
  if (!source) fail(['the page has no <Explanation source="…">', ...scanned.errors].join("\n"));

  // 1. Resolve the source.
  const { resolved, patch, ctx } = await resolveSource(source, args.repo).catch((e: Error) => fail(e.message));

  // 2. Resolve the code the page names, at the source's commits.
  const code = await resolveRefs(scanned.requests, ctx);
  const refErrors = [...scanned.errors, ...code.errors, ...copiedCode(scanned.written, patch)];
  if (refErrors.length) fail(`${refErrors.length} code reference${refErrors.length === 1 ? "" : "s"} didn't resolve:\n${refErrors.join("\n")}`);
  resolved.refs = code.refs;
  resolved.colors = code.colors;

  // Build in a folder inside this package, so the page resolves react and "explain".
  // A failed build stays a day for its screenshots; an archived one is removed below.
  const builds = join(ROOT, ".build");
  for (const old of existsSync(builds) ? readdirSync(builds) : [])
    if (Date.now() - statSync(join(builds, old)).mtimeMs > 86_400_000) rmSync(join(builds, old), { recursive: true, force: true });
  const build = join(builds, `${Date.now()}-${process.pid}`);
  mkdirSync(build, { recursive: true });
  await Bun.write(join(build, "page.tsx"), pageText);
  await Bun.write(join(build, "resolved.json"), JSON.stringify(resolved));
  await Bun.write(join(build, "layouts.json"), "{}");
  await Bun.write(
    join(build, "entry.tsx"),
    `import { createRoot } from "react-dom/client";
import { SourceProvider } from "${join(ROOT, "src/source")}";
import resolved from "./resolved.json";
import layouts from "./layouts.json";
import Page from "./page";
globalThis.__EXPLAIN_LAYOUTS__ = layouts as any;
document.documentElement.setAttribute("aria-busy", "true");
createRoot(document.getElementById("root")!).render(<SourceProvider value={resolved as any}><Page /></SourceProvider>);
`,
  );
  await Bun.write(
    join(build, "index.html"),
    `<!doctype html><html lang="en" aria-busy="true"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(resolved.title ?? source)}</title></head><body><div id="root"></div><script type="module" src="./entry.tsx"></script></body></html>`,
  );
  await Bun.write(
    join(build, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "bundler",
          jsx: "react-jsx",
          strict: true,
          noEmit: true,
          skipLibCheck: true,
          resolveJsonModule: true,
          lib: ["ES2022", "DOM", "DOM.Iterable"],
          types: [],
          paths: { explain: [join(ROOT, "src/index.ts")], "explain-engine": [join(ROOT, "src/engine-static.ts")] },
        },
        files: ["page.tsx", "entry.tsx", join(ROOT, "src/css.d.ts")],
      },
      null,
      2,
    ),
  );

  // 3. Typecheck. Errors go back to the agent as they are.
  const tsc = await $`${join(ROOT, "node_modules/.bin/tsc")} -p ${join(build, "tsconfig.json")}`.nothrow().quiet();
  if (tsc.exitCode !== 0) fail(`typecheck failed:\n${tsc.stdout.toString().replaceAll(build + "/", "")}`);

  // 4. Lay out: build with elkjs, open it at both column widths, and keep what it computed.
  const layoutHtml = await bundle(build, "elk", join(build, "dist-layout"));
  const layouts = await withBrowser(async (visit, problems) => {
    const all: Record<string, unknown> = {};
    let diagrams = 0;
    for (const variant of ["wide", "narrow"] as const) {
      const page = await visit(layoutHtml, VARIANT_VIEWPORT[variant], "light");
      // Diagrams inside notes and code that steps open exist only once opened.
      await expand(page, "all");
      Object.assign(all, JSON.parse(await page.evaluate(`JSON.stringify(window.__explainLayouts ?? {})`)));
      // Identical diagrams share a key, and so their layouts.
      diagrams = await page.evaluate(`new Set([...document.querySelectorAll('figure.flow')].map((f) => f.dataset.key)).size`);
    }
    const errors = problems.filter((p) => p.severity === "error");
    if (errors.length) fail(`layout failed:\n${errors.map((e) => `${e.element}: ${e.problem} [${e.variant}]`).join("\n")}`);
    if (Object.keys(all).length < diagrams * 2) fail(`layout recorded ${Object.keys(all).length} of ${diagrams * 2} diagram layouts`);
    return all;
  });
  await Bun.write(join(build, "layouts.json"), JSON.stringify(layouts));

  // 5. Bundle the published page with the stored layouts and no layout library.
  const html = await bundle(build, "static", join(build, "dist"));

  // 6. Check. Errors fail the build. Warnings go in checks.json for evals, not to the
  // page's author, until their false alarms are rare.
  const findings = await check(html, join(build, "check"));
  await Bun.write(join(build, "checks.json"), JSON.stringify(findings, null, 2));
  const errors = findings.filter((f) => f.severity === "error");
  if (errors.length)
    fail(`check failed:\n${errors.map((f) => `${f.element}: ${f.problem} [${f.variant}]`).join("\n")}\nscreenshots in ${join(build, "check")}`);

  if (args.out) {
    await Bun.write(args.out, Bun.file(html));
    rmSync(build, { recursive: true, force: true });
    console.log(args.out);
    return;
  }
  if (!args.archive) {
    console.log(html);
    return;
  }

  // 7. Archive, append-only, and commit.
  const repoName = resolved.repo.split("/").pop()!;
  const date = new Date().toISOString().slice(0, 10);
  const slug = (args.slug || basename(args.page).replace(/\.tsx$/, "")).toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  mkdirSync(join(ARCHIVE, repoName), { recursive: true });
  // Creating the folder claims the name, so runs at the same time never share an entry.
  let entry = "";
  for (let n = 1; !entry; n++) {
    const candidate = join(ARCHIVE, repoName, `${date}-${slug}${n > 1 ? `-${n}` : ""}`);
    try {
      mkdirSync(candidate);
      entry = candidate;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    }
  }
  const skillSha = (await $`git -C ${ROOT} rev-parse --short HEAD`.nothrow().quiet().text()).trim();
  const skillDirty = (await $`git -C ${ROOT} status --porcelain -- ${dirname(ROOT)}`.nothrow().quiet().text()).trim() !== "";
  await Bun.write(join(entry, "page.tsx"), pageText);
  await Bun.write(join(entry, "page.html"), Bun.file(html));
  await Bun.write(join(entry, "diff.patch"), patch);
  await Bun.write(join(entry, "checks.json"), Bun.file(join(build, "checks.json")));
  await Bun.write(
    join(entry, "meta.json"),
    JSON.stringify(
      {
        source,
        repo: resolved.repo,
        title: resolved.title,
        url: resolved.url,
        base: resolved.base,
        head: resolved.head,
        model: args.model || null,
        skill: `${skillSha}${skillDirty ? "+dirty" : ""}`,
        createdAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  if (!existsSync(join(ARCHIVE, ".git"))) await $`git -C ${ARCHIVE} init -q`;
  // Commit only this entry, and wait out another run holding the index lock.
  const message = `Add ${repoName}/${basename(entry)}`;
  for (let attempt = 1; ; attempt++) {
    const added = await $`git -C ${ARCHIVE} add -- ${entry}`.nothrow().quiet();
    const committed = added.exitCode === 0 && (await $`git -C ${ARCHIVE} commit -q --only -m ${message} -- ${entry}`.nothrow().quiet());
    if (committed && committed.exitCode === 0) break;
    const error = (committed || added).stderr.toString();
    if (!error.includes("index.lock") || attempt === 40) fail(`archiving failed:\n${error}`);
    await Bun.sleep(250);
  }
  rmSync(build, { recursive: true, force: true });
  console.log(join(entry, "page.html"));
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

await main();
