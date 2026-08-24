---
name: code-style
description: TypeScript style rules. Use when writing, refactoring, or reviewing TypeScript.
---

# Code Style

## Subtract before you add

Remove complexity first, then build. Deletion reveals the structure an addition will sit on.

- The test for a validator, guard, retry, or config knob: name the caller that produces the input it defends against. A test is not a caller. Can't? Delete it.
- Do not invent a timeout. Add one when its deadline and timeout behavior come from a caller contract, service limit, or explicit user decision. Otherwise propose the reason, value, and what the caller does when it fires. A guessed default with no handler turns a slow call into a random failure. Use the project's existing timeout wrapper when it encodes that decision.
- When you change a function, type, or format, update its callers. Keep the old path only for a named caller this change can't update (another repo, clients still running during a deploy, data already stored in the old format). At the retained path, comment who needs it and its removal condition, for example `// Required by CLI v1; remove when v1 support ends.` Tell the user what you retained and why so they can decide whether to remove it instead. If compatibility is contractual and indefinite, name that contract in the comment.

## When an approach fails

- Find the cause and verify that the approach's assumption is a domain invariant. If it is, restore the invariant at its owner (clean the data, pass the required input, fix the caller) and keep the approach. If the assumption is false or the cause remains unknown, don't hide the failure with a special case; report the evidence and options when the correct replacement requires a user choice.
- Reject an approach as infeasible only on a blocker you verified. Run a safe representative attempt when execution is needed; otherwise cite code, data, an API contract, policy, or a measured operational limit. "Harder to write" is not a blocker.

Bad: `The unique index failed on duplicate emails, so I added a findByEmail check in the handler instead.`
Good: `The unique index fails on 14 duplicate emails, all double-submits. Two ways to keep the index: a migration that removes them, or a partial index on new rows that keeps the race for old ones. I'd take the migration; it deletes rows, so say which.`

## Control flow

- `const` unless reassignment is the clearest shape (accumulators); ternary or early return over reassignment.
- Guard clauses return early. No `else` after a branch that returns.
- Branch instead of catching when failure can be checked. Catch only expected failures at boundaries that report them by throwing; keep work whose failure would indicate a bug outside the catch. Swallowing (`.catch(() => {})`, `catch { logger.warn() }`) is a decision the caller can see: the fallback is in the return type, the caller passed it in, or the retry a throw would trigger costs more than the loss.
- Main function reads as the happy path; helpers below it, close to their use. Extract only to name a real concept or for reuse — no preemptive single-use helpers, never split a simple expression.
- Inline a value used once unless its name explains a non-obvious expression.
- `flatMap`/`filter`/`map` for pure transforms; `for...of` for ordered side effects and mutation. `await` inside a loop only when order or serialization matters (a transaction, a rate limit); independent calls go through `Promise.all` or a bounded-concurrency helper. Type-guard `filter` callbacks to keep inference.

## Types

- Infer. Annotate exports and anything inference gets wrong.
- Parse early; keep what you learned in the type. Never validate-and-discard.
- External data is `unknown` until parsed: webhook payloads, third-party API responses, model output, config files, environment variables, and JSON columns. Parse at the boundary with a schema validator, then trust the type inside.
- Make illegal states unrepresentable. Lifecycle is a tagged union, not boolean blindness:

```ts
type Invoice =
  | { kind: 'Draft'; id: InvoiceId; lines: NonEmptyArray<LineItem> }
  | { kind: 'Sent'; id: InvoiceId; sentAt: Instant }
  | { kind: 'Paid'; id: InvoiceId; paidAt: Instant }
// Bad: isSent/isPaid booleans with parallel optional dates
```

  If a comment is needed to explain when a field combination is valid, the type is too loose — split it.

- Never pass a raw string where a domain type exists. Introduce a brand when two same-primitive values could be swapped without the compiler noticing (`UserId` vs `RepoId`, `Cents` vs `Milliseconds`); construct it through a parser. A value that never crosses a boundary where a swap is possible stays primitive.
- Derive, don't duplicate: schema-inferred types, generated client types, `Pick`/`Omit`/`Parameters`/`ReturnType`/`typeof` before hand-rolling a parallel shape.
- Exhaustive matches: the default arm binds `never` so a new variant breaks the build.

```ts
default: {
  const _exhaustive: never = event
  throw new Error(`unhandled: ${JSON.stringify(_exhaustive)}`)
}
```

- No boolean behavior params: `createUser(input, { emailVerification: 'skip' })`, not `createUser(input, true)`. Booleans are fine as predicate returns.
- Object args over positional once call sites stop being self-documenting. Skip on hot paths.
- Push optionality outward: no optional params for values the function requires; no `Partial<T>` as domain input unless partiality is the concept.
- A default is a value the domain defines, never a stand-in for a missing one. `?? ''` or `?? 'unknown'` on a required value turns absence into a plausible wrong answer that fails far from the cause (`BigInt('')` is `0n`). Absence is a branch: return, throw, or keep `undefined` in the type. An identity element (`0`, `[]`) is a default when emptiness is the domain's answer — a count with no rows — not when the source failed.

```ts
// Bad
const orgId = integrationData?.orgId ?? ''
// Good
if (!integrationData) return { kind: 'skipped', reason: 'no-integration-data' }
const orgId = integrationData.orgId
```

- `satisfies` over `as` to check a value against a type without widening.

## Casts, `any`, `!`

- None of them, in tests too. `as const` is fine. Branch, parse, or refine instead.
- Type guards must verify their claim; name them `isX`/`hasX`. A lying guard is worse than `as` — the bug hides behind a name that promises safety.
- A rare unavoidable cast carries a safety comment; a rare `any` carries a targeted linter suppression with justification.

```ts
const row = await db.tenant.findUnique({ where: { id } })
if (!row) return null

// SAFETY: The database client types id as bigint; this is the primary key we just loaded.
return row.id as TenantId
```

## Modules

- Deep modules: substantial behavior behind a low-burden interface. Low-burden ≠ few functions.
- Deletion test for every layer: if deleting it removes complexity, it was waste; if deleting it spreads complexity across callers, it earned its keep. No shallow pass-throughs.
- Composition over inheritance. Imperative shell, functional core.
- Put a fix in the module that owns the invariant, even if that module is far from where the bug showed up. If the fix already exists too low or too high, move it to the owner and remove the old copy instead of adding another check. Too low: a second caller will need the same fix. Too high: callers that can't hit the problem pay for the check. If a verified blocker prevents the move, tell the user the owner, blocker, and temporary location.
- Keep one source of truth. If one value can always be calculated from another, store the source and calculate the other when needed: a draft invoice total is `sum(lines)`. Store both only when the second value must preserve a historical or operational fact after the source changes (the amount charged, an audit snapshot, an idempotency record), or recalculation has been measured too expensive. When both are stored, one transaction or event produces both so they cannot drift.
- Authorization and request scoping that depend only on the request run once, in middleware or shared request setup. A check on a resource the handler loaded stays in the handler. N copies of the same guard are N−1 chances to omit one, and nothing detects the omission.

## Naming

- Within a domain, one name per concept and one concept per name. Before inventing a name, check the operation doesn't already exist under another one. A generic word may name different concepts when its module or type qualifier makes the domain clear; otherwise find a distinct name.
- Name files and code around durable domain nouns. Task-shaped names (`fix-review-dedup.ts`, `new-flow-helper.ts`) are bad.
- Moved-past ideas stop existing: no references to rejected alternatives or removed concepts, in code or comments.

## Errors & logging

- Use the project's structured logger, never `console.log` in shipped code.
- Errors and log events carry structured context — ids, state, cause — enough to debug from the line alone. Ids and state go in fields; the message stays constant so it aggregates, and a module tag is a child logger, not a `[prefix]`. Never catch just to log-and-rethrow without adding context.

## Tests

- A test is a cost; it must earn its maintenance. Write one only when the change carries logic that could silently regress — a calculation, a parser, a tricky branch. Most changes don't need one; never pad a diff with tests.
- A few tests that exercise real behavior beat a wall that exercises wiring.
- Mock only the boundary you genuinely can't run, such as a third-party service; test through real seams, and follow the project's testing and mocking conventions when you do.
- Don't add production behavior or public API solely for tests. No test-only exports, no `NODE_ENV === 'test'` branches, no injection seam whose only second implementation is a mock. A seam is justified by a real second implementation or a boundary you can't run or control in tests (network, clock, randomness). Extract logic only when it forms a real concept under Modules; test incidental logic through the public surface.
- Never duplicate the logic under test into the test.
- Asserting `toHaveBeenCalledWith` on your own mocks tests the wiring you just wrote, not behavior. If every dependency is mocked, the test proves only that the mocks agree with each other.

## Writing — comments, docs, PRs

- Keep a line only if cutting it would make a reader reopen a settled decision, miss intent, break an invariant, repeat costly discovery, or pick the wrong next step.
- Drop history, narration, rationale archaeology. Short bullets.
- A comment states a constraint the code can't; never what the next line does.

## Changing this file

Edit this skill only when a human asks; this is the bar their candidate must clear. Every agent carries every line into every TypeScript task, and adherence to all rules decays as rules accumulate — so only strict improvements land: better somewhere, worse nowhere, now and later.

- Better than competence, not better than nothing: a capable agent without the line would plausibly do otherwise. If the default is already right, the line is dilution.
- Name the failure it deters and a real task where it changes the outcome. Then hunt for the task where obeying it makes the code worse — found one? Write the question that decides ("X when Y"), never a verdict. A rule that's sometimes wrong is a regression, not a rule.
- Durability is non-regression over time: stated without its incident, indifferent to current versions, dependencies, and repository structure. A stale rule misleads with the file's full authority.
- Strengthen, merge, or delete an existing rule before appending. The file shrinking is an improvement by the same test.
- Examples outrank prose: agents copy code blocks more faithfully than they obey rules, so an example that violates a neighboring rule silently repeals it. Every example here must comply with every rule here.
- Register is flat: no emphasis tokens, no hedges. Attention across rules is zero-sum — the first CAPS demotes every unshouted line, and a "prefer"/"consider" marks its own line negotiable.
- A rule that keeps being violated and is mechanically checkable exits prose: encode it in the project's linter configuration with a message naming the failure, then delete the line here. Wording shifts odds; only mechanism is deterministic.
