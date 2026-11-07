import { useEffect, useLayoutEffect, type ReactNode } from "react";
import { settleIfIdle } from "./settle";
import { CodeView } from "./code";
import { NoteHeading, StepsProvider, useSteps } from "./notes";
import { useCode, useSource, type ChangedFile } from "./source";
import { noteId, type Mark, type Risk } from "./types";

/**
 * The root of every page. `source` names what is explained: `pr:<number>`, a commit,
 * a range `base..head`, or `worktree`. `render` resolves it before building.
 *
 * @example
 * export default function Page() {
 *   return (
 *     <Explanation source="pr:14171">
 *       <Opening>Scripts now find their own Infisical credential.</Opening>
 *       <Note mark="~" risk="medium" title="First usable credential wins">…</Note>
 *     </Explanation>
 *   );
 * }
 */
export function Explanation({ source, children }: { source: string; children: ReactNode }) {
  useEffect(settleIfIdle, []);
  const { colors } = useSource();
  return (
    <article className="explanation" data-source={source}>
      <style>{colors.map(([light, dark], i) => (light && dark ? `.k${i}{color:light-dark(${light},${dark})}` : "")).join("")}</style>
      <StepsProvider>{children}</StepsProvider>
    </article>
  );
}

/**
 * The gist in a sentence or two, without the mechanism the notes show, then the map:
 * a `<Flow>` from what the reader already knows to each changed part, each changed
 * node naming its note.
 *
 * @example
 * <Opening>
 *   <p>Scripts now find their own Infisical credential.</p>
 *   <Flow
 *     label="Where the change sits"
 *     nodes={[
 *       { id: "script", label: "A script needs secrets", unchanged: true },
 *       { id: "pick", label: "Pick a credential", mark: "~", note: "The first usable credential wins" },
 *     ]}
 *     edges={[{ from: "script", to: "pick" }]}
 *   />
 * </Opening>
 */
export function Opening({ children }: { children: ReactNode }) {
  return <div className="opening">{children}</div>;
}

/**
 * One behavior change. Put its diagram, a sentence or two on who it affects and what
 * breaks if it's wrong, then its `<Specifics>`.
 *
 * @example
 * <Note mark="+" risk="high" title="Machine identity login for background agents">
 *   <Flow … />
 *   <p>An agent with a client ID and secret logs in as that identity.</p>
 *   <Specifics summary="2 env vars, 1 side effect">…</Specifics>
 * </Note>
 */
export function Note({ mark, risk, title, children }: { mark: Mark; risk: Risk; title: string; children?: ReactNode }) {
  const id = noteId(title);
  const steps = useSteps();
  // A map can open this note in place, so it registers what it shows.
  useLayoutEffect(() => steps?.register(id, { title, mark, risk, children }), [id, title, mark, risk, children]);
  // A note a map links lives in the map, opening under its step, not in the list.
  if (steps?.linked.has(id)) return null;
  return (
    <section className="note" id={id} data-mark={mark} data-risk={risk}>
      <NoteHeading mark={mark} risk={risk} title={title} />
      {children}
    </section>
  );
}

/**
 * Detail the reader may want later, collapsed by default. `summary` names what is
 * inside ("2 interfaces, 1 side effect"), never just "More".
 */
export function Specifics({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="specifics">
      <summary>
        Specifics <span className="specifics-summary">· {summary}</span>
      </summary>
      <div className="specifics-body">{children}</div>
    </details>
  );
}

/**
 * Code from the source with what the change did to it, resolved like `<Ref>`: give
 * `file`, and `symbol` or `match` to narrow it. Lines far from a change fold away.
 * For a before-and-after in words rather than code, pass lines prefixed with `+`,
 * `-`, or a space as children instead.
 *
 * @example
 * <Diff file="internal/secrets.ts" symbol="getInfisicalSecretsForEnvironment" />
 * <Diff>{`- returned {} when no token was set
 * + throws "No usable Infisical credentials"`}</Diff>
 */
export function Diff(props: { file: string; symbol?: string; match?: string } | { children: string }) {
  if ("file" in props) return <ResolvedDiff {...props} />;
  const lines = props.children.replace(/^\n+|\s+$/g, "").split("\n");
  return (
    <pre className="diff">
      {lines.map((line, i) => {
        const kind = line.startsWith("+") ? "add" : line.startsWith("-") ? "remove" : "context";
        return (
          <span key={i} className={`diff-line diff-${kind}`}>
            {line}
            {"\n"}
          </span>
        );
      })}
    </pre>
  );
}

function ResolvedDiff({ file, symbol, match }: { file: string; symbol?: string; match?: string }) {
  return <CodeView code={useCode(file, symbol, match)} />;
}

/** A small pending action the reader must take outside the code. Use rarely. */
export function Check({ children }: { children: ReactNode }) {
  return (
    <p className="check">
      <strong>Check:</strong> {children}
    </p>
  );
}

/** Behaviors that need no note, one self-contained item each. */
export function Also({ children }: { children: ReactNode }) {
  return (
    <section className="closing">
      <h3>Also changed</h3>
      {children}
    </section>
  );
}

/** What ran and who ran it, then the gaps that limit a note. */
export function Validation({ children }: { children: ReactNode }) {
  return (
    <section className="closing">
      <h3>Validation</h3>
      {children}
    </section>
  );
}

/**
 * Every touched file, built from the resolved source. `notes` adds a few words to a
 * file no note covers. Tests, lockfiles, and generated files are counted, not listed.
 */
export function Files({ notes = {} }: { notes?: Record<string, string> }) {
  const { files } = useSource();
  const isTest = (f: ChangedFile) => /(^|\/)(__tests__|tests?)\/|\.(test|spec)\.[a-z]+$/.test(f.path);
  const listed = files.filter((f) => !isTest(f) && !f.generated);
  const tests = files.filter((f) => isTest(f) && !f.generated);
  const generated = files.filter((f) => f.generated);
  const groups = new Map<string, ChangedFile[]>();
  for (const f of listed) {
    const dir = f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/") + 1) : "";
    groups.set(dir, [...(groups.get(dir) ?? []), f]);
  }
  const mark = (f: ChangedFile): Mark | "→" => (f.status === "added" ? "+" : f.status === "removed" ? "-" : f.status === "renamed" ? "→" : "~");
  return (
    <section className="closing">
      <h3>Files</h3>
      <ul className="files">
        {[...groups].sort(([a], [b]) => a.localeCompare(b)).map(([dir, fs]) => (
          <li key={dir}>
            {dir && <span className="files-dir">{dir}</span>}
            <ul>
              {fs.map((f) => (
                <li key={f.path} className="files-file">
                  <span className={`mark mark-${f.status === "added" ? "add" : f.status === "removed" ? "remove" : "change"}`}>{mark(f)}</span>{" "}
                  <code>{f.path.slice(dir.length)}</code>
                  {f.from && <span className="files-note"> was {f.from}</span>}
                  {notes[f.path] && <span className="files-note"> {notes[f.path]}</span>}
                  <span className="files-stats">
                    <span className="stat-add">+{f.additions}</span> <span className="stat-remove">−{f.deletions}</span>
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
        {tests.length > 0 && (
          <li className="files-file files-tests">
            {tests.length} test {tests.length === 1 ? "file" : "files"}
          </li>
        )}
        {generated.length > 0 && (
          <li className="files-file files-tests">
            {generated.length} generated {generated.length === 1 ? "file" : "files"}
          </li>
        )}
      </ul>
    </section>
  );
}
