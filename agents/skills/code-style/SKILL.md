---
name: code-style
description: TypeScript style rules. Use when writing, refactoring, or reviewing TypeScript code.
---

# Code Style

## Subtract before you add

Remove complexity first, then build. Deletion reveals the structure an addition will sit on.

- First try to satisfy the requirement by improving or removing existing code. Add new code only when the requirement cannot be satisfied that way.
- A function, type, or format change updates every in-repo use and removes the old path.
  - Retain compatibility only for a named dependency that cannot be updated in the same change (ask if the repository cannot establish whether one exists). Document who needs the old path and its removal condition, or name the contract when support is indefinite.
- Validators, guards, retries, or config options must address a named production scenario (a test is not one).
- Timeouts must enforce a deadline from the request, job, or an explicit product requirement, and define what happens when that deadline is missed.
  - A downstream service's timeout is not the local deadline, you may add a shorter local timeout only when this code must stop early enough to recover.

## A blocked solution may still be valid

- Another problem blocking a solution does not by itself make the solution wrong. Determine whether it would work once that problem is resolved.
- Implementation difficulty alone does not make a solution infeasible.

Bad: `The unique index failed on duplicate emails, so I added a findByEmail check in the handler instead.`
Good: `The unique index fails on 14 duplicate emails, all double-submits. Two ways to keep the index: a migration that removes them, or a partial index on new rows that keeps the race for old ones. I'd take the migration; it deletes rows, so say which.`

## Control flow

- `const` unless reassignment is the clearest shape (accumulators); ternary or early return over reassignment.
- Guard clauses return early. No `else` after a branch that returns.
- Branch on expected failure states when the API exposes them. Catch only expected failures the API reports by throwing, and keep work whose failure would be a bug outside the `catch`. Ignore a caught error only when losing that work is an explicit part of the function's behavior.
- Main function reads as the happy path; helpers below it, close to their use. Extract only to name a real concept or for reuse — no preemptive single-use helpers, never split a simple expression.
- Inline a value used once unless its name explains a non-obvious expression.
- `flatMap`/`filter`/`map` for pure transforms; `for...of` for ordered side effects and mutation. `await` inside a loop only when order or serialization matters (a transaction, a rate limit); independent calls go through `Promise.all` or a bounded-concurrency helper. Type-guard `filter` callbacks to keep inference.

## Types

- Let TypeScript infer local types. Annotate exported APIs and values whose inferred type is too broad or too narrow.
- Parse early; keep what you learned in the type. Never validate-and-discard.
- External data is `unknown` until parsed: webhook payloads, third-party API responses, model output, config files, environment variables, and JSON columns. Parse at the boundary with a schema validator, then trust the type inside.
- Make illegal states unrepresentable. Lifecycle is a tagged union, not parallel booleans and optional fields.
  If a comment is needed to explain when a field combination is valid, the type is too loose — split it.

- Use existing domain types; brand same-primitive values only when they could be confused (`TenantId`/`RepoId`, `Cents`/`Milliseconds`).
- Derive types from their source instead of duplicating shapes (schema-inferred types, generated client types, TypeScript utility types).
- Make matches exhaustive.

- No boolean behavior params: `createUser(input, { emailVerification: 'skip' })`, not `createUser(input, true)` (predicate returns may be booleans).
- Use an object parameter when positional arguments obscure meaning: `listReviews({ repoId, status: 'open', sort: 'updated-desc' })`, not `listReviews(repoId, 'open', 'updated-desc')` (keep positional arguments when obvious, as in `getUser(userId)`).
- Require a parameter when the function cannot operate without it. Accept absence when handling absence is part of the function's contract.
- Use a default only when it is a valid domain value. `0` and `[]` are valid when no result means zero or empty, not when the source failed. When a required value is missing, return, throw, or keep `undefined` instead of inventing a value.

```ts
// Bad
const orgId = integrationData?.orgId ?? ''
// Good
if (!integrationData) return { kind: 'skipped', reason: 'no-integration-data' }
const orgId = integrationData.orgId
```

- `satisfies` over `as` to check a value against a type without widening.

## Casts, `any`, `!`

- Branch, parse, or refine instead of using a cast or non-null assertion, including in tests.
  - An unavoidable assertion carries a comment explaining why it is safe.
  - `as const` is allowed.
- Type guards must verify their claim; name them `isX`/`hasX`. A lying guard is worse than `as` — the bug hides behind a name that promises safety.
- If `any` is unavoidable, add a targeted linter suppression with justification.

## Modules

- Deep modules: a layer earns its place when deleting it would spread complexity across callers. Delete layers that only forward calls or move complexity elsewhere.
- Fixes belong in the module that owns the invariant (even if far from where a bug showed up). If a fix already exists elsewhere, move it instead of adding another copy. If a verified blocker prevents the move, tell the user where the fix belongs, what blocks the move, and where it remains temporarily.
- Keep one source of truth. Derive values instead of storing them: a draft invoice total is `sum(lines)`.
  - Store both values only to preserve a historical or operational fact after the source changes, or when recalculation is measured too expensive.
  - One transaction or event produces both stored values so they cannot drift.
- Checks that apply to multiple entry points belong where those paths converge, once enough information is available.

## Naming

- Within a domain, one name per concept and one concept per name.
  - A generic name may refer to different concepts when its module or type makes the meaning clear.
- Name files and code around durable domain nouns. Task-shaped names (`fix-review-dedup.ts`, `new-flow-helper.ts`) are bad.
- Once an approach is rejected or a concept is removed, remove its code and comments.

## Errors & logging

- Errors preserve their cause and enough context to debug from one line. User-facing errors explain what happened and what the user can do next.
- Logs help reconstruct what happened; no lifecycle chatter or duplicates. Never catch just to log and rethrow without adding context.

## Tests

- Tests protect behavior required by the change, not types, framework behavior, or implementation details (unless the user explicitly requests that coverage).
- Tests do not justify production behavior or public APIs. Add dependency injection only for a real second implementation or a dependency tests cannot control.
- Never duplicate the logic under test into the test.

## Writing — comments, docs, PRs

- Default to no code comments. Remove low-information comments in and around code you change, even when surrounding code uses them. Keep only comments that explain a non-obvious reason, constraint, or invariant.
- In docs and PRs, keep a line only if cutting it would make a reader reopen a settled decision, miss intent, repeat costly discovery, or pick the wrong next step.
