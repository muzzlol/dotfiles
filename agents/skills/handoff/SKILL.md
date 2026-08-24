---
name: handoff
description: Write a concise handoff .md for continuing work in a fresh context. Use when the user says handoff, pass to another agent, or start fresh.
---

Instruction
Write `<topic>.md` at the repo root. Do not implement.

Filter
Keep a sentence only if removing it makes the next agent likelier to reopen a decision, miss intent, break an invariant, repeat costly discovery, or choose the wrong next step.

State
- goal, outcome, next step.
- settled direction in affirmative terms.
- invariants, constraints, or preferences not encoded in code.
- read anchors: files, symbols, commands, diffs, docs.
- plausible traps the positive direction does not already prevent.
- open questions that block or shape the next action.

Drop
- history, narration, rationale archaeology.
- rejected options, including negated alternatives.
- caveats, uncertainty, and adjacent facts that do not change action.
- walkthroughs, architecture summaries, and implementation sketches better rediscovered from the repo.
- generic advice, praise, apologies, confidence language.

Format
Use this shape; omit empty sections:

# <goal>

## Settled
## Read First
## Watch For
## Open Questions
## Next

Keep bullets short. Prefer pointers. Name a thing once.
