---
name: exec
description: Do a task without tests, commit it on a new branch, explain it, then run Greptile review, simplify, and tests on it.
---

Unless the task is a test change, ignore tests until step 6: don't write, edit, run, read, or mention them, or shape code around them.

Do every step yourself by default. Hand a job to a fresh subagent (not a fork) only when it is independent, sharing no files, inputs, or decisions with the rest of the work, and doing it yourself would cost more than briefing it, letting it rebuild your context, and checking its result. A fix you can make in a few edits never qualifies, and neither does waiting on a command: run the command in the background and keep working. Give related jobs to one agent. Brief it with its job and only what it can't derive. It loads `code-style`, never stages or commits, and reports anything outside its job under Needs a decision.

## 1. Work

Load `code-style`, then do the task as given.

## 2. Commit

Commit every change the work made to a new branch off `HEAD`, named for the task in kebab-case. Add a body only for a why the diff can't show.

## 3. Start Greptile

Skip this step and step 5 when the commit changes no behavior or meaning, such as a typo or formatting fix.

In the background, run `greptile review -b <base> <effort> --json`, with effort from the number of files changed since the merge base: 10 or fewer, no flag; 11–27, `--plus`; over 27, `--apex`. Add `--instructions "Ignore tests. Focus on the rest."` unless the task is a test change.

## 4. Explain

Load `explain` and explain the whole commit. The conversation sets the level, not the coverage.

## 5. Review fixes

Fix a finding only when it is unequivocally correct and the fix is small and local; record every other finding with its severity for the report. Leave every fix unstaged.

- **Simplify.** Load `simplify`, scoped to the commit, and apply its findings under this rule instead of its no-edit default.
- **Greptile.** When the background review exits, apply its findings under the same rule.
Done when every finding is fixed or recorded.

## 6. Tests

- Add a test only when it exercises behavior the commit adds or changes, its shape needs no user input, and the scaffolding exists; otherwise say in one line why not.
- From the root, run once the narrowest tests that cover the change and its importers: the touched workspace's narrowest test script; `NODE_ENV=test bunx turbo run test --filter='...[<base>]'` if a shared package's exports changed; `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION=yes bun run test:integration:local` only if the change touches what integration tests exercise. If unsure, go broader.
- Run them without extra flags; Bun prints only failures and a summary.
- For a failure in code the commit doesn't touch, rerun that file alone once; if it still points away from the commit, report it as unrelated and leave it. If it stopped a workspace's `&&` test chain, run the chain's remaining scripts once, in one command.
- Make the commit's failures pass. After a fix, rerun only the test files that failed or that you edited.

Done when every chosen run has passed or its failure is reported as unrelated.

## 7. Report

Load `writing`. One message, grouped, one or two lines per item:

- Fixed, unstaged: what and where.
- Needs a decision: each item in the form the `writing` skill's DECISIONS.md lays out.
- Tests: added or skipped with reason; the runs you chose, why they cover the change, and their results.
- Greptile effort and confidence, or why it was skipped or did not finish.
