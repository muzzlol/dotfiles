// Reads layouts `render` computed at build time, so the published page carries
// coordinates instead of the layout library.
import type { Laid, LayoutRequest } from "./engine";

declare global {
  // Set by the build entry from the layouts `render` recorded.
  var __EXPLAIN_LAYOUTS__: Record<string, Laid> | undefined;
}

export function layoutFlow(request: LayoutRequest): Promise<Laid> {
  const laid = globalThis.__EXPLAIN_LAYOUTS__?.[`${request.key}:${request.variant}`];
  return laid ? Promise.resolve(laid) : Promise.reject(new Error(`no stored ${request.variant} layout for this diagram`));
}
