// Text widths for layout. In the browser this uses canvas with the element's real
// font, so boxes are sized to their rendered text. [idea: Pele measurer.ts]
let context: CanvasRenderingContext2D | null = null;
const cache = new Map<string, number>();

export function textWidth(text: string, font: string): number {
  const key = `${font}\u0000${text}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  context ??= document.createElement("canvas").getContext("2d");
  if (!context) return text.length * 7.5;
  context.font = font;
  const width = context.measureText(text).width;
  cache.set(key, width);
  return width;
}

/** The CSS font shorthand an element renders with. */
export function fontOf(element: Element): string {
  const style = getComputedStyle(element);
  return `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
}
