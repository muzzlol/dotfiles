---
name: exec
description: Do a task without tests, commit it on a new branch, explain it, then run Greptile review, simplify, and tests on it.
---

Run the task given after `/exec` end to end.

Do every step yourself by default. Hand a job to a subagent only when doing it yourself would cost more than briefing an agent, letting it rebuild your context, and checking its result. A fix you can make in a few edits never qualifies, and neither does waiting on a command: run the command in the background and keep working. Run agents in parallel only when neither can change the other's result.

A delegated agent is a fresh subagent, not a fork. It receives the commit SHA, the base branch, its job, and only context it cannot cheaply derive itself. It loads `code-style`, never stages or commits, and leaves changes unstaged. It acts within its mandate and reports anything else, such as a conflict with its base branch, under Needs a decision, each item in the form the `writing` skill's DECISIONS.md lays out.

## 1. Style

Load the `code-style` skill before reading or editing code.

## 2. Work

Do the task as given. Unless the task is itself a test change, tests do not exist for this step: do not write, edit, run, or read them; do not raise them or shape code for them.

## 3. Commit

- Branch off the current HEAD, named for the task in kebab-case.
- Commit every change the work made.
- Imperative subject under 72 characters. Body only for a why the diff cannot show.

Done when the tree holds nothing from the work and `git log -1` shows the commit.

## 4. Start Greptile

When the commit only changes tests or docs, skip this step and step 6.

Load `greptile-cli`. Pick effort the way prod auto does, from `git diff --name-only $(git merge-base <base> HEAD) HEAD | wc -l`: 10 or fewer files, no flag; 11–27, `--plus`; over 27, `--apex`. Start `greptile review -b <base> <effort flag> --instructions "Ignore tests. Focus on the rest." --json` as a background command, then go on to step 5.

## 5. Explain

Load the `explain` skill and explain the whole commit. The conversation sets the level, not the coverage: build on the vocabulary, code, and concepts the user already holds, and leave nothing out because it was discussed before.

## 6. Review fixes

Fix a finding only when it is unequivocally correct and the fix is small and local; record every other finding with its severity for the report. Tests are out of scope. Leave every fix unstaged.

- **Simplify.** Load `simplify`, scoped to the commit, and apply its findings under the rule above; that rule replaces simplify's own no-edit default.
- **Greptile.** When the background review exits, apply its findings under the same rule. A non-zero exit means the review did not finish; record that for the report.

Done when every finding is fixed or recorded and every agent you delegated to has reported.

## 7. Tests

Run after step 6 so the suite runs against the fixed tree.

- Default is no new tests. Add one only when it exercises behavior the commit adds or changes, its shape needs no user input, and the scaffolding exists; otherwise skip and report why in one line.
- From the root, run once the narrowest tests that cover the change and its importers: the touched workspace's narrowest test script; `NODE_ENV=test bunx turbo run test --filter='...[<base>]'` if a shared package's exports changed; `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION=yes bun run test:integration:local` only if the change touches what integration tests exercise. If unsure, go broader. Skip runs that already passed on the committed tree.
- No extra flags. Bun prints only failures and a summary; read that.
- A failure in code the commit doesn't touch: rerun that file alone once; if it still points away from the commit, report it as unrelated and don't fix it. If it stopped a workspace's `&&` test chain, run the chain's remaining scripts once, in one command.
- Make the commit's failures pass. After a fix, rerun only the test files that failed or that you edited; never rerun the full suite or turbo to confirm.

Done when every chosen run has passed or its failure is reported as unrelated.

## 8. Report

Load the `writing` skill. One message. Same audience rule as step 5, counting the explanation and anything discussed since. Grouped, plain titles, one or two lines each.

- Fixed, unstaged: what and where.
- Needs a decision: each item in the form the `writing` skill's DECISIONS.md lays out.
- Tests: added or skipped with reason; the runs you chose, why they cover the change, and their results.
- Greptile effort and confidence, or why it was skipped or did not finish.
