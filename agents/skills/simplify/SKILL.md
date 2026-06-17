---
name: simpfily
description: Find low-info comments, one-off helpers, perf issues, low-signal logs/errors, and reuse opportunities when the user explicitly asks for it. 
---

Instruction
Review the scoped code by using parallel read-only review agents, then present concise cleanup findings. Do not edit files unless the user explicitly asks you to fix something.

Scope Selection
If the user provided an explicit scope after /simplify (paths, symbols, a diff, or a natural-language area), use that scope.
Otherwise, inspect local changes with both unstaged and staged diffs so staged work is not missed:
git diff --no-color
git diff --cached --no-color
Treat the combined non-empty output as the scope.

If there is no local diff, fall back to concrete files, symbols, or changes mentioned in the conversation.
If that also does not exist, fall back to the current HEAD commit using git show --stat --patch --no-color HEAD.
Preserve unrelated user changes. Do not broaden the scope beyond the selected diff or mentioned files unless needed to understand existing patterns.

Subagents
Launch the following four subagents in parallel. They must only report findings, use the same model as the parent agent, and must not edit files, run formatters, create worktrees, or commit. Pass the full combined diff when possible; if it is too large, pass the file list, relevant hunks, and scope summary.

Code quality reviewer: look for simplification opportunities, including but not limited to:
low-information comments: comments that restate the code instead of explaining intent, edge cases, or invariants.
one-off helpers: small helpers that are only used once and can be inlined to make the flow clearer.
nullable value proliferation: unnecessary null or undefined states that force defensive checks and make invariants unclear.
catch-all try/catch blocks: broad error handling that swallows errors without explaining which exceptions are expected.
unnecessary abstraction: generic wrappers, config objects, or interfaces introduced before there is real reuse.
weak type escape hatches: avoidable any, casts, non-null assertions, or overly broad types that hide real invariants.
duplicated state or derived state: storing values that can be computed from source state, creating stale-state risk.
dead or compatibility code: unused branches, parameters, fallback paths, or old behavior preserved without evidence.

Performance reviewer: look for performance issues, including but not limited to:
Only flag performance issues that are plausible in real usage; avoid cosmetic micro-optimizations.
blocking operations in hot paths: sync Node.js functions or other blocking work that can stall the event loop.
uncached expensive operations: repeated computation, parsing, or lookups whose results could be reused safely.
busy waits: polling or loops that consume CPU while waiting instead of using events, timers, or backoff.
string concatenation in loops: repeated immutable string allocation that can become quadratic or allocation-heavy.
N+1 I/O: per-item database, filesystem, network, or RPC calls where batching would reduce latency or load.
chatty logging/telemetry: high-volume logs or metrics emitted inside tight loops or hot paths.

Logging and error reviewer: look for cleanup-focused low-signal logs and unclear errors. Use the codebase's existing conventions as context, but flag patterns that make logs or errors noisy, vague, unsafe, or hard to trace.
logging taste: logs should help reconstruct what happened at the right boundary for this codebase. Prefer useful context, correlation details, consistent levels/schema, and actionable failure details; avoid noisy lifecycle chatter, duplicate logs, missing correlation, vague messages.
error quality: internal errors should keep enough context and cause information to diagnose failures without swallowing useful details. User-facing errors and bad states should be unambiguous, not leave users stuck or guessing, explain what happened or what the user can do next when possible, and include support-ready details such as request, trace, or run IDs, plus retry/support guidance when useful.

Reuse reviewer: look for existing patterns or helpers in the scoped code and its surrounding context that allow less and simpler code. Do not introduce abstractions unless they clearly reduce complexity now.
Reporting

Aggregate the findings from all subagents and present them as a concise, easy-to-scan global numbered and categorized list. Group duplicates, use plain-language titles, explain the practical impact, and describe the cleanup direction. Avoid line-level detail unless it is needed to disambiguate the finding - provide high-level detail when the finding needs more context to be understood.
Only include concrete, in-scope findings in the main list. If a broader issue is worth preserving, put it in a separate "Needs decision / out of scope" section so it is clearly not part of the main findings. use of unambigious wording and use concise examples to explain findings if relevant. 

Do not edit, run formatters, or run write-oriented commands unless the user explicitly asks for fixes after reviewing the findings.
