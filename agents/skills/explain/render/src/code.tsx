import { useEffect, useId, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useCode, type CodeLine, type ResolvedRef } from "./source";

type Line = Extract<CodeLine, { tokens: unknown }>;

/** Unchanged lines shown on each side of a change or a marked line before the rest collapses. */
const CONTEXT = 3;

type Shown = { line: Line; i: number } | { fold: number; count: number } | { gap: number };

/**
 * Lines to show: everything near a change, a mark, or the declaration. Each stretch
 * of the rest is one row; opening it shows the lines the page carries, and lines it
 * doesn't carry stay a row that links to the source.
 */
function fold(lines: CodeLine[], opened: Set<number>): Shown[] {
  const focus = lines.flatMap((l, i) => (l.kind === "+" || l.kind === "-" || (l.kind !== "gap" && l.marked) ? [i] : []));
  const near = (i: number) => !focus.length || focus.some((f) => Math.abs(f - i) <= CONTEXT);
  const out: Shown[] = [];
  let stretch: Array<number | { gap: number }> = [];
  const flush = () => {
    const carried = stretch.filter((x): x is number => typeof x === "number");
    const missing = stretch.reduce<number>((n, x) => n + (typeof x === "number" ? 0 : x.gap), 0);
    if (carried.length && (opened.has(carried[0]) || (carried.length < 3 && !missing)))
      out.push(...stretch.map((x) => (typeof x === "number" ? { line: lines[x] as Line, i: x } : { gap: x.gap })));
    else if (carried.length) out.push({ fold: carried[0], count: carried.length + missing });
    else if (missing) out.push({ gap: missing });
    stretch = [];
  };
  lines.forEach((line, i) => {
    if (line.kind === "gap") stretch.push({ gap: line.hidden });
    else if (line.header || near(i)) {
      flush();
      out.push({ line, i });
    } else stretch.push(i);
  });
  flush();
  return out;
}

const STATUS_MARK: Record<ResolvedRef["status"], string> = { added: "+", removed: "-", changed: "~", unchanged: "", moved: "→", renamed: "~" };

function statusText(code: ResolvedRef): string {
  const edited = code.lines.some((l) => l.kind === "+" || l.kind === "-");
  if (code.status === "moved") return `moved from ${code.from}${edited ? ", changed" : ""}`;
  if (code.status === "renamed") return `renamed from ${code.was}`;
  return code.from ? `${code.status}, was ${code.from}` : code.status;
}

/** Resolved code with what the change did to it: a header naming where it is, then its lines. */
export function CodeView({ code }: { code: ResolvedRef }) {
  const [opened, setOpened] = useState<Set<number>>(new Set());
  const edited = code.lines.some((l) => l.kind === "+" || l.kind === "-");
  const digits = Math.max(...code.lines.map((l) => (l.kind === "gap" ? 0 : String(l.n).length)));
  const slash = code.file.lastIndexOf("/") + 1;
  const mark = STATUS_MARK[code.status];
  return (
    <div className={edited ? "code" : "code plain"} data-ref-status={code.status}>
      <div className="code-head">
        <span className="code-where">
          {mark && <span className={`mark mark-${mark === "+" ? "add" : mark === "-" ? "remove" : "change"}`}>{mark} </span>}
          <span className="code-dir">{code.file.slice(0, slash)}</span>
          {code.file.slice(slash)}
          {code.symbol && <span className="code-symbol"> · {code.symbol}</span>}
        </span>
        <span className="code-status">{statusText(code)}</span>
        {code.url && (
          <a className="code-link" href={code.url} target="_blank" rel="noreferrer">
            source ↗
          </a>
        )}
      </div>
      <pre className="code-body" style={{ ["--digits" as string]: `${digits}ch` }}>
        {fold(code.lines, opened).map((s) =>
          "fold" in s ? (
            <button key={`f${s.fold}`} type="button" className="code-fold" onClick={() => setOpened(new Set(opened).add(s.fold))}>
              ⋯ {s.count} {edited ? "unchanged lines" : "lines"}
            </button>
          ) : "gap" in s ? (
            code.url ? (
              <a key={`g${s.gap}`} className="code-fold" href={code.url} target="_blank" rel="noreferrer">
                ⋯ {s.gap} more lines in the source ↗
              </a>
            ) : (
              <span key={`g${s.gap}`} className="code-fold">
                ⋯ {s.gap} lines not shown
              </span>
            )
          ) : (
            <Line key={s.i} line={s.line} numbered={!edited || s.line.kind !== "-"} />
          ),
        )}
      </pre>
    </div>
  );
}

/** `numbered` is off for removed lines beside current ones, so one column counts one version. */
function Line({ line, numbered }: { line: Line; numbered: boolean }) {
  const kind = line.kind === "+" ? "add" : line.kind === "-" ? "remove" : "context";
  return (
    <span className={`code-line code-${kind}${line.marked ? " marked" : ""}`}>
      <span className="code-n">{numbered ? line.n : ""}</span>
      <span className="code-sign">{line.kind === "-" ? "−" : line.kind === "+" ? "+" : " "}</span>
      <span className="code-src">
        {line.tokens.map(([text, color], i) => (
          <span key={i} className={`k${color}`}>
            {text}
          </span>
        ))}
        {"\n"}
      </span>
    </span>
  );
}

// One card is open at a time; opening another closes this one.
let closeOpenCard: (() => void) | null = null;

/**
 * Ties a claim to the code it describes. Hovering shows the code; clicking or tapping
 * keeps it open. `render` resolves `file` and `symbol` at the source's commits and
 * fails the build when they don't resolve, so write them as string literals.
 *
 * - `symbol`: a definition, dotted for nesting (`Class.method`, `settings.review`), or a
 *   Markdown heading. Omit it to show the file's changes.
 * - `match`: marks the lines containing this text. Use it to point inside a definition.
 *
 * Code that was renamed or moved between files shows as one rename or move, diffed against
 * what it was.
 *
 * @example
 * <p>
 *   With nothing usable,{" "}
 *   <Ref file="internal/secrets.ts" symbol="resolveInfisicalCredentials" match="No usable Infisical credentials">
 *     it throws
 *   </Ref>{" "}
 *   and lists what it skipped.
 * </p>
 */
export function Ref({ file, symbol, match, children }: { file: string; symbol?: string; match?: string; children: ReactNode }) {
  const code = useCode(file, symbol, match);
  const cardId = useId();
  const trigger = useRef<HTMLSpanElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"closed" | "peek" | "pinned">("closed");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const close = useRef(() => setState("closed"));

  const later = (fn: () => void, ms: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(fn, ms);
  };
  const open = (next: "peek" | "pinned") => {
    if (closeOpenCard && closeOpenCard !== close.current) closeOpenCard();
    closeOpenCard = close.current;
    setState(next);
  };

  useLayoutEffect(() => {
    const el = card.current!;
    if (state === "closed") {
      if (el.matches(":popover-open")) el.hidePopover();
      if (closeOpenCard === close.current) closeOpenCard = null;
      return;
    }
    if (!el.matches(":popover-open")) el.showPopover();
    const place = () => placeCard(trigger.current!, el);
    place();
    // Opening folded lines resizes the card; place it again on the next frame.
    const resize = new ResizeObserver(() => requestAnimationFrame(place));
    resize.observe(el.firstElementChild!);
    // A pinned card follows its claim while the claim is on screen.
    const onScroll = (e: Event) => {
      if (el.contains(e.target as Node)) return;
      const claim = trigger.current!.getBoundingClientRect();
      if (state === "peek" || claim.bottom < 0 || claim.top > window.innerHeight) setState("closed");
      else place();
    };
    const onPointerDown = (e: PointerEvent) => {
      if (!el.contains(e.target as Node) && !trigger.current!.contains(e.target as Node)) setState("closed");
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setState("closed");
      trigger.current!.focus();
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", place);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      resize.disconnect();
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", place);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [state]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const toggle = () => {
    clearTimeout(timer.current);
    state === "pinned" ? setState("closed") : open("pinned");
  };
  const hover = {
    onPointerEnter: (e: ReactPointerEvent) => e.pointerType === "mouse" && later(() => state === "closed" && open("peek"), 200),
    onPointerLeave: (e: ReactPointerEvent) => e.pointerType === "mouse" && later(() => setState((s) => (s === "peek" ? "closed" : s)), 200),
  };

  return (
    <>
      <span
        ref={trigger}
        className="ref"
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
        aria-expanded={state !== "closed"}
        aria-controls={cardId}
        data-ref-status={code.status}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          toggle();
        }}
        {...hover}
      >
        {children}
      </span>
      {createPortal(
        <div
          ref={card}
          id={cardId}
          popover="manual"
          role="dialog"
          aria-label={code.symbol ? `${code.symbol} in ${code.file}` : code.file}
          className="ref-card"
          onPointerEnter={() => clearTimeout(timer.current)}
          onPointerLeave={hover.onPointerLeave}
        >
          {state !== "closed" && <CodeView code={code} />}
        </div>,
        document.body,
      )}
    </>
  );
}

/** Puts the card under its claim, or above when there's more room there, inside the viewport. */
function placeCard(anchor: HTMLElement, card: HTMLElement) {
  const rects = anchor.getClientRects();
  const first = rects[0];
  const last = rects[rects.length - 1];
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const width = Math.min(720, vw - 16);
  card.style.width = `${width}px`;
  const below = vh - last.bottom - 14;
  const above = first.top - 14;
  const height = card.scrollHeight;
  const under = height <= below || below >= above;
  const room = under ? below : above;
  card.style.maxHeight = `${Math.max(room, 120)}px`;
  const shown = Math.min(height, Math.max(room, 120));
  card.style.top = `${under ? last.bottom + 6 : first.top - 6 - shown}px`;
  card.style.left = `${Math.min(Math.max(8, first.left), vw - width - 8)}px`;
}
