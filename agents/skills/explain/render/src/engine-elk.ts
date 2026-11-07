// Lays diagrams out with elkjs from measured text. Runs only while `render` builds a
// page; each result is recorded on `window.__explainLayouts` for the published page.
import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkExtendedEdge, ElkNode } from "elkjs/lib/elk-api";
import { EDGE_LINE, NODE_LINE, NODE_PAD_X, NODE_PAD_Y, type Box, type Laid, type LayoutRequest } from "./engine";
import { textWidth } from "./measure";

declare global {
  interface Window {
    __explainLayouts?: Record<string, Laid>;
  }
}

const elk = new ELK();

export async function layoutFlow(request: LayoutRequest): Promise<Laid> {
  let laid = await layout(request, request.direction);
  // A left-to-right diagram that doesn't fit is laid out top to bottom instead of being
  // scaled down, so its labels stay readable. [Pele mount.ts; Cursor diagrams]
  if (request.direction === "right" && laid.width > request.available) laid = await layout(request, "down");
  (window.__explainLayouts ??= {})[`${request.key}:${request.variant}`] = laid;
  return laid;
}

async function layout(request: LayoutRequest, direction: "down" | "right"): Promise<Laid> {
  const { nodes, edges, nodeFont, edgeFont } = request;
  const narrow = request.variant === "narrow";
  const nodeLines = nodes.map((n) => wrap(n.label, nodeFont, narrow ? 104 : 200, n.mark ? `${n.mark} ` : ""));
  const edgeLines = edges.map((e) => (e.label ? wrap(e.label, edgeFont, narrow ? 72 : 140, e.mark ? `${e.mark} ` : "") : []));
  const graph: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": direction === "right" ? "RIGHT" : "DOWN",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.layered.spacing.nodeNodeBetweenLayers": "36",
      "elk.spacing.nodeNode": narrow ? "12" : "24",
      "elk.spacing.edgeNode": narrow ? "8" : "14",
      "elk.spacing.edgeLabel": "4",
      "elk.edgeLabels.placement": "CENTER",
      "elk.edgeLabels.inline": "true",
      "elk.padding": "[top=4,left=4,bottom=4,right=4]",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
    },
    children: nodes.map((n, i) => ({
      id: n.id,
      width: Math.ceil(widest(nodeLines[i], nodeFont, n.mark ? `${n.mark} ` : "") + 2 * NODE_PAD_X),
      height: nodeLines[i].length * NODE_LINE + 2 * NODE_PAD_Y,
    })),
    edges: edges.map(
      (e, i): ElkExtendedEdge => ({
        id: `e${i}`,
        sources: [e.from],
        targets: [e.to],
        labels: e.label
          ? [{ text: e.label, width: Math.ceil(widest(edgeLines[i], edgeFont, e.mark ? `${e.mark} ` : "") + 8), height: edgeLines[i].length * EDGE_LINE + 2 }]
          : [],
      }),
    ),
  };
  const out = await elk.layout(graph);
  const byId = new Map(out.children!.map((c) => [c.id, c]));
  // Labels keep clear of boxes and of labels placed before them.
  const blockers: Box[] = out.children!.map((c) => ({ x: c.x!, y: c.y!, w: c.width!, h: c.height! }));
  const laidEdges = edges.map((e, i) => {
    const le = out.edges!.find((x) => x.id === `e${i}`)!;
    const s = le.sections![0];
    const l = le.labels?.[0];
    const points = [s.startPoint, ...(s.bendPoints ?? []), s.endPoint];
    const labelAt = l ? onLine(points, { x: l.x!, y: l.y!, w: l.width!, h: l.height! }, blockers) : undefined;
    if (labelAt) blockers.push(labelAt);
    return { ...e, lines: edgeLines[i], points, labelAt };
  });
  // A label slid along its edge can pass the layout's edge, so the bounds include every label.
  const right = Math.max(out.width!, ...laidEdges.map((e) => (e.labelAt ? e.labelAt.x + e.labelAt.w + 4 : 0)));
  const bottom = Math.max(out.height!, ...laidEdges.map((e) => (e.labelAt ? e.labelAt.y + e.labelAt.h + 4 : 0)));
  const left = Math.min(0, ...laidEdges.map((e) => (e.labelAt ? e.labelAt.x - 4 : 0)));
  const top = Math.min(0, ...laidEdges.map((e) => (e.labelAt ? e.labelAt.y - 4 : 0)));
  const shift = <T extends { x: number; y: number }>(p: T): T => ({ ...p, x: p.x - left, y: p.y - top });
  return {
    width: Math.ceil(right - left),
    height: Math.ceil(bottom - top),
    nodes: nodes.map((n, i) => {
      const c = byId.get(n.id)!;
      return shift({ ...n, x: c.x!, y: c.y!, w: c.width!, h: c.height!, lines: nodeLines[i] });
    }),
    edges: laidEdges.map((e) => ({ ...e, points: e.points.map(shift), labelAt: e.labelAt && shift(e.labelAt) })),
  };
}

/** Greedy word wrap against measured widths. The first line leaves room for `prefix`. */
function wrap(text: string, font: string, maxWidth: number, prefix = ""): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    const room = maxWidth - (lines.length === 0 ? textWidth(prefix, font) : 0);
    if (line && textWidth(candidate, font) > room) {
      lines.push(line);
      line = word;
    } else line = candidate;
  }
  if (line) lines.push(line);
  return lines;
}

function widest(lines: string[], font: string, prefix = ""): number {
  return Math.max(...lines.map((l, i) => textWidth((i === 0 ? prefix : "") + l, font)));
}

/**
 * Moves a label so its center sits on its own edge, at the point nearest where the
 * layout put it that doesn't cover a box. The label's background hides the line
 * behind it, so it can't be read as belonging to a neighboring edge. Falls back to
 * the layout's position when every point on the edge is blocked.
 */
function onLine(points: Array<{ x: number; y: number }>, box: Box, blockers: Box[]): Box {
  const c = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
  const clear = (p: { x: number; y: number }) =>
    blockers.every((b) => p.x + box.w / 2 + 2 <= b.x || p.x - box.w / 2 - 2 >= b.x + b.w || p.y + box.h / 2 + 2 <= b.y || p.y - box.h / 2 - 2 >= b.y + b.h);
  let best: { x: number; y: number } | null = null;
  let bestDistance = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const p = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
      const d = Math.hypot(p.x - c.x, p.y - c.y);
      if (d < bestDistance && clear(p)) {
        bestDistance = d;
        best = p;
      }
    }
  }
  return best ? { x: best.x - box.w / 2, y: best.y - box.h / 2, w: box.w, h: box.h } : box;
}
