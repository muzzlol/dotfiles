#!/usr/bin/env bun
// check <page.html> [--out <dir>]
//
// Opens the page in headless Chrome over CDP (no dependencies), waits for
// aria-busy="false", and reports defects at 736px and 360px, light and dark.
// Page errors, loads from outside the page, and contract breaks are errors; layout
// findings are warnings, kept for evals until their false alarms are rare.
//
// connect() and the event handling in withBrowser are adapted from check-viewer.cjs in
// github.com/jakubkrehel/skills, under this license:
//
// MIT License
//
// Copyright (c) 2026 Jakub Krehel
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const TIMEOUT = 30_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type Finding = { severity: "error" | "warning"; variant: string; element: string; problem: string };

function findChrome(): string {
  const candidates = [
    process.env.CHROME,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    Bun.which("google-chrome"),
    Bun.which("chromium"),
    Bun.which("chromium-browser"),
  ];
  const found = candidates.find((c) => c && existsSync(c));
  if (!found) throw new Error("Chrome or Chromium is required; set CHROME to its path");
  return found;
}

async function connect(profile: string) {
  const portFile = join(profile, "DevToolsActivePort");
  const start = Date.now();
  while (!existsSync(portFile) || !readFileSync(portFile, "utf8").includes("\n")) {
    if (Date.now() - start > TIMEOUT) throw new Error("Chrome did not open a debugging port");
    await sleep(100);
  }
  const port = readFileSync(portFile, "utf8").split("\n")[0];
  const targets = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as Array<{ type: string; webSocketDebuggerUrl: string }>;
  const socket = new WebSocket(targets.find((t) => t.type === "page")!.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    socket.onopen = res;
    socket.onerror = rej;
  });
  let id = 0;
  const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  const listeners: Array<(m: any) => void> = [];
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(String(data));
    if (message.id && pending.has(message.id)) {
      const p = pending.get(message.id)!;
      pending.delete(message.id);
      message.error ? p.reject(new Error(message.error.message)) : p.resolve(message.result);
    } else if (message.method) listeners.forEach((l) => l(message));
  };
  const send = (method: string, params: object = {}) =>
    new Promise<any>((res, rej) => {
      pending.set(++id, { resolve: res, reject: rej });
      socket.send(JSON.stringify({ id, method, params }));
    });
  return { send, on: (l: (m: any) => void) => listeners.push(l), close: () => socket.close() };
}

// Runs in the page. Returns findings as {element, problem, severity}.
const AUDIT = `(() => {
  const out = [];
  const add = (severity, element, problem) => out.push({ severity, element, problem });
  const near = (a, b, tol = 1.5) => Math.abs(a - b) <= tol;
  // Contract
  if (!document.querySelector('.opening')) add('error', 'page', 'no <Opening>');
  if (!document.querySelector('.files')) add('error', 'page', 'no <Files />; every touched file belongs in it');
  document.querySelectorAll('.note').forEach((n, i) => {
    const title = n.querySelector('.note-title')?.textContent?.trim();
    const name = 'note ' + (i + 1) + (title ? ' "' + title + '"' : '');
    if (!n.dataset.mark) add('error', name, 'no change mark');
    if (!n.dataset.risk) add('error', name, 'no risk');
    if (!title) add('error', name, 'no title');
  });
  document.querySelectorAll('g.flow-node[data-missing]').forEach((g) => {
    add('error', 'map node ' + g.dataset.node, 'names a note that does not exist; give note the exact title of a <Note>');
  });
  document.querySelectorAll('details.specifics[open]').forEach((d, i) => add('error', 'specifics ' + (i + 1), 'starts open; expected collapsed'));
  // Hygiene. A resource that loads later, such as a lazy image in collapsed specifics,
  // makes no request while checking, so references are read from the page itself.
  const own = (url) => !url || /^(data|blob|about):/.test(url) || url.startsWith('#');
  document.querySelectorAll('[src], [srcset], [poster], link[href], object[data], use[href]').forEach((el) => {
    for (const attr of ['src', 'srcset', 'poster', 'data', 'href']) {
      const value = el.tagName === 'A' ? '' : (el.getAttribute(attr) || '').trim();
      if (!own(value)) add('error', el.tagName.toLowerCase() + '[' + attr + ']', 'loads ' + value + '; pages must be self-contained');
    }
  });
  document.querySelectorAll('[style]').forEach((el) => {
    for (const m of el.getAttribute('style').matchAll(/url\\(\\s*['"]?([^'")]+)/g))
      if (!own(m[1])) add('error', el.tagName.toLowerCase() + '[style]', 'loads ' + m[1] + '; pages must be self-contained');
  });
  const ids = new Map();
  document.querySelectorAll('[id]').forEach((el) => ids.set(el.id, (ids.get(el.id) || 0) + 1));
  ids.forEach((count, id) => count > 1 && add('error', '#' + id, 'id used ' + count + ' times; expected once'));
  document.querySelectorAll('[marker-end], [fill], [clip-path], [mask]').forEach((el) => {
    for (const attr of ['marker-end', 'fill', 'clip-path', 'mask']) {
      const m = (el.getAttribute(attr) || '').match(/url\\(#([^)]+)\\)/);
      if (m && !document.getElementById(m[1])) add('error', attr + ' url(#' + m[1] + ')', 'points at no element');
    }
  });
  document.querySelectorAll('svg [d], svg [x], svg [width]').forEach((el) => {
    for (const attr of ['d', 'x', 'y', 'width', 'height']) {
      if ((el.getAttribute(attr) || '').includes('NaN')) add('error', el.tagName + '[' + attr + ']', 'contains NaN');
    }
  });
  document.querySelectorAll('.code').forEach((c) => {
    const body = c.querySelector('.code-body');
    if (body && body.scrollWidth > body.clientWidth + 1) add('warning', 'code ' + c.querySelector('.code-where')?.textContent, 'scrolls sideways');
  });
  if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
    add('warning', 'page', 'spills horizontally: ' + document.documentElement.scrollWidth + 'px content in ' + document.documentElement.clientWidth + 'px');
  // Geometry, per diagram, in SVG user units
  document.querySelectorAll('figure.flow svg[role=img]').forEach((svg) => {
    const fig = svg.closest('figure');
    // An open step cuts its diagram into slices; the geometry was checked whole.
    if (fig.querySelectorAll(':scope > .flow-slice').length > 1) return;
    const diagram = 'diagram "' + svg.getAttribute('aria-label') + '"';
    const boxes = [...svg.querySelectorAll('g.flow-node')].map((g) => {
      const r = g.querySelector('rect');
      const box = { id: g.dataset.node, x: +r.getAttribute('x'), y: +r.getAttribute('y'), w: +r.getAttribute('width'), h: +r.getAttribute('height') };
      const t = g.querySelector('text').getBBox();
      if (t.x < box.x - 0.5 || t.x + t.width > box.x + box.w + 0.5 || t.y < box.y - 0.5 || t.y + t.height > box.y + box.h + 0.5)
        add('warning', diagram + ' node ' + box.id, 'text ' + Math.round(t.width) + 'px wide overflows a ' + Math.round(box.w) + 'px box');
      return box;
    });
    for (let a = 0; a < boxes.length; a++)
      for (let b = a + 1; b < boxes.length; b++) {
        const A = boxes[a], B = boxes[b];
        const ox = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x), oy = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y);
        if (ox > 0.5 && oy > 0.5) add('warning', diagram, 'nodes ' + A.id + ' and ' + B.id + ' overlap by ' + Math.round(ox) + 'x' + Math.round(oy));
      }
    const byId = new Map(boxes.map((b) => [b.id, b]));
    const onBorder = (b, p) => (near(p.x, b.x) || near(p.x, b.x + b.w)) && p.y >= b.y - 1.5 && p.y <= b.y + b.h + 1.5
      || (near(p.y, b.y) || near(p.y, b.y + b.h)) && p.x >= b.x - 1.5 && p.x <= b.x + b.w + 1.5;
    svg.querySelectorAll('g.flow-edge').forEach((g) => {
      const pts = [...(g.querySelector('path').getAttribute('d') || '').matchAll(/[ML](-?[\\d.]+),(-?[\\d.]+)/g)].map((m) => ({ x: +m[1], y: +m[2] }));
      const from = byId.get(g.dataset.from), to = byId.get(g.dataset.to);
      const edge = diagram + ' edge ' + g.dataset.from + '→' + g.dataset.to;
      if (!from || !to) { add('error', edge, 'names a node that does not exist'); return; }
      if (!onBorder(from, pts[0])) add('warning', edge, 'starts at ' + Math.round(pts[0].x) + ',' + Math.round(pts[0].y) + ', off the border of ' + from.id);
      if (!onBorder(to, pts[pts.length - 1])) add('warning', edge, 'ends at ' + Math.round(pts[pts.length - 1].x) + ',' + Math.round(pts[pts.length - 1].y) + ', off the border of ' + to.id);
    });
    // Labels: inside their space and the diagram, clear of boxes and of each other.
    const [, , vw, vh] = (svg.getAttribute('viewBox') || '0 0 0 0').split(' ').map(Number);
    const labels = [...svg.querySelectorAll('g.flow-edge-label')].map((label) => {
      const t = label.querySelector('text').getBBox(), r = label.querySelector('rect');
      const rx = +r.getAttribute('x'), rw = +r.getAttribute('width');
      const name = diagram + ' edge ' + label.dataset.from + '→' + label.dataset.to + ' label';
      if (t.x < rx - 0.5 || t.x + t.width > rx + rw + 0.5) add('warning', name, 'text ' + Math.round(t.width) + 'px wide overflows its ' + Math.round(rw) + 'px space');
      if (t.x < -0.5 || t.y < -0.5 || t.x + t.width > vw + 0.5 || t.y + t.height > vh + 0.5) add('warning', name, 'sits outside the diagram, so it is cut off');
      for (const b of boxes) {
        const ox = Math.min(t.x + t.width, b.x + b.w) - Math.max(t.x, b.x), oy = Math.min(t.y + t.height, b.y + b.h) - Math.max(t.y, b.y);
        if (ox > 0.5 && oy > 0.5) add('warning', name, 'overlaps node ' + b.id);
      }
      return { name, t };
    });
    for (let a = 0; a < labels.length; a++)
      for (let b = a + 1; b < labels.length; b++) {
        const A = labels[a].t, B = labels[b].t;
        const ox = Math.min(A.x + A.width, B.x + B.width) - Math.max(A.x, B.x), oy = Math.min(A.y + A.height, B.y + B.height) - Math.max(A.y, B.y);
        if (ox > 0.5 && oy > 0.5) add('warning', labels[a].name, 'overlaps ' + labels[b].name.replace(diagram + ' ', ''));
      }
    // Too wide for a desktop column is the author's to fix, with shorter labels or fewer
    // side-by-side branches; too wide for a phone is still the layout's.
    if (svg.getBoundingClientRect().width > fig.clientWidth + 1)
      add(innerWidth >= 700 ? 'error' : 'warning', diagram, 'is ' + Math.round(svg.getBoundingClientRect().width) + 'px wide in a ' + fig.clientWidth + 'px column, so it scrolls sideways' + (innerWidth >= 700 ? '; shorten its labels or put fewer branches side by side' : ''));
    // Rendered size: labels below 11px on screen are unreadable.
    const scale = svg.getBoundingClientRect().width / (+svg.getAttribute('viewBox').split(' ')[2] || 1);
    if (scale * 12 < 11) add('warning', diagram, 'scaled to ' + Math.round(scale * 100) + '%, so edge labels render at ' + (scale * 12).toFixed(1) + 'px; expected 11px or more');
  });
  return out;
})()`;

// Runs in the page. Opens each ref's code card by clicking it, checks the card, and
// closes it with Escape.
const REF_AUDIT = `(async () => {
  const out = [];
  const add = (severity, element, problem) => out.push({ severity, element, problem });
  const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const refs = [...document.querySelectorAll('.ref')];
  for (const [i, ref] of refs.entries()) {
    const name = 'ref ' + (i + 1) + ' "' + ref.textContent.trim().slice(0, 48) + '"';
    // A ref inside collapsed specifics is checked the way a reader reaches it: opened.
    const closed = [];
    for (let d = ref.closest('details'); d; d = d.parentElement.closest('details')) if (!d.open) { d.open = true; closed.push(d); }
    ref.scrollIntoView({ block: 'center' });
    ref.click();
    await frames();
    const card = document.getElementById(ref.getAttribute('aria-controls'));
    if (!card || !card.matches(':popover-open')) { add('error', name, 'did not open its code when clicked'); closed.forEach((d) => (d.open = false)); continue; }
    if (!card.querySelector('.code-line')) add('error', name, 'opened a card with no code');
    const r = card.getBoundingClientRect();
    if (r.left < -0.5 || r.right > innerWidth + 0.5) add('error', name, 'card spans ' + Math.round(r.left) + ' to ' + Math.round(r.right) + 'px in a ' + innerWidth + 'px viewport');
    if (r.top < -0.5 || r.bottom > innerHeight + 0.5) add('error', name, 'card spans ' + Math.round(r.top) + ' to ' + Math.round(r.bottom) + 'px in a ' + innerHeight + 'px tall viewport');
    const a = ref.getClientRects()[0];
    if (r.top < a.bottom && r.bottom > a.top && r.left < a.right && r.right > a.left) add('error', name, 'card covers its own claim');
    const body = card.querySelector('.code-body');
    if (body && body.scrollWidth > body.clientWidth + 1) add('warning', name, 'code scrolls sideways');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await frames();
    if (card.matches(':popover-open')) add('error', name, 'stayed open after Escape');
    closed.forEach((d) => (d.open = false));
  }
  scrollTo(0, 0);
  return out;
})()`;

/**
 * Opens what diagram steps open, as "open all" does: `notes` opens every linked note,
 * `all` code too, `none` closes them. Resolves once the page has settled again.
 */
export async function expand(page: Page, level: "none" | "notes" | "all") {
  await page.evaluate(`document.dispatchEvent(new CustomEvent('explain:expand', { detail: '${level}' }))`);
  await page.evaluate(`new Promise((done) => {
    const frames = () => requestAnimationFrame(() => requestAnimationFrame(done));
    const wait = () => (document.documentElement.getAttribute('aria-busy') === 'false' ? frames() : setTimeout(wait, 50));
    requestAnimationFrame(() => requestAnimationFrame(wait));
  })`);
}

export type Page = {
  evaluate: (expression: string) => Promise<any>;
  /** A raw DevTools Protocol command, such as `Input.dispatchMouseEvent`. */
  send: (method: string, params?: object) => Promise<any>;
  /** Listens to DevTools Protocol events, such as `Page.screencastFrame`. */
  on: (listener: (message: { method: string; params: any }) => void) => void;
  screenshot: (file: string) => Promise<void>;
};

export type Visit = (file: string, width: number, scheme: "light" | "dark") => Promise<Page>;

/**
 * Opens headless Chrome, hands `fn` a function that loads a page at a width and color
 * scheme and waits for aria-busy="false", then closes Chrome. Page errors, console
 * errors, and network requests are collected into `problems`, labeled by visit.
 */
export async function withBrowser<T>(fn: (visit: Visit, problems: Finding[]) => Promise<T>): Promise<T> {
  const profile = mkdtempSync(join(tmpdir(), "explain-check-"));
  const browser = Bun.spawn([findChrome(), "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "about:blank"], { stdout: "ignore", stderr: "ignore" });
  const problems: Finding[] = [];
  try {
    const cdp = await connect(profile);
    let variant = "";
    let pageUrl = "";
    cdp.on(({ method, params }) => {
      if (method === "Runtime.exceptionThrown")
        problems.push({ severity: "error", variant, element: "page", problem: "uncaught: " + (params.exceptionDetails.exception?.description ?? params.exceptionDetails.text) });
      if (method === "Runtime.consoleAPICalled" && params.type === "error")
        problems.push({ severity: "error", variant, element: "page", problem: "console error: " + params.args.map((a: any) => a.value ?? a.description).join(" ") });
      // Only the page's own file may load; anything else, local files included, won't travel with it.
      if (method === "Network.requestWillBeSent" && params.request.url !== pageUrl && !/^(data|blob|about):/.test(params.request.url))
        problems.push({ severity: "error", variant, element: "page", problem: "loads " + params.request.url + "; pages must be self-contained" });
    });
    await cdp.send("Runtime.enable");
    await cdp.send("Network.enable");
    await cdp.send("Page.enable");
    const evaluate = async (expression: string) => {
      const { result, exceptionDetails } = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      // A script that throws must not read as a page with nothing to report.
      if (exceptionDetails) throw new Error(`script failed in the page: ${exceptionDetails.exception?.description ?? exceptionDetails.text}`);
      return result.value;
    };
    const visit: Visit = async (file, width, scheme) => {
      variant = `${width}px ${scheme}`;
      await cdp.send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false });
      await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }] });
      pageUrl = pathToFileURL(resolve(file)).href;
      await cdp.send("Page.navigate", { url: pageUrl });
      const start = Date.now();
      await sleep(200);
      while ((await evaluate(`document.documentElement.getAttribute('aria-busy')`)) !== "false") {
        if (Date.now() - start > TIMEOUT) {
          problems.push({ severity: "error", variant, element: "page", problem: "never settled: aria-busy stayed true for 30s" });
          break;
        }
        await sleep(100);
      }
      return {
        evaluate,
        send: cdp.send,
        on: cdp.on,
        screenshot: async (out: string) => {
          const height = await evaluate(`Math.ceil(document.documentElement.scrollHeight)`);
          await cdp.send("Emulation.setDeviceMetricsOverride", { width, height: Math.min(height || 900, 8000), deviceScaleFactor: 1, mobile: false });
          const shot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
          await Bun.write(out, Buffer.from(shot.data, "base64"));
        },
      };
    };
    const result = await fn(visit, problems);
    cdp.close();
    return result;
  } finally {
    browser.kill();
    await sleep(200);
    rmSync(profile, { recursive: true, force: true });
  }
}

/** Audits a built page at 736px and 360px, light and dark, and saves a screenshot of each. */
export async function check(htmlPath: string, outDir: string): Promise<Finding[]> {
  if (!existsSync(htmlPath)) throw new Error(`no page at ${htmlPath}`);
  mkdirSync(outDir, { recursive: true });
  const findings = await withBrowser(async (visit, problems) => {
    const found: Finding[] = [];
    for (const width of [736, 360])
      for (const scheme of ["light", "dark"] as const) {
        const page = await visit(htmlPath, width, scheme);
        // As the page opens, then with every linked note open, so notes and their
        // diagrams are checked where the reader reaches them.
        for (const f of (await page.evaluate(AUDIT)) ?? []) found.push({ ...f, variant: `${width}px ${scheme}` });
        await expand(page, "notes");
        for (const f of (await page.evaluate(AUDIT)) ?? []) found.push({ ...f, variant: `${width}px ${scheme}` });
        // With code open too, and before the screenshot, which stretches the viewport.
        await expand(page, "all");
        if (scheme === "light") for (const f of (await page.evaluate(REF_AUDIT)) ?? []) found.push({ ...f, variant: `${width}px` });
        await expand(page, "none");
        await page.screenshot(join(outDir, `${width}-${scheme}.png`));
      }
    return [...problems, ...found];
  });
  // The same finding at every width and scheme is reported once.
  const seen = new Map<string, Finding>();
  for (const f of findings) {
    const key = `${f.severity}|${f.element}|${f.problem}`;
    const prior = seen.get(key);
    seen.set(key, prior ? { ...prior, variant: prior.variant === f.variant ? prior.variant : `${prior.variant}, ${f.variant}` } : f);
  }
  return [...seen.values()];
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const html = args.find((a) => !a.startsWith("--"));
  const outIndex = args.indexOf("--out");
  if (!html) {
    console.error("usage: check <page.html> [--out <dir>]");
    process.exit(1);
  }
  const out = outIndex >= 0 ? resolve(args[outIndex + 1]) : join(resolve(html, ".."), "check");
  const findings = await check(html, out);
  for (const f of findings) console.log(`${f.severity === "error" ? "ERROR" : "warn "} ${f.element}: ${f.problem} [${f.variant}]`);
  console.log(`screenshots: ${out}`);
  process.exit(findings.some((f) => f.severity === "error") ? 1 : 0);
}
