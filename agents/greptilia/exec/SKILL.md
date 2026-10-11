---
name: exec
description: Do a task without tests, commit it on a new branch, explain it, then fan out Greptile review, simplify, and tests subagents.
---

Run the task given after `/exec` end to end.

Do a task yourself when that takes less than briefing an agent, letting it rebuild your context, and checking its result. Run tasks as parallel agents only when neither can change the other's result. Each agent acts within its mandate and reports anything else, such as a conflict with its base branch, under Needs a decision, each item in the form the `writing` skill's DECISIONS.md lays out.

## 1. Style

Load the `code-style` skill before reading or editing code.

## 2. Work

Do the task as given. Unless the task is itself a test change, tests do not exist for this step: do not write, edit, run, or read them; do not raise them or shape code for them.

## 3. Commit

- Branch off the current HEAD, named for the task in kebab-case.
- Commit every change the work made.
- Imperative subject under 72 characters. Body only for a why the diff cannot show.

Done when the tree holds nothing from the work and `git log -1` shows the commit.

## 4. Explain

Load the `explain` skill and explain the whole commit. The conversation sets the level, not the coverage: build on the vocabulary, code, and concepts the user already holds, and leave nothing out because it was discussed before.

## 5. Subagents

Fresh subagents, not forks. Each receives the commit SHA, the base branch, the explanation from step 4, the test runs that already passed on the committed tree, and its instructions below. Every subagent loads `code-style`, never stages or commits, and leaves changes unstaged.

Wave 1, in parallel; skip it when the commit only changes tests or docs:

- **Greptile review.** Load `greptile-cli`. Pick effort the way prod auto does, from `git diff --name-only $(git merge-base <base> HEAD) HEAD | wc -l`: 10 or fewer files, no flag; 11–27, `--plus`; over 27, `--apex`. Run `greptile review -b <base> <effort flag> --instructions "Ignore tests. Focus on the rest." --json`. Fix a finding only when it is unequivocally correct and the fix is small and local; report every other finding with its severity. Tests are out of scope.
- **Simplify.** Load `simplify`, scoped to the commit. Apply and report findings under the same rule. Tests are out of scope.

Wave 2, after wave 1 returns or is skipped, so the suite runs against the fixed tree:

- **Tests.** Owns all test work. Default is no new tests. Add one only when it exercises behavior the commit adds or changes, its shape needs no user input, and the scaffolding exists; otherwise skip and report why in one line.
  - From the root, run once the narrowest tests that cover the change and its importers: the touched workspace's narrowest test script; `NODE_ENV=test bunx turbo run test --filter='...[<base>]'` if a shared package's exports changed; `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION=yes bun run test:integration:local` only if the change touches what integration tests exercise. If unsure, go broader. Skip runs that already passed on the committed tree.
  - No extra flags. Bun prints only failures and a summary; read that.
  - A failure in code the commit doesn't touch: rerun that file alone once; if it still points away from the commit, report it as unrelated and don't fix it. If it stopped a workspace's `&&` test chain, run the chain's remaining scripts once, in one command.
  - Make the commit's failures pass. After a fix, rerun only the test files that failed or that you edited; never rerun the full suite or turbo to confirm.

Done when every subagent that ran has reported.

## 6. Report

Load the `writing` skill. One message. Same audience rule as step 4, counting the explanation and anything discussed since. Grouped, plain titles, one or two lines each.

- Fixed, unstaged: what and where.
- Needs a decision: each item in the form the `writing` skill's DECISIONS.md lays out.
- Tests: added or skipped with reason; the runs you chose, why they cover the change, and their results.
- Greptile effort and confidence, or why wave 1 was skipped.
