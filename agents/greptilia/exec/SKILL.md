---
name: exec
description: Do a task, commit it on a new branch, then run adversarial reviewers on it.
---

Existing code, tests included, shows how things work, not how they should be written: follow a pattern only when you would write it that way from scratch under `code-style`.

Unless the task is a test change or asks for tests, don't write, edit, run, read, or mention tests, or shape code around them; step 6 handles them. Skip step 6 when your work goes back to the agent that spawned you.

Do every step yourself by default, except step 6's tests. Hand any other job to a fresh subagent (not a fork) only when it is independent, sharing no files, inputs, or decisions with the rest of the work, and doing it yourself would cost more than briefing it, letting it rebuild context, and checking its result. A fix you can make in a few edits never qualifies, and neither does waiting on a command: run the command in the background and keep working. Give related jobs to one agent. Brief it with its job and only what it can't derive. It loads `code-style`, never stages or commits unless asked, and reports anything that requires the human or orchestrating agent's decision.

Choose each subagent's model and effort: run `bun <this skill's directory>/models.ts <ids of the models you can spawn>`; each row it prints is a model at one effort level, ranked by benchmark. Size the job by the hardest decision it leaves open, not by its length or whether it edits. A mechanical job, whose brief settles every decision so it only applies, gathers, or follows a pattern, gets the fastest, cheapest row you judge reliable at multi-step tool use. A judgment job, which must choose an approach, find an unknown cause, or decide what matters, gets the parent's row or one above it. When nothing would catch the subagent's mistake before it reaches the user (no test, type check, or review by you), treat a mechanical job as a judgment job. If unsure which a job is, treat it as judgment. Set the model and effort explicitly when spawning.

Speed tiers run the same model faster at a higher price, and the script doesn't list them: fast or priority tiers cost about 2x for about 2x speed, and ultrafast about 6x for about 6x. Use one only when you will wait on the subagent's result with nothing else to do; otherwise request the standard tier, since some harnesses default to a faster one.

To give work its own checkout, run `wt switch --create <branch> --no-cd -y --format json`, then run the work in the returned `path`.

## 1. Work

Load `code-style`, then do the task as given.

## 2. Commit

Commit every change the work made to a branch for this work, named for the code it changes, following `code-style`'s Naming; create it unless you are already on one. Add a body only for a why the diff can't show.

## 3. Start Greptile

Skip this step and step 5 when the commit changes no behavior or meaning.

In the background, run `greptile review -b <base> <effort> --json`, with effort from the number of files changed since the merge base: 10 or fewer, no flag; 11–27, `--plus`; over 27, `--apex`. Add `--instructions "Ignore tests. Focus on the rest."` unless the task is a test change.

## 4. Explain

Load `explain` and explain the whole commit. The conversation sets the level, not the coverage.

## 5. Review fixes

Fix a finding when its right fix is clear and changes nothing the user would want a say in, whether or not the commit touched that code; every other finding goes under Needs a decision. Leave every fix unstaged.

- **Simplify.** Load `simplify`, scoped to the commit, and apply its findings under this rule instead of its no-edit default.
- **Greptile.** When the background review exits, apply its findings under the same rule.
Done when every finding is fixed or under Needs a decision.

## 6. Tests

Once every review fix is in, give tests to a fresh subagent; when the task is a test change, run them yourself instead. Brief it with the base, the commit, that the review fixes are unstaged, the rules below, and how the change could fail in real use, mostly where it meets a database, API, queue, or other service; leave out what you aren't sure of. Its job is to get the tests passing, fast. It edits only test files.

- Work like a lazy QA: add tests only for the briefed failures, the fewest that catch them and need no upkeep, checking what callers observe, not internals. Where the suite can't reach a boundary, report the gap instead of mocking around it. This overrides `code-style`'s Tests rule.
- From the root, run once the narrowest tests that cover the change and its importers: the touched workspace's narrowest test script; `NODE_ENV=test bunx turbo run test --filter='...[<base>]'` if a shared package's exports changed; `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION=yes bun run test:integration:local` only if the change touches what integration tests exercise. If unsure, go broader.
- Run them without extra flags; Bun prints only failures and a summary.
- For a failure in code the commit doesn't touch, rerun that file alone once; if it still points away from the commit, report it as unrelated and leave it. If it stopped a workspace's `&&` test chain, run the chain's remaining scripts once, in one command.
- When the commit changed behavior on purpose, update the failing test, or delete it if it checks removed behavior or internals; rerun only those files. When a failure is a bug in the commit, don't change the test to pass; report it for the main agent to fix.

Fix each failure it reports in the commit's code, then have the same agent rerun the failed files.

Done when every chosen run has passed or its failure is reported as unrelated.

## 7. Report

at the level of understanding the user has already established, using `explain` to cover behavioral changes, and other important things where the human would pass judgement -- like LOC, file system etc. 