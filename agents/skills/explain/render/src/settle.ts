// The page is settled when every async layout has finished. The checker waits for
// `aria-busy="false"` on <html> before measuring anything.
let pending = 0;
let started = false;

function update() {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("aria-busy", pending > 0 ? "true" : "false");
}

/** Marks one piece of async work; call the returned function when it finishes. */
export function startWork(): () => void {
  pending++;
  started = true;
  update();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    pending--;
    update();
  };
}

/** Called once after the first render, so a page with no async work settles too. */
export function settleIfIdle() {
  if (!started) update();
}
