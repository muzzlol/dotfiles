---
name: explain
description: Explain code or a change in plain language so the reader can judge it. Use when the user asks how code works, asks what changed, or wants a walkthrough; before work that adds or changes a multi-step code flow; and without being asked after finishing a nontrivial feature or fix.
---

The reader is the decision-maker. State the situation before the mechanism: who is doing what, then the one path that answers. An explanation exists to arm their judgment — a misunderstanding is worse than a gap, a negative multiplier on every decision built on it. The prose itself — ordering, sentence craft, form, register — follows the writing skill; this skill adds what explaining code demands.

## Zoom, don't chapter

Chapters (file-by-file, backend-then-frontend) read halfway give half a story. Zooms tell the whole story at every level, each pass sharper. Reason through up to four zooms in order, including only what the reader and artifact need. They are a reasoning order, not an output template: when the requested artifact has its own structure or writing guide, that controls the headings and organization; the zooms decide what earns inclusion and where it appears. Default output is situation plus enough flow to judge. Do not ship the zoom inventory.

1. **Governing idea** — the one fact the rest derives from, stated first (e.g. "billing is in arrears" generates: no refunds, invoice-immediately, why a preview endpoint exists). Test: could the reader predict most of the remaining detail from it? When no generating fact exists, don't manufacture one — open with what the change does and why it was wanted. For a change, the governing idea is a claim about the author's intent: back it with stated rationale or mark it as your read, because a diff always looks like it has one theme whether or not the author had one.
2. **Flow** — behavior as information: what data exists, how it transforms, how it reaches the user. The form choice follows the writing skill's shape rules; the option explanations add is a sketch — arrows, a grid, a numbered sequence — when faithful prose would make the reader build that structure in their head.
3. **Pieces** — each mechanism mapped back onto the flow, file path attached as an address.
4. **Judgment surface** — the material, contestable decisions the code embeds, each stated so the reader can veto or bless it: policies encoded, tradeoffs taken, defaults chosen. Surface only decisions that help the intended reader judge the subject. Put each beside the behavior it governs by default; create a standalone decisions section only when grouping them materially improves understanding. Omit decisions that repeat the artifact, are too implementation-specific for its audience, or fall outside its purpose. A veto needs a target: state the alternative that was live and what switching would cost, so the reader rejects a decision toward something, not just away from it. When files were created or moved, the carving is itself a decision when it materially affects the design — name it and defend it (durable domain object, or task-shaped?). Mark what you are unsure of; a confident gloss is the misunderstanding this skill exists to prevent.

Verdicts normally come last because judging requires understanding: each zoom is the most valuable thing *given what has already been read*. Lead with the verdict only when every premise it depends on is already in the thread.

## Show code flow before editing

Before the first code edit, when the work adds or changes a multi-step code path, trace the current code and show the plan as a flow diagram. Do not force it into a table or a straight call stack. Draw the real shape: direct calls, choices, loops, work that overlaps, waits, and work handed off through queues, events, streams, or callbacks.

For each affected flow:

- A new flow gets **Planned** and `new; no before version`. A changed flow gets **Before** and **After**, either as two diagrams or one diff diagram using `[+]`, `[-]`, and `[~]`. A removed flow gets **Before** and `After: removed`.
- Put the real function or method signature inside each layer from the project's code, and show its file path next to it. The signature shows the input and output. If the code has no written type names, show the value shape found in the code. Expand a large type once in a type legend instead of repeating its fields.
- Draw an error where it starts. Show where code catches it, turns it into another error, retries, or falls back. In plain text, `──╳ Error` may mean the error travels back to the caller until a handler is drawn.
- Draw each side effect as an arrow to the thing that changes, with the action on the arrow: for example, `══ INSERT ══▶ [users database]`. Include memory or stored data changes, files, network calls, queues, events, logs, and metrics.
- Use numbers only when calls have an order. For work that can overlap, draw a fork and join, name the real code such as `Promise.all` or `asyncio.gather`, and show whether it waits for all work, the first result, a set number of results, or nothing. Show timeouts and cancellation when they matter.
- Put the real condition on a branch and the real operation on a loop, retry, transaction, lock, queue, event, stream, or callback edge. Do not invent a fixed symbol for every kind of program.
- Add a small legend that explains only the marks used in that diagram. A missing error line or side-effect arrow means the code was checked and none was found; use `?` when current behavior is still unknown or a planned choice is still open.

If the code ends up different from the plan, fix **After** in the final explanation. The diagram is done when every added, changed, or removed flow is shown and the reader can see each layer's input, output, errors, side effects, order, branches, and wait behavior without opening the code.

## Defaults

Apply these defaults when the situation is not already in the thread; depart when the reader's message already stated it. The general prose defaults — plain words, local completeness, concrete anchors, performative text cut — live in the writing skill; these are the ones explaining code adds.

- **Correct the tempting wrong model.** Call out behavior that a newcomer would reasonably predict incorrectly.
- **Close the causal chain.** Trace the path from input or trigger through each consequential decision and state change to the observable result. Do not hide a missing step behind "then" or "eventually."
- **Traced, or labeled.** A behavioral claim rests on code read, a diff compared, or a run observed, never on what the change plausibly does. Flag the claims you didn't trace.
- **Separate behavior from intent.** Code shows what happens, but rarely proves why it was designed that way. Cite documented rationale, label inferences, and say when the reason is unknown.
- **Explanation noise.** Line numbers, identifier inventories, and test-by-test recitals are noise unless asked for; summarize validation evidence and material gaps because they affect judgment.
- **Depth extends along the zooms.** Stop when the artifact has answered the request; when the reader pulls more, extend in zoom order rather than inventorying detail.
- **Changes anchor in the before.** When the subject is a delta rather than existing code: previously X, now Y — behavior first, then mechanism.

## Quality check

A strong explanation passes the writing skill's check — above all its cut test — and the material, contestable decisions needed to judge the code appear where they clarify the subject; no standalone judgment section is required.

## When the reader doesn't understand

A confused reader is a failed run. Fix their understanding first, then diagnose the miss. If skipping a relevant default caused the confusion, apply it; sharpen its wording only when the instruction itself was ambiguous. If the defaults were applied appropriately and the reader still got lost, the skill has a gap — only that earns a new line. Route the fix: a general prose miss (ordering, sentence craft, register) belongs in the writing skill; an explaining-code miss belongs in this skill. Edit under the discipline of the proompting skill, and tell the reader what you changed: the edit is itself a contestable decision. An instruction appended per confusion is sediment, not learning.
