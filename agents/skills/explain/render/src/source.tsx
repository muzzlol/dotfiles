import { createContext, useContext } from "react";

export type FileStatus = "added" | "modified" | "removed" | "renamed";

export type ChangedFile = {
  path: string;
  status: FileStatus;
  additions: number;
  deletions: number;
  /** The old path, for a renamed file. */
  from?: string;
  /** A lockfile, build output, or a file marked `linguist-generated`. */
  generated?: true;
};

/**
 * One line of resolved code: its line number (at base for a removed line, at head
 * otherwise) and its tokens, each an index into `ResolvedSource.colors`. A gap stands
 * for lines too far from any change to ship.
 */
export type CodeLine =
  | { kind: "+" | "-" | " "; n: number; tokens: Array<[text: string, color: number]>; marked?: true; header?: true }
  | { kind: "gap"; hidden: number };

/** Code a page named with `<Ref>` or `<Diff file>`, resolved at the source's commits. */
export type ResolvedRef = {
  /** Where the code is now, or was, if the change removed it. */
  file: string;
  symbol?: string;
  status: "added" | "removed" | "changed" | "unchanged" | "moved" | "renamed";
  /** `path:line` at base, when the code lived in another file: a move or a renamed file. */
  from?: string;
  /** The definition's name at base, when the change renamed it. */
  was?: string;
  lines: CodeLine[];
  url?: string;
};

/** What `render` resolved from the page's `source` before building. */
export type ResolvedSource = {
  source: string;
  repo: string;
  title?: string;
  url?: string;
  base: string;
  head: string;
  files: ChangedFile[];
  refs: Record<string, ResolvedRef>;
  /** Syntax colors as light and dark pairs. */
  colors: Array<[light: string, dark: string]>;
};

/** How `render` and the page agree on which resolved code a ref names. */
export function refKey(file: string, symbol?: string, match?: string): string {
  return JSON.stringify([file, symbol ?? "", match ?? ""]);
}

const SourceContext = createContext<ResolvedSource | null>(null);

export const SourceProvider = SourceContext.Provider;

/** The resolved source of the page being rendered. */
export function useSource(): ResolvedSource {
  const source = useContext(SourceContext);
  if (!source) throw new Error("useSource() needs <Explanation> and a page built by render");
  return source;
}

/** The code a `<Ref>` or `<Diff file>` names. Throws when `render` didn't resolve it. */
export function useCode(file: string, symbol?: string, match?: string): ResolvedRef {
  const code = useSource().refs[refKey(file, symbol, match)];
  if (!code) throw new Error(`no resolved code for ${refKey(file, symbol, match)}; write its props as string literals`);
  return code;
}
