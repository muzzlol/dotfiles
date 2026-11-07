// The component gallery: every component a page is built from, rendered live from
// real content (PR #14171 in greptilia), with each part pinned and named.
// Build: bun render.ts gallery.tsx --repo ~/dev/work/greptilia --out <file>.html
import type { ReactNode } from "react";
import {
  Also,
  Check,
  Diff,
  Explanation,
  Files,
  Flow,
  Note,
  Opening,
  Ref,
  Specifics,
  useCode,
  useEffect,
  useRef,
  useSource,
  useState,
  Validation,
} from "explain";

/** `side` puts the pin in the margin left of its part (the default), above it, or right of it. */
type Pin = { at: string; name: string; does: ReactNode; side?: "left" | "above" | "right" };
type Spot = { x: number; y: number; w: number; h: number } | null;

/**
 * Renders a live specimen, then pins each part `pins` names by CSS selector and lists
 * them below. Hovering a legend line or a pinned part outlines the part and lights its
 * line. Free JSX: the same checks run over it.
 */
function Anatomy({ pins, children }: { pins: Pin[]; children: ReactNode }) {
  const frame = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [spots, setSpots] = useState<Spot[]>([]);
  const [hot, setHot] = useState<number | null>(null);
  const targets = useRef<Array<Element | null>>([]);

  useEffect(() => {
    const measure = () => {
      const base = frame.current!.getBoundingClientRect();
      targets.current = pins.map((p) => stage.current!.querySelector(p.at));
      setSpots(
        pins.map((p, i) => {
          const r = targets.current[i]?.getBoundingClientRect();
          return r && (r.width || r.height) ? { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height } : null;
        }),
      );
    };
    measure();
    // The stage changes as diagrams lay out and folds open; the pins live outside it.
    const resize = new ResizeObserver(measure);
    resize.observe(stage.current!);
    const mutate = new MutationObserver(measure);
    mutate.observe(stage.current!, { subtree: true, childList: true, attributes: true });
    return () => {
      resize.disconnect();
      mutate.disconnect();
    };
  }, []);

  // Pins sit beside their part rather than on it, nudged down when two would touch.
  const placed: Array<{ x: number; y: number } | null> = [];
  spots.forEach((s, i) => {
    if (!s) return placed.push(null);
    const side = pins[i].side ?? "left";
    const x = Math.max(0, side === "left" ? s.x - 21 : side === "right" ? s.x + s.w + 5 : s.x);
    let y = Math.max(0, side === "above" ? s.y - 19 : s.y + s.h / 2 - 8);
    while (placed.some((p) => p && Math.abs(p.x - x) < 18 && Math.abs(p.y - y) < 18)) y += 18;
    placed.push({ x, y });
  });

  return (
    <div className="g-anatomy">
      <div className="g-frame" ref={frame}>
        <div
          className="g-stage"
          ref={stage}
          onPointerOver={(e) => {
            const i = targets.current.findIndex((t) => t?.contains(e.target as Node));
            setHot(i >= 0 ? i : null);
          }}
          onPointerLeave={() => setHot(null)}
        >
          {children}
        </div>
        {hot !== null && spots[hot] && (
          <div className="g-outline" style={{ left: spots[hot]!.x - 3, top: spots[hot]!.y - 3, width: spots[hot]!.w + 6, height: spots[hot]!.h + 6 }} />
        )}
        {placed.map(
          (p, i) =>
            p && (
              <span key={i} className={hot === i ? "g-pin hot" : "g-pin"} style={{ left: p.x, top: p.y }} aria-hidden="true">
                {i + 1}
              </span>
            ),
        )}
      </div>
      <ol className="g-legend">
        {pins.map((p, i) => (
          <li key={i} onPointerEnter={() => setHot(i)} onPointerLeave={() => setHot(null)} className={hot === i ? "hot" : undefined}>
            <span className="g-num">{i + 1}</span>
            <span>
              <b>{p.name}</b> {p.does}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** One component: its name, what it's for, the specimen, and the TSX that made it. */
function Section({ name, is, tsx, children }: { name: string; is: ReactNode; tsx: string; children: ReactNode }) {
  return (
    <section className="g-section">
      <h2 className="g-name">{name}</h2>
      <p className="g-is">{is}</p>
      {children}
      <details className="g-tsx">
        <summary>TSX</summary>
        <pre>{tsx.trim()}</pre>
      </details>
    </section>
  );
}

/** Reads the resolved source, as any free JSX may. */
function SourceFacts() {
  const s = useSource();
  return (
    <p className="g-facts">
      This page resolved <code>{s.source}</code> to <code>{s.base.slice(0, 8)}</code> → <code>{s.head.slice(0, 8)}</code>,{" "}
      {s.files.length} files, and {Object.keys(s.refs).length} pieces of code.
    </p>
  );
}

/** A custom view of resolved code: counts what the change did to one function. */
function ChangeCount() {
  const code = useCode("internal/secrets.ts", "getInfisicalSecretsForEnvironment", "infisicalCredentials ??= resolveInfisicalCredentials()");
  const added = code.lines.filter((l) => l.kind === "+").length;
  const removed = code.lines.filter((l) => l.kind === "-").length;
  return (
    <p className="g-facts">
      <code>{code.symbol}</code> is {code.status}: {added} lines added, {removed} removed.
    </p>
  );
}

const STYLE = `
.g-section { border-top: 1px solid var(--border); padding: 26px 0 10px; }
.g-name { font: 500 13px var(--mono); margin: 0 0 4px; color: var(--fg); }
.g-is { color: var(--muted); margin: 0 0 14px; }
.g-anatomy { margin: 0 0 10px; }
.g-frame { position: relative; padding: 22px 24px 8px 28px; border: 1px dashed var(--border); border-radius: 8px; }
.g-stage .note { border-top: 0; padding-top: 0; }
.g-stage .closing:first-child { border-top: 0; padding-top: 0; margin-top: 0; }
.g-pin {
  position: absolute; width: 16px; height: 16px; border-radius: 8px;
  background: var(--fg); color: var(--bg); font: 500 10.5px/16px var(--font); text-align: center;
  pointer-events: none; transition: transform 120ms ease;
}
.g-pin.hot { transform: scale(1.25); }
.g-outline { position: absolute; border: 1.5px solid var(--fg); border-radius: 5px; pointer-events: none; }
.g-legend { list-style: none; margin: 12px 0 0; padding: 0; font-size: 13.5px; }
.g-legend li { display: flex; gap: 10px; padding: 3px 6px; border-radius: 5px; cursor: default; }
.g-legend li.hot { background: var(--surface); }
.g-legend b { font-weight: 500; }
.g-num {
  flex: none; width: 18px; height: 18px; border-radius: 9px; margin-top: 2px;
  border: 1px solid var(--fg); font: 500 11px/16px var(--font); text-align: center;
}
.g-tsx > summary { cursor: pointer; color: var(--muted); font-size: 12.5px; width: fit-content; }
.g-tsx pre { font: 12px/1.6 var(--mono); background: var(--surface); padding: 10px 12px; border-radius: 6px; white-space: pre-wrap; }
.g-facts { font-size: 14px; }
@media (prefers-reduced-motion: reduce) { .g-pin { transition: none; } }
`;

export default function Gallery() {
  return (
    <Explanation source="pr:14171">
      <style>{STYLE}</style>
      <Opening>
        <p>
          Every component an explanation page is built from, rendered live from PR #14171. Numbers pin each part; hover a line
          under a specimen to outline its part, and hover underlined text to open its code.
        </p>
      </Opening>

      <Section
        name="<Explanation source>"
        is="The root. render resolves source to two commits before building, and everything inside reads from them."
        tsx={`<Explanation source="pr:14171">…</Explanation>
// or "commit:<rev>", "a..b", "a...b", "worktree", "worktree:main", each with optional " -- <paths>"`}
      >
        <SourceFacts />
      </Section>

      <Section
        name="<Opening> and its map"
        is="The gist in a sentence or two, then a map: the shortest path from something the reader knows to each changed part. Changed steps link to their notes; what happens inside them is the notes' job."
        tsx={`<Opening>
  <p>Scripts now find their own Infisical credential…</p>
  <Flow
    label="Where the change sits when a script asks for secrets"
    nodes={[
      { id: "script", label: "A script calls getScriptSecrets", unchanged: true },
      { id: "pick", label: "Pick a credential", mark: "~" },
      { id: "none", label: "Throw a credential error", mark: "~",
        note: "Nothing usable throws a credential error" },
      { id: "fetch", label: "Fetch secrets from Infisical", unchanged: true },
    ]}
    edges={[
      { from: "script", to: "pick" },
      { from: "pick", to: "fetch", label: "found one" },
      { from: "pick", to: "none", label: "none usable" },
    ]}
  />
</Opening>`}
      >
        <Anatomy
          pins={[
            { at: '[data-node="script"] rect', name: "trigger", does: "something the reader already knows sets the code in motion; unchanged, so faded." },
            { at: '[data-node="pick"] rect', name: "changed step", does: "marked; its note explains what happens inside it." },
            { at: '[data-node="none"] rect', name: "linked step", does: "note names a note's title, and the note lives here: click to open it in place, under the step, as the rest of the map moves down. The build fails if no note has that title." },
            { at: ".flow-open-all", name: "Open all", does: "opens every linked note in map order, for reading straight through." },
          ]}
        >
          <Flow
            label="Where the change sits when a script asks for secrets"
            nodes={[
              { id: "script", label: "A script calls getScriptSecrets", unchanged: true },
              { id: "pick", label: "Pick a credential", mark: "~" },
              { id: "none", label: "Throw a credential error", mark: "~", note: "Nothing usable throws a credential error" },
              { id: "fetch", label: "Fetch secrets from Infisical", unchanged: true },
            ]}
            edges={[
              { from: "script", to: "pick" },
              { from: "pick", to: "fetch", label: "found one" },
              { from: "pick", to: "none", label: "none usable" },
            ]}
          />
          <Note mark="~" risk="medium" title="Nothing usable throws a credential error">
            <p>
              With no usable credential,{" "}
              <Ref file="internal/secrets.ts" symbol="resolveInfisicalCredentials" match="No usable Infisical credentials">
                getScriptSecrets throws
              </Ref>{" "}
              and lists each credential it skipped, instead of failing later on a missing secret.
            </p>
          </Note>
        </Anatomy>
      </Section>

      <Section
        name="<Note mark risk title>"
        is="One behavior change, holding everything about it: diagram, a sentence or two, specifics."
        tsx={`<Note mark="~" risk="medium" title="No credential is now a credential error">
  <p>… <Ref file="internal/secrets.ts" symbol="resolveInfisicalCredentials"
          match="No usable Infisical credentials">fails with a message</Ref> …</p>
  <Specifics summary="old and new message">…</Specifics>
</Note>`}
      >
        <Anatomy
          pins={[
            { at: ".note-heading .mark", name: "mark", does: "+ added, ~ changed, - removed, from mark." },
            { at: ".note-title", name: "title", does: "the behavior in a few words.", side: "above" },
            { at: ".risk", name: "risk", does: "high, medium, or low, with a colored dot." },
            { at: ".ref", name: "<Ref>", does: "a claim tied to its code; hover it.", side: "above" },
            { at: ".specifics > summary", name: "<Specifics>", does: "collapsed detail, its summary naming what's inside." },
          ]}
        >
          <Note mark="~" risk="medium" title="No credential is now a credential error">
            <p>
              A call with no usable credential{" "}
              <Ref file="internal/secrets.ts" symbol="resolveInfisicalCredentials" match="No usable Infisical credentials">
                fails with a message that says what to do
              </Ref>
              , instead of returning nothing and failing later on a missing secret.
            </p>
            <Specifics summary="old and new message">
              <Diff>{`- "Missing required secrets for <env> from infisical: <keys>"
+ "No usable Infisical credentials. Run \`infisical login\`, or set
+  INFISICAL_CLIENT_ID and INFISICAL_CLIENT_SECRET. Skipped: <reasons>"`}</Diff>
            </Specifics>
          </Note>
        </Anatomy>
      </Section>

      <Section
        name="<Flow label nodes edges>"
        is="A diagram laid out during the build: boxes sized to their text, edges routed around them, a wide and a narrow layout stored."
        tsx={`<Flow
  label="The order getScriptSecrets tries credentials in"
  nodes={[
    { id: "env", label: "Token in environment", mark: "~" },
    { id: "id", label: "Machine identity", mark: "+",
      code: { file: "internal/secrets.ts", symbol: "resolveInfisicalCredentials", match: "if (clientId && clientSecret)" } },
    { id: "cli", label: "infisical login session", mark: "+" },
    { id: "cfg", label: "Token in config/.env", unchanged: true },
    { id: "use", label: "Use it" },
    { id: "fresh", label: "CLI refreshes its own token", mark: "?" },
  ]}
  edges={[
    { from: "env", to: "use", label: "unexpired" },
    { from: "env", to: "id", label: "missing or expired" },
    { from: "id", to: "use", label: "ID and secret set" },
    { from: "id", to: "cli", label: "otherwise" },
    { from: "cli", to: "use", label: "prints a token" },
    { from: "cli", to: "fresh", dashed: true },
    { from: "cli", to: "cfg", label: "otherwise" },
  ]}
/>`}
      >
        <Anatomy
          pins={[
            { at: '[data-node="id"] rect', name: "code step", does: "mark: what the change did to the step; code: click to open that code in place, under the step." },
            { at: '[data-node="cfg"] rect', name: "unchanged node", does: "unchanged: faded context the change didn't touch." },
            { at: '[data-node="fresh"] rect', name: "? node", does: "mark: \"?\" for something the code couldn't confirm." },
            { at: ".flow-edge-label", name: "edge label", does: "the real condition, sitting on its own edge." },
            { at: ".flow-edge-line.dashed", name: "dashed edge", does: "dashed: a fallback, or a path that no longer runs." },
          ]}
        >
          <Flow
            label="The order getScriptSecrets tries credentials in"
            nodes={[
              { id: "env", label: "Token in environment", mark: "~" },
              { id: "id", label: "Machine identity", mark: "+", code: { file: "internal/secrets.ts", symbol: "resolveInfisicalCredentials", match: "if (clientId && clientSecret)" } },
              { id: "cli", label: "infisical login session", mark: "+" },
              { id: "cfg", label: "Token in config/.env", unchanged: true },
              { id: "use", label: "Use it" },
              { id: "fresh", label: "CLI refreshes its own token", mark: "?" },
            ]}
            edges={[
              { from: "env", to: "use", label: "unexpired" },
              { from: "env", to: "id", label: "missing or expired" },
              { from: "id", to: "use", label: "ID and secret set" },
              { from: "id", to: "cli", label: "otherwise" },
              { from: "cli", to: "use", label: "prints a token" },
              { from: "cli", to: "fresh", dashed: true },
              { from: "cli", to: "cfg", label: "otherwise" },
            ]}
          />
        </Anatomy>
      </Section>

      <Section
        name="<Diff file symbol match> and <Ref>"
        is="Code read from the repository at the source's commits, never copied into the page. <Diff> shows it as a block; <Ref> shows the same view in a card when its claim is hovered or tapped."
        tsx={`<Diff file="internal/secrets.ts" symbol="getInfisicalSecretsForEnvironment"
      match="infisicalCredentials ??= resolveInfisicalCredentials()" />`}
      >
        <Anatomy
          pins={[
            { at: ".code-head .mark", name: "status mark", does: "added, removed, changed, renamed, or moved, worked out by render." },
            { at: ".code-where", name: "where", does: "file · symbol: a definition, a dotted path, a config key, or a Markdown heading.", side: "above" },
            { at: ".code-status", name: "status", does: "in words, with the old name or path for a rename or move.", side: "above" },
            { at: ".code-link", name: "source link", does: "the lines on GitHub, for commits a remote has." },
            { at: ".code-remove", name: "removed line", does: "unnumbered beside current lines, so the numbers count one version." },
            { at: ".code-line.marked", name: "marked line", does: "contains match; this is the line the claim is about." },
            { at: "button.code-fold", name: "fold", does: "unchanged lines folded away; click to open them in place." },
          ]}
        >
          <Diff file="internal/secrets.ts" symbol="getInfisicalSecretsForEnvironment" match="infisicalCredentials ??= resolveInfisicalCredentials()" />
        </Anatomy>
      </Section>

      <Section
        name="<Diff> with written lines"
        is="A before and after in words, such as a message or output. Copying a line of the change here fails the build."
        tsx={`<Diff>{\`- returned {} when no credential was set
+ throws "No usable Infisical credentials"\`}</Diff>`}
      >
        <Diff>{`- returned {} when no credential was set, then failed on the first missing secret
+ throws "No usable Infisical credentials", listing each credential it skipped`}</Diff>
      </Section>

      <Section
        name="<Files notes>"
        is="Every touched file, built from the source. Pass notes only for files no note covers."
        tsx={`<Files notes={{ "docs/content/tutorials/setup-greptilia.md": "sample project ID updated" }} />`}
      >
        <Anatomy
          pins={[
            { at: ".files-dir", name: "directory", does: "files grouped by where they live." },
            { at: ".files-file .mark", name: "mark", does: "+ added, ~ changed, - removed, → renamed." },
            { at: ".files-note", name: "note", does: "from notes, for a file no note explains.", side: "right" },
            { at: ".files-stats", name: "line counts", does: "lines added and removed." },
            { at: ".files-tests", name: "tests", does: "counted, not listed; so are lockfiles and generated files." },
          ]}
        >
          <Files notes={{ "docs/content/tutorials/setup-greptilia.md": "sample project ID updated" }} />
        </Anatomy>
      </Section>

      <Section
        name="<Also>, <Validation>, <Check>"
        is="The closing parts. Check is rare: something outside the code to confirm before the behavior is safe."
        tsx={`<Also><ul><li>…</li></ul></Also>
<Validation><p>…</p></Validation>
<Check>…</Check>`}
      >
        <Anatomy
          pins={[
            { at: ".closing h3", name: "<Also>", does: "behaviors that need no note, one self-contained line each." },
            { at: ".closing + .closing h3", name: "<Validation>", does: "what ran and who ran it, then the gaps that limit a note." },
            { at: ".check", name: "<Check>", does: "an action outside the code, before the behavior is safe." },
          ]}
        >
          <Also>
            <ul>
              <li>
                <code>agentvault</code> imports the project ID from <code>internal/secrets.ts</code> instead of keeping a copy.
              </li>
            </ul>
          </Also>
          <Validation>
            <p>CI reported typecheck and tests passing. The machine-identity login is untested against real Infisical.</p>
          </Validation>
          <Check>
            run <code>infisical login</code> once on each machine that runs these scripts without a token.
          </Check>
        </Anatomy>
      </Section>

      <Section
        name="Anything else: free JSX"
        is="A page may hold any JSX or SVG. useSource() gives the resolved commits and files; useCode() gives resolved code for a custom view. The pins on this page are free JSX too, and the same checks ran over them."
        tsx={`function ChangeCount() {
  const code = useCode("internal/secrets.ts", "getInfisicalSecretsForEnvironment", "…");
  const added = code.lines.filter((l) => l.kind === "+").length;
  …
}`}
      >
        <ChangeCount />
      </Section>
    </Explanation>
  );
}
