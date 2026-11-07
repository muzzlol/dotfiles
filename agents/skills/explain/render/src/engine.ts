// What a layout engine takes and returns. Two engines implement it: `engine-elk` lays
// diagrams out while `render` builds the page; `engine-static` reads those layouts back
// in the published page, so it ships coordinates instead of the layout library.
import type { FlowEdge, FlowNode } from "./flow";

export type Box = { x: number; y: number; w: number; h: number };

export type Laid = {
  width: number;
  height: number;
  nodes: Array<FlowNode & Box & { lines: string[] }>;
  edges: Array<FlowEdge & { points: Array<{ x: number; y: number }>; lines: string[]; labelAt?: Box }>;
};

/** Layouts are stored for two column widths; the page picks one by its own width. */
export type Variant = "wide" | "narrow";

export type LayoutRequest = {
  /** Stable id for this diagram's content and direction. */
  key: string;
  variant: Variant;
  nodes: FlowNode[];
  edges: FlowEdge[];
  direction: "down" | "right";
  /** The column width the diagram must fit. */
  available: number;
  nodeFont: string;
  edgeFont: string;
};

/** Narrower than this, a page uses the narrow layout. */
export const NARROW_BELOW = 480;
/** The widths `render` lays diagrams out at, matching the page's column. */
export const VARIANT_VIEWPORT: Record<Variant, number> = { wide: 760, narrow: 360 };

export const NODE_PAD_X = 14;
export const NODE_PAD_Y = 8;
export const NODE_LINE = 18;
export const EDGE_LINE = 15;
