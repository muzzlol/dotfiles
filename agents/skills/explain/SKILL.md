---
name: explain
description: Explain code or a change so the reader can judge it. Use when the user asks to walk through, explain, or understand code or a change ("how does X work", "walk me through what you changed"), and unprompted as the closing report after completing a nontrivial feature or fix.
---

The reader is the decision-maker in a codebase they might not know - assume they don't. An explanation exists to arm their judgment — a misunderstanding is worse than a gap, a negative multiplier on every decision built on it. Their attention may lapse at any paragraph, so aim for **progressive payoff**: at each section boundary, what remains should be the best practical account at that length.

## Zoom, don't chapter

Chapters (file-by-file, backend-then-frontend) read halfway give half a story. Zooms tell the whole story at every level, each pass sharper. Four, in order:

1. **Governing idea** — the one fact the rest derives from, stated first (e.g. "billing is in arrears" generates: no refunds, invoice-immediately, why a preview endpoint exists). Test: could the reader predict most of the remaining detail from it? When no generating fact exists, don't manufacture one — open with what the change does and why it was wanted.
2. **Flow** — behavior as information: what data exists, how it transforms, how it reaches the user. Diagram it when the shape is the content; prose when it isn't.
3. **Pieces** — each mechanism mapped back onto the flow, file path attached as an address.
4. **Judgment surface** — the material, contestable decisions the code embeds, each stated so the reader can veto or bless it: policies encoded, tradeoffs taken, defaults chosen. When files were created or moved, the carving is itself a decision when it materially affects the design — name it and defend it (durable domain object, or task-shaped?). Mark what you are unsure of; a confident gloss is the misunderstanding this skill exists to prevent.

Verdicts normally come last because judging requires understanding: each zoom is the most valuable thing *given what has already been read*. Lead with the verdict when the reader explicitly asks for it or when delaying it would obscure the answer.

## Defaults

Apply these defaults for a reader unfamiliar with the code. Depart from them when the reader's context or task makes another ordering clearer.

- **Role before name.** Establish an unfamiliar identifier, path, or term's purpose before naming it. A name already established in the conversation needs no reintroduction.
- **Prefer local completeness.** Let each sentence lean on established context; avoid unnecessary forward references such as "as we'll see below."
- **Select, don't compress.** Shorter by omission: line numbers, identifier inventories, and test-by-test recitals are noise unless asked for. Summarize validation evidence and material gaps because they affect judgment. What survives is full sentences, not fragments.
- **Depth is pulled, not pushed.** Unless the reader asks for more, stop after zoom 4. Further detail comes when the reader asks, and the answer is itself zoom-ordered.
- **Changes anchor in the before.** When the subject is a delta rather than existing code: previously X, now Y — behavior first, then mechanism.

## Quality check

A strong explanation passes the **cut test**: truncating it at a section boundary leaves something true, self-standing, and not misleading. Unfamiliar names are introduced through their roles, and the material, contestable decisions needed to judge the code appear on the judgment surface.

## When the reader doesn't understand

A confused reader is a failed run. Fix their understanding first, then diagnose the miss. If skipping a relevant default caused the confusion, apply it; sharpen its wording only when the instruction itself was ambiguous. If the defaults were applied appropriately and the reader still got lost, the skill has a gap — only that earns a new line. Edit `/Users/muzz/dotfiles/agents/skills/explain/SKILL.md` under the discipline of the writing-great-skills skill, and tell the reader what you changed: the edit is itself a contestable decision. An instruction appended per confusion is sediment, not learning.
