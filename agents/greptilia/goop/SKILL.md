---
name: goop
description: Use when the user says goop, and right after you open a PR (as after exec). Drives the PR to a Greptile 5/5 with green CI by fixing or answering each review comment and CI failure as it lands.
---

Drive the current branch's PR until every Greptile reviewer scores 5/5 on the head commit, no check fails, and no comment waits on an answer. You orchestrate. A fixer subagent decides each item and edits code; you never judge a finding yourself.

`goop.ts`, beside this file, is the only way goop touches GitHub: run `bun <this skill's directory>/goop.ts <command> [pr]`. Its header documents the commands and the run files it keeps in `<git dir>/goop/<pr>/`. Do not poll GitHub, parse Greptile comments, or post replies any other way.

## 1. Start

Send the user `https://app.staging.greptile.com/greptile/github/greptileai/greptilia/-/pull/<pr>`, unchecked. Then check that you are on the PR's branch, no tracked file has staged or unstaged changes (step 3 commits or stashes every change in the tree), and `HEAD` equals the PR head on GitHub. If any check fails, stop and say which. Note the untracked files present now: they are the user's, so goop and its fixers never edit, commit, stash, move, or delete them.

Done when all three hold and the untracked files are noted.

## 2. Watch

Arm `Monitor` with `bun <this skill's directory>/goop.ts watch`, `timeout_ms: 1800000`, described as `goop PR #<n>`. The script polls GitHub every 20s and prints one line per event, so you spend nothing while CI and Greptile run. It never repeats an event it already printed. If the monitor expires before the script exits, re-arm it.

| Line                 | Meaning                                                                          | Do                                                                   |
| -------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `thread <id> …`      | A thread needs an answer: a new finding, a person's comment, or the user's own   | Steer it                                                             |
| `reply <id> …`       | A new comment on a thread goop already answered                                  | Steer it                                                             |
| `comment <id> …`     | A person's PR comment                                                            | Steer it                                                             |
| `failing <check> …`  | A check failed on the head                                                       | Steer it                                                             |
| `dropped <id> …`     | Someone other than goop resolved the thread, usually the user saying "skip this" | Remove it from the held lines, or `SendMessage` its fixer to drop it |
| `acknowledged …`     | Greptile 👍'd a rejection; the script resolved the thread                        | Nothing                                                              |
| `requested review …` | No review started after a push, so the script asked for one                      | Nothing                                                              |
| `settled …`          | The round on the head finished; the script exited                                | Step 4                                                               |
| `gave up …`          | Nothing settled within an hour of the push; the script exited                    | Stop and report what it was waiting on                               |

## 3. Fix as items arrive

Run one fixer at a time, since two would edit the same tree. While a fixer runs, steer new lines into it with `SendMessage`, verbatim. While you handle a returned fixer's work below, hold them. Otherwise, record `git rev-parse HEAD` as the fixer's start, then spawn a fresh `general-purpose` subagent (not a fork) with the new and held lines. Brief it with only:

- "Read `<this skill's directory>/fixer.md` first and follow it."
- The event lines, verbatim.
- The PR number, `<git dir>/goop/<pr>/state.json`, and a new ledger path `<git dir>/goop/<pr>/ledger-<n>.json`.
- The untracked files noted at start, which it must leave alone.
- When this conversation built the PR: what it is for and the choices made deliberately (a strictness a reviewer might argue to relax, machinery removed on purpose), since the fixer can only honor intent that is written down.

Give no opinion on the items; the fixer judges them against the code.

When it returns:

1. **Audit.** Run `git reset <fixer's start>`, which turns the fixer's commits back into uncommitted changes beside the ones exec left unstaged, and frees any noted file a fixer commit swept up. `git-hunk scan --mode stage --json` then lists every change with its `change_key`, new files included. Approve a change only when a ledger entry marked `fixed` or a failing check the fixer reports fixed requires it, or it is a small, local fix from exec's review step. A test change must pin behavior a fix changed. Never approve a noted file.
2. **Commit** only the approved changes: `git-hunk commit --snapshot <id> --change-key <key>… -m "<subject that says what the fixes do>"`. Then stash every path still changed except the noted files: `git stash push --include-untracked -m "goop: unapproved, fixer <n>" -- <paths>`, so the next fixer starts clean and nothing a fixer wrote is lost.
3. **Post** with `bun <this skill's directory>/goop.ts respond <ledger>`. It replies on each item, resolves fixed threads, and skips any thread someone else resolved meanwhile.

Done when the tree holds nothing beyond the untracked files noted at start and `respond` printed a line for every ledger entry. If lines were held meanwhile, spawn the next fixer with them.

## 4. On `settled`

First let a running fixer finish step 3. Then take the first that applies:

- **Unpushed commits:** update the PR description, then push and re-arm step 2. If the push is rejected because the branch moved, `git pull --rebase` once and push again; if the rebase conflicts, stop and report.
  - The description goes first because the review the push starts reads it. Load the `writing` skill and edit only what the new commits made wrong or incomplete, so the description reads as if the PR had been written this way from the start; it is not a log of review fixes. Write the body to a file, apply it with `gh pr edit <n> --body-file <file>`, and read it back. Never name or mention Greptile in it: an edit that newly mentions the bot starts an extra review.
- **`respond` posted since this watch was armed:** re-arm step 2. Greptile's answer to those replies comes next.
- **The `settled` line says `done`:** report.
- **Otherwise:** nothing is left that goop can act on (rejections a reviewer hasn't accepted, failures the fixer left, a score held below 5/5 with nothing posted behind it). Stop and report. Never ask for another review to move a number.

After the third push without `done`, stop and report. Rounds that keep producing findings mean the change needs a decision, not another round.

## 5. Report

Load the `writing` skill. One message:

- **Result:** each reviewer's score and the commit it scored; CI.
- **Fixed:** grouped, one line each.
- **Rejected:** one line each with the reason, and whether the reviewer accepted it or the thread is still open.
- **Needs a decision:** the fixers' escalations, failures left unfixed, threads waiting on a person; each item in the form the `writing` skill's DECISIONS.md lays out.
- **Tests:** from the fixers' reports.
- **Stashed:** each `goop: unapproved` stash and what it holds, if any.
