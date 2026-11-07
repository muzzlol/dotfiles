// Builds a page with refs through the whole pipeline, then drives it with real mouse,
// touch, and key events in headless Chrome. Needs `gh`, Chrome, and the clone in
// EXPLAIN_TEST_REPO (default ~/dev/work/greptilia). Screenshots go to EXPLAIN_SHOTS.
import { $ } from "bun";
import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { expand, withBrowser, type Page } from "../check";

const ROOT = join(import.meta.dir, "..");
const REPO = process.env.EXPLAIN_TEST_REPO ?? join(homedir(), "dev/work/greptilia");
const SHOTS = process.env.EXPLAIN_SHOTS ?? join(tmpdir(), "explain-shots");
const suite = existsSync(REPO) ? describe : describe.skip;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The claim whose text includes `text`. */
const ref = (text: string) => `[...document.querySelectorAll('.ref')].find((r) => r.textContent.includes(${JSON.stringify(text)}))`;

/** The center of a claim, scrolled into view. */
async function refAt(page: Page, text: string): Promise<{ x: number; y: number }> {
  return page.evaluate(`(() => {
    const el = ${ref(text)};
    el.scrollIntoView({ block: 'center' });
    const r = el.getClientRects()[0];
    return { x: r.left + Math.min(r.width / 2, 40), y: r.top + r.height / 2 };
  })()`);
}

const cardState = (page: Page, text: string) =>
  page.evaluate(`(() => {
    const ref = ${ref(text)};
    const card = document.getElementById(ref.getAttribute('aria-controls'));
    const open = card.matches(':popover-open');
    const r = card.getBoundingClientRect();
    return {
      open,
      expanded: ref.getAttribute('aria-expanded'),
      head: card.querySelector('.code-head')?.textContent ?? '',
      marked: [...card.querySelectorAll('.code-line.marked .code-src')].map((l) => l.textContent.trim()),
      box: open ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom } : null,
      viewport: { width: innerWidth, height: innerHeight },
      focused: document.activeElement === ref,
    };
  })()`);

const mouse = (page: Page, type: "mouseMoved" | "mousePressed" | "mouseReleased", x: number, y: number) =>
  page.send("Input.dispatchMouseEvent", { type, x, y, button: type === "mouseMoved" ? "none" : "left", clickCount: type === "mouseMoved" ? 0 : 1 });

async function click(page: Page, x: number, y: number) {
  await mouse(page, "mouseMoved", x, y);
  await mouse(page, "mousePressed", x, y);
  await mouse(page, "mouseReleased", x, y);
}

const key = async (page: Page, key: string, code: string, keyCode: number) => {
  await page.send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: keyCode });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: keyCode });
};

async function shot(page: Page, name: string) {
  mkdirSync(SHOTS, { recursive: true });
  const { data } = await page.send("Page.captureScreenshot", { format: "png" });
  await Bun.write(join(SHOTS, name), Buffer.from(data, "base64"));
}

suite("a built page with refs", () => {
  let html: string;
  beforeAll(async () => {
    const out = await $`bun ${join(ROOT, "render.ts")} ${join(import.meta.dir, "fixtures/refs-14171.tsx")} --no-archive`.cwd(REPO).quiet();
    html = out.stdout.toString().trim().split("\n").pop()!;
  }, 180_000);

  test("mouse, keyboard, and folds", async () => {
    await withBrowser(async (visit, problems) => {
      const page = await visit(html, 736, "light");
      // Notes live in the map; open them as a reader would to reach their claims.
      await expand(page, "notes");

      // Hovering peeks; the card shows the named code with the matched line marked.
      let at = await refAt(page, "resolved once per process");
      await mouse(page, "mouseMoved", at.x, at.y);
      await sleep(400);
      let state = await cardState(page, "resolved once per process");
      expect(state.open).toBe(true);
      expect(state.head).toContain("internal/secrets.ts · getInfisicalSecretsForEnvironment");
      expect(state.marked).toEqual(["infisicalCredentials ??= resolveInfisicalCredentials()"]);
      // Below the claim, or above it when there's more room there; never over it.
      expect(state.box!.top > at.y || state.box!.bottom < at.y).toBe(true);
      await shot(page, "hover-736-light.png");

      // Moving into the card keeps it; leaving both closes it.
      await mouse(page, "mouseMoved", state.box!.left + 40, state.box!.top + 30);
      await sleep(400);
      expect((await cardState(page, "resolved once per process")).open).toBe(true);
      await mouse(page, "mouseMoved", 5, 5);
      await sleep(400);
      expect((await cardState(page, "resolved once per process")).open).toBe(false);

      // Clicking pins it past the pointer leaving; clicking elsewhere closes it.
      at = await refAt(page, "resolved once per process");
      await click(page, at.x, at.y);
      await mouse(page, "mouseMoved", 5, 5);
      await sleep(400);
      expect((await cardState(page, "resolved once per process")).expanded).toBe("true");
      await click(page, 5, 5);
      await sleep(100);
      expect((await cardState(page, "resolved once per process")).open).toBe(false);

      // A pinned card follows its claim as the page scrolls, and closes once the claim is off screen.
      at = await refAt(page, "a failed fetch makes the next call");
      await click(page, at.x, at.y);
      const pinned = await cardState(page, "a failed fetch makes the next call");
      expect(pinned.marked).toEqual(["infisicalCredentials = undefined"]);
      await page.evaluate(`scrollBy(0, 40)`);
      await sleep(100);
      expect((await cardState(page, "a failed fetch makes the next call")).box!.top).toBeCloseTo(pinned.box!.top - 40, 0);
      await refAt(page, "sample");
      await sleep(100);
      expect((await cardState(page, "a failed fetch makes the next call")).open).toBe(false);

      // Opening another card closes the first.
      at = await refAt(page, "sample");
      await click(page, at.x, at.y);
      at = await refAt(page, "imports it instead of keeping");
      await mouse(page, "mouseMoved", at.x, at.y);
      await sleep(400);
      expect((await cardState(page, "sample")).open).toBe(false);
      expect((await cardState(page, "imports it instead of keeping")).head).toContain("internal/cli/agentvault/lib.ts");
      await key(page, "Escape", "Escape", 27);

      // Keyboard: Enter opens, Escape closes and returns focus to the claim.
      await page.evaluate(`(() => { const ref = ${ref("Expiry comes from")}; ref.closest('details').open = true; ref.focus(); })()`);
      await key(page, "Enter", "Enter", 13);
      await sleep(100);
      expect((await cardState(page, "Expiry comes from")).head).toContain("getTokenExpiry");
      await key(page, "Escape", "Escape", 27);
      await sleep(100);
      state = await cardState(page, "Expiry comes from");
      expect(state.open).toBe(false);
      expect(state.focused).toBe(true);

      // A peeked card closes when the page scrolls.
      at = await refAt(page, "imports it instead of keeping");
      await mouse(page, "mouseMoved", at.x, at.y);
      await sleep(400);
      expect((await cardState(page, "imports it instead of keeping")).head).toContain("internal/cli/agentvault/lib.ts");
      await page.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: at.x, y: at.y, deltaX: 0, deltaY: -300 });
      await sleep(300);
      expect((await cardState(page, "imports it instead of keeping")).open).toBe(false);

      // The map: a step opens its note in place, right under the step, and a step in that
      // note's diagram opens its code the same way; the rest of each diagram moves down.
      await expand(page, "none");
      await page.evaluate(`scrollTo(0, 0)`);
      const center = (selector: string) =>
        page.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      const rect = (selector: string) => page.evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect(); return r && { top: r.top, bottom: r.bottom }; })()`);
      const pick = 'g.flow-node[data-target="note-the-first-usable-credential-wins"] rect';
      expect(await page.evaluate(`document.querySelectorAll('.note').length`)).toBe(0);
      let s = await center(pick);
      await click(page, s.x, s.y);
      await sleep(300);
      const step = (await rect(pick))!;
      const band = (await rect(".step-band.note"))!;
      expect(band.top).toBeGreaterThan(step.bottom);
      expect(band.top - step.bottom).toBeLessThan(40);
      expect(await page.evaluate(`document.querySelector('.step-band .note-title').textContent`)).toBe("The first usable credential wins");
      // Steps below the cut sit below the note.
      expect((await rect('g.flow-node[data-node="fetch"] rect'))!.top).toBeGreaterThan(band.bottom);
      s = await center('.step-band g.flow-node[data-node="id"] rect');
      await click(page, s.x, s.y);
      await sleep(300);
      expect(await page.evaluate(`document.querySelector('.code-band .code-line.marked .code-src').textContent.trim()`)).toBe("if (clientId && clientSecret) {");
      await click(page, s.x, s.y);
      await sleep(200);
      expect(await page.evaluate(`document.querySelector('.code-band')`)).toBeNull();
      s = await center(".step-band-close");
      await click(page, s.x, s.y);
      await sleep(200);
      expect(await page.evaluate(`document.querySelector('.step-band')`)).toBeNull();
      // Open all reads every linked note in map order.
      s = await center(".flow-open-all");
      await click(page, s.x, s.y);
      await sleep(400);
      expect(await page.evaluate(`[...document.querySelectorAll('.step-band .note-title')].map((t) => t.textContent)`)).toEqual([
        "config/.env is no longer copied into the environment",
        "The first usable credential wins",
        "The CLI login session is a credential source",
        "No credential is now a credential error",
      ]);
      await expand(page, "notes");

      // Folded lines in a block open in place.
      const folds = await page.evaluate(`(() => {
        const block = [...document.querySelectorAll('.note .code')].find((c) => c.closest('details'));
        block.closest('details').open = true;
        const before = block.querySelectorAll('.code-line').length;
        block.querySelector('button.code-fold').click();
        return new Promise((r) => requestAnimationFrame(() => r({ before, after: block.querySelectorAll('.code-line').length })));
      })()`);
      expect(folds.after).toBeGreaterThan(folds.before);

      expect(problems).toEqual([]);
    });
  }, 60_000);

  test("touch on a phone, and colors in dark mode", async () => {
    await withBrowser(async (visit, problems) => {
      let page = await visit(html, 360, "light");
      await expand(page, "notes");
      await page.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
      const at = await refAt(page, "exits at once instead");
      await page.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: at.x, y: at.y }] });
      await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await sleep(300);
      const state = await cardState(page, "exits at once instead");
      expect(state.open).toBe(true);
      expect(state.head).toContain("getInfisicalCliToken");
      expect(state.box!.left).toBeGreaterThanOrEqual(0);
      expect(state.box!.right).toBeLessThanOrEqual(state.viewport.width);
      expect(state.box!.bottom).toBeLessThanOrEqual(state.viewport.height);
      await shot(page, "tap-360-light.png");

      page = await visit(html, 736, "dark");
      await expand(page, "notes");
      const ref = await refAt(page, "used to write the token");
      await click(page, ref.x, ref.y);
      await sleep(200);
      const color = await page.evaluate(`(() => {
        const card = document.querySelector('.ref-card:popover-open');
        const kw = [...card.querySelectorAll('.code-src span')].find((s) => s.textContent.trim() === 'function');
        return getComputedStyle(kw).color;
      })()`);
      expect(color).toBe("rgb(249, 117, 131)");
      await shot(page, "removed-736-dark.png");
      expect(problems).toEqual([]);
    });
  }, 60_000);
});
