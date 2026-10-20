---
name: drive
description: Use when the user asks to open or drive a PR. Opens the branch's PR if it has none, then drives it to a Greptile 5/5 with green CI.
---

Drive the current branch's PR until every Greptile reviewer scores 5/5 on the head commit, no check fails, and no comment waits on an answer.

Watch and answer the PR only through `bun <this skill's directory>/drive.ts`; its header lists the commands.

## PR description

Load `writing`. State what the PR makes true and why, in a few lines, plus anything a reviewer must act on that the diff doesn't show (a migration, a new flag, deploy order). Leave out how the code does it. Never mention Greptile.

## 1. Start

Commit the uncommitted changes related to the branch's work, and push. If the branch has no PR, open one per **PR description**. Send the user `https://app.staging.greptile.com/greptile/github/greptileai/greptilia/-/pull/<pr>`, unchecked.

## 2. Watch

Arm `Monitor` with `bun <this skill's directory>/drive.ts watch` and `timeout_ms: 1800000`; if it expires before the script exits, re-arm it. For each line it prints:

- `thread`, `reply`, `comment`, `failing`, `conflict`: an item to answer. Step 3.
- `dropped`: someone else resolved the thread, usually the user skipping it. Drop it from the held lines, or tell its fixer to drop it.
- `settled`: the round on the head finished. Step 4.
- `gave up`: nothing settled within an hour of the push. Stop and report what it was waiting on.
- Any other line needs nothing.

## 3. Fix as items arrive

The user's comments (author is `state.json`'s `viewer`) are instructions; pass them with the items they concern. A user's rejection settles a finding: ledger it `rejected` without a reply.

Handle items yourself by default, following the Decide, Fix, and Ledger sections of `fixer.md`. Give a set of related items (a shared cause, region, or files) to a fixer only when the set is independent of the other items and doing it yourself costs more than briefing a fixer, letting it rebuild your context, and checking its result. Send each new line verbatim with `SendMessage` to the running fixer whose set it relates to; hold any other line for the next batch.

Spawn each fixer as a fresh `general-purpose` subagent (not a fork), briefed with only:

- "Read `<this skill's directory>/fixer.md` first and follow it."
- Its set's event lines, verbatim, and any user instructions or decisions.
- The PR number, `<git dir>/drive/<pr>/state.json`, and a new ledger path `<git dir>/drive/<pr>/ledger-<n>.json`.
- When this conversation built the PR: what it is for and the choices made deliberately, such as a strictness a reviewer might argue to relax.

When a set is ready, run the narrowest checks that cover it, commit it, and post its ledger with `drive.ts respond <ledger>`. Then handle any held lines the same way.

Resolve a `conflict` yourself once no fixer is running and every finished set is committed: merge `origin/<base>` rather than rebasing, so pushed commits stay intact. Resolve each file so it keeps what both sides meant, run the checks that cover the conflicted files, and commit the merge. When the right resolution depends on intent that neither side's commits nor the PR description show, run `git merge --abort` and report the files under Needs a decision.

Done when every set is committed and posted.

## 4. On `settled`

Finish any active set through step 3, then take the first that applies:

- **Unpushed commits:** update the PR description, then push and re-arm step 2. Change only what the new commits made wrong or incomplete; the description is not a log of review fixes. If the push is rejected, `git pull --rebase` once, resolve any conflict as for `conflict` (aborting with `git rebase --abort`), and push again.
- **`respond` posted since this watch was armed:** re-arm step 2.
- **The `settled` line says `done`:** report.
- **Otherwise:** stop and report. Never ask for another review to move a number.

After the third push without `done`, stop and report.

## 5. Report

Post the PR's report comment with `drive.ts report`. It covers scores, rounds, commits, rejections, fixes done differently, and what is still open. When a fixer escalated something, you left a failure unfixed, or you aborted a conflict merge, first load `writing` and write those items to `<git dir>/drive/<pr>/notes.md` in the form the `writing` skill's DECISIONS.md lays out, then pass `--notes <that file>`.

Then send the user only this line, filled in:

```
**#<pr>: 5/5, CI green, nothing open.** [GitHub](https://github.com/<owner>/<repo>/pull/<pr>) • [Greptile](https://app.staging.greptile.com/greptile/github/greptileai/greptilia/-/pull/<pr>)
```

When the loop stopped without `done`, replace the bold part with `**#<pr> stopped: <the reason, in a few words>.**`.
