// The layout engine is chosen at build time: `render` maps "explain-engine" to
// engine-elk while laying out and to engine-static in the published page.
import { layoutFlow } from "explain-engine";
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { CodeView } from "./code";
import { EDGE_LINE, NARROW_BELOW, NODE_LINE, type Box, type Laid } from "./engine";
import { fontOf } from "./measure";
import { NoteHeading, useSteps } from "./notes";
import { useCode } from "./source";
import { startWork } from "./settle";
import { noteId, type DiagramMark } from "./types";

export type FlowNode = {
  id: string;
  /** What the step does, in the reader's words. */
  label: string;
  /** How the change touched this step, or `?` when unconfirmed. Omit for unchanged steps. */
  mark?: DiagramMark;
  /** Draws the step faded, for context the change didn't touch. */
  unchanged?: boolean;
  /** In a map, the title of the note that covers this step. The note then lives in the map: clicking the step opens it right here, under the step. */
  note?: string;
  /** Code this step runs, resolved like `<Ref>`. Clicking the step opens it right here, under the step. */
  code?: { file: string; symbol?: string; match?: string };
};

export type FlowEdge = {
  from: string;
  to: string;
  /** The real condition or operation, in a few words. */
  label?: string;
  mark?: DiagramMark;
  /** Draws the edge dashed, such as for a fallback or a path that no longer runs. */
  dashed?: boolean;
};

export type FlowProps = {
  /** One sentence naming what the diagram shows, for screen readers. */
  label: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  /** Direction of the main flow. Default `"down"`. */
  direction?: "down" | "right";
};

/**
 * A flow diagram laid out automatically. Boxes are sized to their measured text, long
 * labels wrap, and edges are routed around boxes with each label on its own edge.
 *
 * @example
 * <Flow
 *   label="How a script picks its Infisical credential"
 *   nodes={[
 *     { id: "env", label: "Token in environment", unchanged: true },
 *     { id: "id", label: "Machine identity", mark: "+" },
 *     { id: "use", label: "Use it" },
 *   ]}
 *   edges={[
 *     { from: "env", to: "id", label: "missing or expired" },
 *     { from: "env", to: "use", label: "valid" },
 *     { from: "id", to: "use" },
 *   ]}
 * />
 */
export function Flow({ label, nodes, edges, direction = "down" }: FlowProps) {
  const id = useId().replace(/:/g, "");
  const probe = useRef<SVGSVGElement>(null);
  const figure = useRef<HTMLElement>(null);
  const [laid, setLaid] = useState<Laid | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [narrow, setNarrow] = useState<boolean | null>(null);
  // A wide layout that doesn't fit where the diagram sits, such as inside an opened
  // note, gives way to the narrow one.
  const [tooWide, setTooWide] = useState(false);
  const variant = narrow || tooWide ? "narrow" : "wide";
  const key = hash(JSON.stringify([nodes, edges, direction]));
  const steps = useSteps();
  const stepOf = (n: FlowNode) => `${id}:${n.id}`;
  const opens = (n: FlowNode) => Boolean(n.note || n.code);
  // Tell the page which steps open something, so "open all" finds them and linked notes
  // leave the list.
  useLayoutEffect(() => {
    const links = nodes.filter(opens).map((n) => ({ step: stepOf(n), note: n.note && noteId(n.note), code: Boolean(n.code) }));
    return links.length ? steps?.declare(id, links) : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  // Held from mount until the first layout lands, so the page can't report itself
  // settled between this diagram mounting and its layout starting.
  const firstLayout = useRef<(() => void) | null>(null);

  // Layouts exist for a wide and a narrow column; pick by this diagram's own width.
  useEffect(() => {
    firstLayout.current = startWork();
    const el = figure.current!;
    const update = () => setNarrow(el.clientWidth < NARROW_BELOW);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      observer.disconnect();
      firstLayout.current?.();
    };
  }, []);

  useEffect(() => {
    if (narrow === null) return;
    const done = startWork();
    let cancelled = false;
    let retry = false;
    layoutFlow({
      key,
      variant,
      nodes,
      edges,
      direction,
      available: figure.current!.clientWidth,
      nodeFont: fontOf(probe.current!.querySelector(".flow-node-text")!),
      edgeFont: fontOf(probe.current!.querySelector(".flow-edge-text")!),
    })
      .then((result) => {
        if (cancelled) return;
        if (variant === "wide" && result.width > figure.current!.clientWidth + 1) {
          retry = true;
          setTooWide(true);
        } else setLaid(result);
      })
      .catch((err: unknown) => !cancelled && setError(String(err)))
      .finally(() => {
        done();
        // Still settling while the narrow layout replaces the wide one.
        if (retry) return;
        firstLayout.current?.();
        firstLayout.current = null;
      });
    return () => {
      cancelled = true;
      done();
    };
    // `key` stands in for nodes, edges, and direction, which pages pass as fresh literals.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, variant, narrow === null]);

  // The diagram is cut under each open step, never through a box or label, and what the
  // step opens goes in the gap; the rest of the diagram continues below it.
  const open = laid ? laid.nodes.filter((n) => opens(n) && steps?.isOpen(stepOf(n))) : [];
  const cutOf = new Map(open.map((n) => [n.id, cutBelow(n, laid!)]));
  const bounds = laid ? [...new Set([0, ...cutOf.values(), laid.height])].sort((a, b) => a - b) : [];
  const linksMap = nodes.some((n) => n.note);

  return (
    <figure className="flow" data-flow={id} data-key={key} ref={figure}>
      {/* Hidden probe: gives the measurer the exact fonts the diagram renders with. */}
      <svg ref={probe} className="flow-probe" aria-hidden="true" width="0" height="0">
        <text className="flow-node-text">x</text>
        <text className="flow-edge-text">x</text>
      </svg>
      {error && <p className="flow-error">Diagram failed to lay out: {error}</p>}
      {laid && linksMap && (
        <div className="flow-tools">
          <button type="button" className="flow-open-all" onClick={() => steps?.expand(open.length ? "none" : "notes")}>
            {open.length ? "Close all" : "Open all"}
          </button>
        </div>
      )}
      {laid &&
        bounds.slice(0, -1).map((y0, i) => {
          const y1 = bounds[i + 1];
          const here = (b: Box) => b.y >= y0 - 0.5 && b.y < y1;
          return (
            <div key={y0} className="flow-slice">
              <svg
                {...(i === 0 ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
                viewBox={`0 ${y0} ${laid.width} ${y1 - y0}`}
                width={laid.width}
                height={y1 - y0}
              >
                <defs>
                  <marker id={`${id}-arrow-${i}`} viewBox="0 0 8 8" refX="7.5" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M0,0.5 L7.5,4 L0,7.5" className="flow-arrowhead" />
                  </marker>
                </defs>
                {laid.edges.map((e, j) => (
                  <g key={j} className="flow-edge" data-from={e.from} data-to={e.to} data-mark={e.mark}>
                    <path
                      d={e.points.map((p, k) => `${k ? "L" : "M"}${p.x},${p.y}`).join(" ")}
                      className={e.dashed ? "flow-edge-line dashed" : "flow-edge-line"}
                      markerEnd={`url(#${id}-arrow-${i})`}
                    />
                  </g>
                ))}
                {/* Labels after every line, so no other edge's line crosses one. */}
                {laid.edges.map(
                  (e, j) =>
                    e.labelAt &&
                    e.label &&
                    here(e.labelAt) && (
                      <g key={j} className="flow-edge-label" data-from={e.from} data-to={e.to}>
                        <rect x={e.labelAt.x - 2} y={e.labelAt.y} width={e.labelAt.w + 4} height={e.labelAt.h} rx="3" />
                        <Lines x={e.labelAt.x + e.labelAt.w / 2} cy={e.labelAt.y + e.labelAt.h / 2} lines={e.lines} lineHeight={EDGE_LINE} mark={e.mark} className="flow-edge-text" />
                      </g>
                    ),
                )}
                {laid.nodes.filter(here).map((n) => {
                  const isOpen = open.includes(n);
                  return (
                    <g
                      key={n.id}
                      className={["flow-node", n.unchanged && "unchanged", opens(n) && "links"].filter(Boolean).join(" ")}
                      data-node={n.id}
                      data-mark={n.mark}
                      {...(opens(n) && {
                        "data-target": n.note ? noteId(n.note) : undefined,
                        "data-missing": n.note && steps && !steps.notes[noteId(n.note)] ? "" : undefined,
                        role: "button",
                        tabIndex: 0,
                        "aria-expanded": isOpen,
                        onClick: () => steps?.toggle(stepOf(n)),
                        onKeyDown: (e: { key: string; preventDefault: () => void }) => {
                          if (e.key !== "Enter" && e.key !== " ") return;
                          e.preventDefault();
                          steps?.toggle(stepOf(n));
                        },
                      })}
                    >
                      {opens(n) && <title>{isOpen ? "Close" : n.note ? `Open the note: ${n.note}` : "Open the code"}</title>}
                      <rect x={n.x} y={n.y} width={n.w} height={n.h} rx="6" />
                      <Lines x={n.x + n.w / 2} cy={n.y + n.h / 2} lines={n.lines} lineHeight={NODE_LINE} mark={n.mark} className="flow-node-text" />
                    </g>
                  );
                })}
              </svg>
              {open
                .filter((n) => cutOf.get(n.id) === y1)
                .sort((a, b) => a.x - b.x)
                .map((n) => {
                  const style = { "--notch": `${n.x + n.w / 2}px` } as CSSProperties;
                  const close = () => steps?.toggle(stepOf(n));
                  return n.note ? (
                    <NoteBand key={n.id} title={n.note} style={style} onClose={close} />
                  ) : (
                    <CodeBand key={n.id} code={n.code!} style={style} />
                  );
                })}
            </div>
          );
        })}
    </figure>
  );
}

/** Where to cut under a step: its bottom, pushed down past any box or label that would be cut. */
function cutBelow(step: Box, laid: Laid): number {
  const boxes: Box[] = [...laid.nodes, ...laid.edges.flatMap((e) => (e.labelAt ? [e.labelAt] : []))];
  let cut = step.y + step.h + 8;
  for (let moved = true; moved; ) {
    moved = false;
    for (const b of boxes)
      if (b.y < cut && b.y + b.h + 2 > cut) {
        cut = b.y + b.h + 8;
        moved = true;
      }
  }
  return Math.min(cut, laid.height);
}

/** A note opened from its step: the note itself, inside the diagram. */
function NoteBand({ title, style, onClose }: { title: string; style: CSSProperties; onClose: () => void }) {
  const id = noteId(title);
  const note = useSteps()?.notes[id];
  if (!note) return null;
  return (
    <section className="note step-band" id={id} data-mark={note.mark} data-risk={note.risk} style={style}>
      <div className="step-band-head">
        <NoteHeading mark={note.mark} risk={note.risk} title={note.title} />
        <button type="button" className="step-band-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      {note.children}
    </section>
  );
}

/** Code opened from its step, inside the diagram. */
function CodeBand({ code, style }: { code: NonNullable<FlowNode["code"]>; style: CSSProperties }) {
  return (
    <div className="step-band code-band" style={style}>
      <CodeView code={useCode(code.file, code.symbol, code.match)} />
    </div>
  );
}

/** Centered multi-line SVG text; the mark leads the first line. */
function Lines({ x, cy, lines, lineHeight, mark, className }: { x: number; cy: number; lines: string[]; lineHeight: number; mark?: DiagramMark; className: string }) {
  const top = cy - ((lines.length - 1) * lineHeight) / 2;
  return (
    <text className={className}>
      {lines.map((line, i) => (
        <tspan key={i} x={x} y={top + i * lineHeight}>
          {i === 0 && mark && <tspan className={`mark mark-${markName(mark)}`}>{mark} </tspan>}
          {line}
        </tspan>
      ))}
    </text>
  );
}

function markName(mark: DiagramMark): string {
  return mark === "+" ? "add" : mark === "-" ? "remove" : mark === "?" ? "unknown" : "change";
}

/** A short stable hash (djb2), enough to key one page's diagrams. */
function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
