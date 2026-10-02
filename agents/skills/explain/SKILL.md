---
name: explain
description: >-
  Explain code and changes in plain language.
  Use when the user asks how code works, what changed, or for a walkthrough.
  When adding or changing a multi-step code flow, explain the planned flow before
  editing and the resulting behavior afterward, even without a request.
---

Help the reader judge the code. Follow the [writing skill](../writing/SKILL.md) for prose; this skill covers what code explanations need to include.

## Start with the whole story

Give the whole story before any detail. A file-by-file or backend-then-frontend tour leaves the reader with half of it. Answer at the level of the question, not of your investigation.

Cover these in order, skipping what the reader doesn't need:

1. **Main idea**: For a change, say what the code does now and why, then the problem, then the fix.
2. **Flow**: Show how values are built, passed, and returned between functions. For a multi-step path, draw a diagram as described in **Draw the code flow**.
3. **Decisions**: Name each choice the reader might challenge, such as a policy, tradeoff, or default, beside the behavior it affects. When it helps the reader judge a choice, name the alternative and the cost of switching. Group decisions only when that reads more easily. When file boundaries affect a decision, explain why the code is split that way.

Show changed signatures, types, calls, components, or files in a `diff` block, with enough context to show ownership and order. When most of a block is new, a partial diff would lose context, or the reader needs to copy it, show the whole block.

## Draw the code flow

When an explanation covers a multi-step code path, draw it as a diagram. Before the first edit that adds or changes one, trace the current code and diagram the plan. If the code ends up different, update the diagram in the final explanation.

Draw the real shape, not a table or a straight call stack:

- **Layers**: Put the real signature from the project's code in each layer, with its file path. Where the code has no type names, show the value shape. List each project-defined type passed between layers once in a type legend, with every field.
- **Order**: Number calls only when order matters. For overlapping work, draw a fork and join, name the real code (`Promise.all`, `asyncio.gather`), and show whether it waits for all, the first, some number, or none. Show timeouts and cancellation when they matter.
- **Edges**: Label each branch with its real condition, and each loop, retry, transaction, lock, queue, event, stream, or callback with its real operation. Don't invent a fixed symbol for every kind of program.
- **Errors**: Draw each error where it starts and where it is caught, converted, retried, or falls back. In plain text, `──╳ Error` can mark an error that travels to the caller until a handler is drawn.
- **Side effects**: Draw each as an arrow labeled with the operation, pointing to its exact target: `── INSERT ──▶ [Tenant table]`.
- **Legend**: Explain only the marks used. A missing error or side-effect arrow means you checked and found none. Use `?` for unknown behavior or an open choice.

The diagram is done when it shows every flow the explanation covers, including added, changed, and removed ones, and the reader can see each layer's input, output, errors, side effects, order, branches, and waits without opening the code.

## Defaults

Apply these unless the reader already supplied the context.

- **Stop at signatures**: Describe code inside a function only when it does something its signature hides, such as writing to storage, calling the network, changing an argument, or throwing an undeclared error. Flag each case as a mismatch between signature and behavior.
- **Correct likely misconceptions**: Call out behavior a newcomer would reasonably predict wrong.
- **Trace cause and effect**: Follow the trigger through each decision and state change that matters, to the observable result. Don't hide a step behind "then" or "eventually."
- **Back behavioral claims**: Base each on code read, a diff compared, or a run observed. Flag claims you haven't traced.
- **Separate behavior from intent**: Code shows what happens, rarely why. Cite documented rationale, label inferences, and say when the reason is unknown.
- **Summarize validation**: Give the evidence and material gaps. Unless asked, omit line numbers, identifier inventories, and test-by-test accounts.

## Quality check

Apply the writing skill's draft check and cut test. Check that the decisions needed to judge the code appear beside the relevant behavior or in a useful group.

## When the reader doesn't understand

Resolve the reader's confusion first, then diagnose the cause:

- If you skipped a relevant default, apply it. Revise its wording only if it was ambiguous.
- If you applied the relevant defaults correctly and the reader still got lost, add guidance for the uncovered gap.

Put general prose fixes in the writing skill and code-explanation fixes here.
