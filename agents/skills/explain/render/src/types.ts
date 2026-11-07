/** How a change touched a behavior, file, or diagram element, as in `terraform plan`. */
export type Mark = "+" | "~" | "-";

/** The id a note's section carries, so a map's node can link to it by title. */
export function noteId(title: string): string {
  return `note-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

/** A diagram's marks: a change, or `?` for something the code couldn't confirm. */
export type DiagramMark = Mark | "?";

/**
 * - `high`: a mistake could hurt users, data, or money in a way that's hard to notice or undo.
 * - `low`: a mistake would be obvious and cheap to fix.
 * - `medium`: everything else.
 */
export type Risk = "high" | "medium" | "low";
