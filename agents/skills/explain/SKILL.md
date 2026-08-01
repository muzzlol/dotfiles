---
name: explain
description: Explain code or a change so the reader can judge it. Use when the user asks to walk through, explain, or understand code or a change ("how does X work", "walk me through what you changed"), and unprompted as the closing report after completing a nontrivial feature or fix.
---

The reader is the decision-maker in a codebase they might not know - assume they don't. An explanation exists to arm their judgment — a misunderstanding is worse than a gap, a negative multiplier on every decision built on it. Their attention may lapse at any paragraph, so aim for **progressive payoff**: at each section boundary, what remains should be the best practical account at that length.

## Zoom, don't chapter

Chapters (file-by-file, backend-then-frontend) read halfway give half a story. Zooms tell the whole story at every level, each pass sharper. When useful, reason through up to four zooms in this order; include only what the reader and artifact need:

Treat these zooms as a reasoning order, not an output template. When the requested artifact has its own structure or writing guide, let that control its headings and organization; use the zooms to decide what information earns inclusion and where it should appear.

1. **Governing idea** — the one fact the rest derives from, stated first (e.g. "billing is in arrears" generates: no refunds, invoice-immediately, why a preview endpoint exists). Test: could the reader predict most of the remaining detail from it? When no generating fact exists, don't manufacture one — open with what the change does and why it was wanted. For a change, the governing idea is a claim about the author's intent: back it with stated rationale or mark it as your read, because a diff always looks like it has one theme whether or not the author had one.
2. **Flow** — behavior as information: what data exists, how it transforms, how it reaches the user. Form follows the information's structure: prose for causality, rationale, and tradeoffs; a sketch — arrows, a grid, a numbered sequence — when faithful prose would make the reader build that structure in their head. Choosing the form is an explicit step, not a default.
3. **Pieces** — each mechanism mapped back onto the flow, file path attached as an address.
4. **Judgment surface** — the material, contestable decisions the code embeds, each stated so the reader can veto or bless it: policies encoded, tradeoffs taken, defaults chosen. Surface only decisions that help the intended reader judge the subject. Put each beside the behavior it governs by default; create a standalone decisions section only when grouping them materially improves understanding. Omit decisions that repeat the artifact, are too implementation-specific for its audience, or fall outside its purpose. A veto needs a target: state the alternative that was live and what switching would cost, so the reader rejects a decision toward something, not just away from it. When files were created or moved, the carving is itself a decision when it materially affects the design — name it and defend it (durable domain object, or task-shaped?). Mark what you are unsure of; a confident gloss is the misunderstanding this skill exists to prevent.

Verdicts normally come last because judging requires understanding: each zoom is the most valuable thing *given what has already been read*. Lead with the verdict when the reader explicitly asks for it or when delaying it would obscure the answer.

## Defaults

Apply these defaults for a reader unfamiliar with the code. Depart from them when the reader's context or task makes another ordering clearer.

- **Role before name.** Establish an unfamiliar identifier, path, or term's purpose before naming it. A name already established in the conversation needs no reintroduction. A term of art that pays its way is taught, not avoided: use it and gloss it in the same breath ("a Goodhart trap — optimize the measurable stand-in and it stops tracking the goal"). An allusion that only decorates — an author's name as an adjective, a school of thought as shorthand — is cut.
- **Correct the tempting wrong model.** Call out behavior that a newcomer would reasonably predict incorrectly.
- **Prefer local completeness.** Each sentence decodes with what the reader is already holding; a tired reader should never have to page back. No forward references ("as we'll see below") and no recall demands ("the budget principle 4 describes") — restate the thing in place.
- **Close the causal chain.** Trace the path from input or trigger through each consequential decision and state change to the observable result. Do not hide a missing step behind "then" or "eventually."
- **Traced, or labeled.** A behavioral claim rests on code read, a diff compared, or a run observed, never on what the change plausibly does. Flag the claims you didn't trace.
- **Separate behavior from intent.** Code shows what happens, but rarely proves why it was designed that way. Cite documented rationale, label inferences, and say when the reason is unknown.
- **Write for one-pass understanding.** Keep each sentence to one main claim. When an action explains the outcome or identifies responsibility, say who or what performed it. Plain words over rare ones. A coined label or maxim may follow the plain statement it compresses, never replace it — and when the plain sentence already lands, delete the compressed twin.
- **Ground claims in behavior.** Replace labels such as "safe," "simple," and "flexible" with the mechanism or evidence that earns the label. State the basis when the evaluation itself matters.
- **Numbers arrive with their experiment.** A statistic reads as a miniature story — who did what, what moved: "asked to critique its own wrong answers, the model said 'looks good' 94% of the time." A bare delta or citation ID is noise; identify sources by what makes them credible ("a 28,000-conversation study"), and keep IDs out of prose.
- **Cut performative exposition.** Every sentence should help the reader understand behavior or judge a decision. Remove sentences that only signal importance, expertise, certainty, or polish.
- **Select, don't compress.** Shorter by omission: line numbers, identifier inventories, and test-by-test recitals are noise unless asked for. Summarize validation evidence and material gaps because they affect judgment. What survives is full sentences, not fragments.
- **Depth is pulled, not pushed.** Unless the reader asks for more, stop when the artifact has answered their request. Add further detail only when they ask, preserving the zoom order when it remains useful.
- **Changes anchor in the before.** When the subject is a delta rather than existing code: previously X, now Y — behavior first, then mechanism.

## Quality check

A strong explanation passes the **cut test**: truncating it at a section boundary leaves something true, self-standing, and not misleading. Unfamiliar names are introduced through their roles, and the material, contestable decisions needed to judge the code appear where they clarify the subject; no standalone judgment section is required.

## When the reader doesn't understand

A confused reader is a failed run. Fix their understanding first, then diagnose the miss. If skipping a relevant default caused the confusion, apply it; sharpen its wording only when the instruction itself was ambiguous. If the defaults were applied appropriately and the reader still got lost, the skill has a gap — only that earns a new line. Edit `/Users/muzz/dotfiles/agents/skills/explain/SKILL.md` under the discipline of the proompting skill, and tell the reader what you changed: the edit is itself a contestable decision. An instruction appended per confusion is sediment, not learning.
