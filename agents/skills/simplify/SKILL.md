---
name: simplify
description: Find repeated or misplaced work, low-info comments, one-off helpers, and perf issues when the user explicitly asks for it.
---

Instruction
Review the scoped code with read-only review agents, then present concise cleanup findings. Do not edit files unless the user explicitly asks you to fix something after reviewing them.

Scope Selection
Use the first that exists:
1. The explicit scope the user gave after /simplify (paths, symbols, a diff, or a natural-language area).
2. All pending local changes — staged, unstaged, and untracked files alike; none silently missed.
3. Concrete files, symbols, or changes mentioned in the conversation.
4. The HEAD commit.
Do not broaden beyond the selected scope except to understand existing patterns.

Subagents
Inspect the scope enough to decide which focuses below apply and how to split them across reviewers:
- Skip a focus only when the scope cannot contain its issues, such as performance for a change with no runtime code. When unsure, keep it.
- One reviewer can take every applicable focus when it can apply each in depth across the whole scope. Split when a single reviewer would cover some focuses or parts of the scope only superficially. When unsure, give each focus its own reviewer.
Done when every applicable focus is assigned to reviewers that together cover the whole scope.

Launch the reviewers read-only, on the same model as the parent, in parallel when there are several. Pass each one its focus text, scope handles such as paths, symbols, or commit SHAs, plus only context they cannot cheaply derive themselves. Reviewers gather their own diffs and evidence; pass content only when they cannot access it, such as a user-pasted diff.

Do each thing once, where it belongs: look for anything defined or done more than once, or away from its owner, including but not limited to:
reimplemented code: search the repo for helpers, types, patterns, or maintained libraries that already do what the scoped code builds by hand. Do not introduce abstractions unless they clearly reduce complexity now.
repeated declarations: the same fact, such as a version pin, dependency, or setting, declared in several files when one source already exists or the tooling can inherit from one. Changing that fact should touch one place; copies that have already drifted apart are strong evidence.
repeated loads: values reloaded or recomputed instead of loaded before their first consumer and passed on. A reload is justified only when the consumer needs the current value and it may have changed.
repeated validation: data checked again downstream because an earlier parse discarded what it learned instead of keeping it in the type. External data is parsed once, at the boundary.
duplicated checks: the same check in several entry points instead of once where those paths converge.
misplaced fixes: a fix applied where a bug surfaced instead of in the module that owns the invariant, or another copy of a fix that already exists elsewhere.
stored derived state: values stored that can be derived from their source, creating stale-state risk. Storing both is justified only to preserve a historical or operational fact, or when recalculation is measured too expensive, and then one transaction or event writes both.
hand-copied types: types that restate a shape instead of deriving it from its source schema, generated types, or utility types.
overlapping modules: a new module for a responsibility an existing module already owns.

Code quality: look for simplification opportunities, including but not limited to:
low-information comments: flag a comment unless it records a current constraint, not evident from code or tests, that could prevent a plausible wrong edit.
one-off helpers: helpers or named values used once that neither name a real concept nor explain a non-obvious expression; inlining them makes the flow clearer.
nullable value proliferation: optional fields, parallel booleans, or invented defaults (`?? ''`) where a required parameter, tagged union, or early return would make the invariant explicit.
catch-all try/catch blocks: catches wider than the expected failures the API reports by throwing, catches that only log and rethrow, or ignored errors where losing that work is not intended behavior.
unnecessary abstraction: layers whose deletion would not spread complexity across callers, such as wrappers that only forward calls or injection points that exist only for tests.
speculative safeguards: validators, guards, retries, timeouts, or config options that address no named production scenario (a test is not one).
weak type escape hatches: avoidable any, casts, non-null assertions, or overly broad types that hide real invariants.
dead or compatibility code: unused branches, parameters, fallback paths, or old behavior kept without a named dependency that cannot be updated in the same change.

Performance: look for performance issues, including but not limited to:
Only flag performance issues that are plausible in real usage; avoid cosmetic micro-optimizations.
blocking operations in hot paths: sync Node.js functions or other blocking work that can stall the event loop.
uncached expensive operations: repeated computation, parsing, or lookups whose results could be reused safely.
busy waits: polling or loops that consume CPU while waiting instead of using events, timers, or backoff.
string concatenation in loops: repeated immutable string allocation that can become quadratic or allocation-heavy.
N+1 I/O: per-item database, filesystem, network, or RPC calls where batching would reduce latency or load.
serialized independent work: awaiting independent calls one at a time when neither order nor serialization matters.
chatty logging/telemetry: high-volume logs or metrics emitted inside tight loops or hot paths.

Reporting
Aggregate all findings into one concise, categorized, numbered list: duplicates grouped, plain-language titles, the practical impact, and the cleanup direction. Line-level detail only where it disambiguates a finding. Keep concrete, in-scope findings in the main list; park broader issues in a separate "Needs decision / out of scope" section so they are clearly not part of the findings. Name each skipped focus with a one-line reason so the user knows what was not reviewed.
