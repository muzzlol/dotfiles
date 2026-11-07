// What a page's diagrams can open in place. Notes register their content here; a map
// that links a note takes it out of the list, and clicking the step opens the note
// inside the diagram, right under the step. A step can open code the same way.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Mark, Risk } from "./types";

export type NoteEntry = { title: string; mark: Mark; risk: Risk; children?: ReactNode };

/** Opened by the reader, or by "open all": `notes` opens every linked note, `all` code too. */
export type Expand = "none" | "notes" | "all";

type Link = { step: string; note?: string; code?: boolean };

type Steps = {
  notes: Record<string, NoteEntry>;
  register: (id: string, note: NoteEntry) => () => void;
  /** A diagram declares the steps that open something, in order. */
  declare: (diagram: string, links: Link[]) => () => void;
  /** Notes a map links, which therefore leave the list. */
  linked: Set<string>;
  isOpen: (step: string) => boolean;
  toggle: (step: string) => void;
  expand: (level: Expand) => void;
};

const StepsContext = createContext<Steps | null>(null);

export function StepsProvider({ children }: { children: ReactNode }) {
  const [notes, setNotes] = useState<Record<string, NoteEntry>>({});
  const [links, setLinks] = useState<Record<string, Link[]>>({});
  const [open, setOpen] = useState<Set<string>>(new Set());

  const register = useCallback((id: string, note: NoteEntry) => {
    setNotes((all) => ({ ...all, [id]: note }));
    return () => setNotes(({ [id]: _, ...rest }) => rest);
  }, []);
  const declare = useCallback((diagram: string, list: Link[]) => {
    setLinks((all) => ({ ...all, [diagram]: list }));
    return () => setLinks(({ [diagram]: _, ...rest }) => rest);
  }, []);

  const all = useMemo(() => Object.values(links).flat(), [links]);
  const linked = useMemo(() => new Set(all.flatMap((l) => (l.note ? [l.note] : []))), [all]);

  // A note shows under one step at a time: opening it elsewhere moves it.
  const toggle = useCallback(
    (step: string) =>
      setOpen((current) => {
        const next = new Set(current);
        if (next.has(step)) return next.delete(step), next;
        const note = all.find((l) => l.step === step)?.note;
        if (note) for (const l of all) if (l.note === note) next.delete(l.step);
        return next.add(step), next;
      }),
    [all],
  );
  const expand = useCallback(
    (level: Expand) => {
      const next = new Set<string>();
      const seen = new Set<string>();
      for (const l of all) {
        if (l.note && level !== "none" && !seen.has(l.note)) next.add(l.step), seen.add(l.note);
        if (l.code && level === "all") next.add(l.step);
      }
      setOpen(next);
    },
    [all],
  );

  // "Open all", and the checker, which opens everything to check what the reader can reach.
  useEffect(() => {
    const onExpand = (e: Event) => expand((e as CustomEvent<Expand>).detail);
    document.addEventListener("explain:expand", onExpand);
    return () => document.removeEventListener("explain:expand", onExpand);
  }, [expand]);

  const value = useMemo(
    () => ({ notes, register, declare, linked, isOpen: (step: string) => open.has(step), toggle, expand }),
    [notes, register, declare, linked, open, toggle, expand],
  );
  return <StepsContext.Provider value={value}>{children}</StepsContext.Provider>;
}

export function useSteps(): Steps | null {
  return useContext(StepsContext);
}

const MARK_NAME: Record<Mark, string> = { "+": "add", "~": "change", "-": "remove" };

export function NoteHeading({ mark, risk, title }: { mark: Mark; risk: Risk; title: string }) {
  return (
    <h2 className="note-heading">
      <span className={`mark mark-${MARK_NAME[mark]}`} aria-label={mark === "+" ? "added" : mark === "-" ? "removed" : "changed"}>
        {mark}
      </span>
      <span className="note-title">{title}</span>
      <span className={`risk risk-${risk}`}>{risk}</span>
    </h2>
  );
}
