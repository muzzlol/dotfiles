#!/usr/bin/env bun
// GitHub side of the drive loop.
//   bun drive.ts watch [pr]             print one line per new event until the round on the PR head settles
//   bun drive.ts state [pr]             snapshot the PR into state.json and print a summary
//   bun drive.ts respond <ledger> [pr]  post a fixer ledger: reply to each item, resolve the fixed threads
//   bun drive.ts report [--notes <file>] [--dry-run] [pr]
//                                       post or update the PR comment summing up the run; --notes adds the agent's markdown
// [pr] defaults to the current branch's PR. Run files live in $(git rev-parse --git-dir)/drive/<pr>/:
// state.json (latest snapshot), watch.json (written only by watch), history.json (written only by respond), logs/.
//
// drive posts as the user's own GitHub account, so authorship cannot tell the user's comments from drive's.
// history.json records when drive answered each item; any later comment that drive did not post needs an answer.
import { $ } from 'bun'
import { mkdir } from 'node:fs/promises'

// One 1-point GraphQL query per poll; 20s keeps one watch near 180 of the 5,000 points/hour.
const POLL_MS = 20_000
// Repos that don't re-review on push need a comment to start a round.
const REQUEST_REVIEW_AFTER_MS = 2 * 60_000
// Greptile completes its check run a few seconds before it edits the summary.
const SUMMARY_GRACE_MS = 3 * 60_000
// Greptile marks a reply it is answering with 👀 shortly after the reply lands.
const REPLY_GRACE_MS = 3 * 60_000
// Hang guard: a stuck check or a review that never starts would otherwise hold the loop forever.
const GIVE_UP_MS = 60 * 60_000
// Waits on a person approving the PR, so no fix can turn it green.
const IGNORED_CHECKS = new Set(['Confirm human in the loop'])
// gh supplies the token once; every API call after that is a direct request.
const TOKEN = (await $`gh auth token`.quiet().text()).trim()

type Pr = {
  number: number
  owner: string
  repo: string
  headSha: string
  headRef: string
  baseRef: string
  viewer: string
  runDir: string
}

type Comment = { id: number; author: string; isBot: boolean; body: string; at: string }
type Thread = {
  id: string
  resolved: boolean
  resolvedBy: string | null
  path: string
  line: number | null
  outdated: boolean
  reviewer: string
  reviewerIsBot: boolean
  severity: string | null
  title: string
  url: string
  comments: Comment[]
  // Bot reactions on the last comment, as GraphQL reaction contents (THUMBS_UP, EYES).
  botReactions: string[]
}
type IssueComment = Comment & { url: string }
type Summary = {
  bot: string
  score: number | null
  reviewedSha: string | null
  onHead: boolean
  reviews: number | null
  url: string
  text: string
}

type CheckState = 'pending' | 'pass' | 'fail' | 'skip'
type Check = { id: number | null; name: string; app: string; state: CheckState; url: string }
type Failure = { onBase: string | null; annotations: string[]; log: string | null; errorLines: number[] }

type Snapshot = {
  pr: Omit<Pr, 'runDir' | 'viewer'>
  // UNKNOWN until GitHub finishes computing it after a push or a base change; merged and closed PRs stay UNKNOWN.
  mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN'
  closed: boolean
  greptile: Summary[]
  threads: Thread[]
  issueComments: IssueComment[]
  checks: Check[]
}

type Target = { thread: string } | { comment: number }
// fixed-differently: fixed another way than the commenter asked; the reply says how and why.
type Verdict = 'fixed' | 'fixed-differently' | 'rejected'
type Answer = Target & { verdict: Verdict; where: string; title: string }
// `at` is GitHub's timestamp for drive's reply, or for the comment it settled without replying.
type HistoryEntry = Answer & { reply: string | null; at: string }
type History = { entries: HistoryEntry[]; resolved: string[] }
type WatchFile = {
  startedAt: string
  seen: Record<string, number>
  // Threads that needed an answer at the last poll; one resolved by someone else since then is dropped.
  open: string[]
  checks: number[]
  acknowledged: string[]
  posted: number[]
  reviewRequested: string[]
  // Heads already reported as conflicting with the base branch.
  conflicts: string[]
  headSeenAt: Record<string, string>
  // Each settled head's scores, as `<bot> <score>`.
  rounds: Record<string, { at: string; scores: string[] }>
  reportComment: number | null
  failures: Record<string, Failure>
}

const [command, ...args] = process.argv.slice(2)
switch (command) {
  case 'watch':
    await watch(await loadPr(args[0]))
    break
  case 'state': {
    const pr = await loadPr(args[0])
    const [snapshot, watchFile, history] = await Promise.all([takeSnapshot(pr), readWatchFile(pr), readHistory(pr)])
    for (const check of snapshot.checks.filter(isFailing))
      watchFile.failures[failureKey(check)] ??= await describeFailure(pr, check)
    await writeState(pr, snapshot, watchFile, history)
    console.log(summarize(pr, snapshot, watchFile, history))
    break
  }
  case 'respond':
    if (!args[0]) fail('usage: drive.ts respond <ledger.json> [pr]')
    await respond(await loadPr(args[1]), args[0])
    break
  case 'report': {
    const notesAt = args.indexOf('--notes')
    const notesPath = notesAt === -1 ? null : args[notesAt + 1]
    if (notesPath === undefined) fail('usage: drive.ts report [--notes <file>] [--dry-run] [pr]')
    const [number] = args.filter((arg, index) => !arg.startsWith('--') && (notesAt === -1 || index !== notesAt + 1))
    const notes = notesPath === null ? null : (await Bun.file(notesPath).text()).trim()
    await report(await loadPr(number), notes, args.includes('--dry-run'))
    break
  }
  default:
    fail('usage: drive.ts watch|state [pr] | respond <ledger.json> [pr] | report [--notes <file>] [--dry-run] [pr]')
}

async function watch(initial: Pr) {
  let checksDoneAt: number | null = null
  for (;;) {
    const [snapshot, watchFile, history] = await Promise.all([
      takeSnapshot(initial),
      readWatchFile(initial),
      readHistory(initial),
    ])
    const pr = { ...initial, headSha: snapshot.pr.headSha }
    const driveResolved = new Set([...history.resolved, ...watchFile.acknowledged])
    watchFile.headSeenAt[pr.headSha] ??= new Date().toISOString()
    const headAge = Date.now() - Date.parse(watchFile.headSeenAt[pr.headSha]!)
    const events: string[] = []

    for (const check of snapshot.checks.filter(isFailing)) {
      if (check.id !== null && watchFile.checks.includes(check.id)) continue
      const failure = (watchFile.failures[failureKey(check)] ??= await describeFailure(pr, check))
      if (check.id !== null) watchFile.checks.push(check.id)
      events.push(
        `failing ${check.name} · ${failure.onBase === null ? 'no run on base' : `${failure.onBase} on base`} · ${check.url}`,
      )
    }

    if (snapshot.mergeable === 'CONFLICTING' && !watchFile.conflicts.includes(pr.headSha)) {
      watchFile.conflicts.push(pr.headSha)
      events.push(`conflict ${pr.headSha.slice(0, 7)} with ${pr.baseRef}`)
    }

    const inFlight: string[] = []
    const open: string[] = []
    for (const thread of snapshot.threads) {
      const where = `${thread.path}:${thread.line ?? '?'}`
      const last = thread.comments.at(-1)!
      if (thread.resolved) {
        if (watchFile.open.includes(thread.id) && !driveResolved.has(thread.id)) {
          events.push(`dropped ${thread.id} ${where} resolved by ${thread.resolvedBy ?? 'unknown'}`)
        }
        continue
      }
      const seen = watchFile.seen[thread.id]
      watchFile.seen[thread.id] = thread.comments.length
      if (unanswered(thread, history).length > 0) {
        open.push(thread.id)
        if ((seen ?? 0) < thread.comments.length) {
          events.push(
            seen === undefined
              ? `thread ${thread.id} ${thread.severity ?? '-'} ${where} "${thread.title}" from ${thread.reviewer}`
              : `reply ${thread.id} ${where} from ${last.author}`,
          )
        }
        continue
      }
      if (!thread.reviewerIsBot || last.author !== pr.viewer) continue
      const reaction = botReaction(thread)
      if (reaction === '+1') {
        await resolveThread(thread.id)
        watchFile.acknowledged.push(thread.id)
        events.push(`acknowledged ${thread.id} ${where} by ${thread.reviewer}; resolved`)
      } else if (reaction === 'eyes' || (reaction === null && Date.now() - Date.parse(last.at) < REPLY_GRACE_MS)) {
        inFlight.push(`${thread.reviewer} answering ${where}`)
      }
    }

    watchFile.open = open

    for (const comment of openIssueComments(snapshot, watchFile, history)) {
      if (watchFile.seen[comment.id] !== undefined) continue
      watchFile.seen[comment.id] = 1
      events.push(`comment ${comment.id} from ${comment.author}: "${comment.body.split('\n')[0]!.slice(0, 80)}"`)
    }

    const greptileCheckOnHead = snapshot.checks.some((check) => isGreptile(check) && check.name === 'Greptile Review')
    const summaryOnHead = snapshot.greptile.some((summary) => summary.onHead)
    if (
      !greptileCheckOnHead &&
      !summaryOnHead &&
      headAge > REQUEST_REVIEW_AFTER_MS &&
      !watchFile.reviewRequested.includes(pr.headSha)
    ) {
      const { id } = (await github(`repos/${pr.owner}/${pr.repo}/issues/${pr.number}/comments`, 'POST', {
        body: '@greptileai review',
      })) as { id: number }
      watchFile.posted.push(id)
      watchFile.reviewRequested.push(pr.headSha)
      events.push(
        `requested review of ${pr.headSha.slice(0, 7)}: no review started ${REQUEST_REVIEW_AFTER_MS / 60_000} minutes after it was pushed`,
      )
    }

    const pendingChecks = snapshot.checks.filter((check) => check.state === 'pending').map((check) => check.name)
    // Right after a push the head has no check runs yet; a repo without CI shows none at all.
    if (snapshot.checks.length === 0 && headAge < REQUEST_REVIEW_AFTER_MS) pendingChecks.push('(no checks on head yet)')
    checksDoneAt = pendingChecks.length === 0 ? (checksDoneAt ?? Date.now()) : null
    const summaryGraceOver = checksDoneAt !== null && Date.now() - checksDoneAt > SUMMARY_GRACE_MS
    const summariesBehind = summaryGraceOver
      ? []
      : snapshot.greptile.filter((summary) => !summary.onHead).map((summary) => `${summary.bot} summary`)
    const mergeabilityPending = snapshot.mergeable === 'UNKNOWN' && !snapshot.closed ? ['mergeability'] : []
    const waitingOn = [...pendingChecks, ...summariesBehind, ...inFlight, ...mergeabilityPending]

    if (waitingOn.length === 0) {
      watchFile.rounds[pr.headSha] = {
        at: new Date().toISOString(),
        scores: snapshot.greptile.map((summary) => `${summary.bot} ${summary.onHead ? (summary.score ?? '?') : '?'}`),
      }
    }
    await writeWatchFile(pr, watchFile)
    await writeState(pr, snapshot, watchFile, history)
    for (const event of events) console.log(event)

    if (waitingOn.length === 0) {
      console.log(`settled ${summarize(pr, snapshot, watchFile, history).replaceAll('\n', ' · ')}`)
      return
    }
    if (headAge > GIVE_UP_MS) {
      console.log(
        `gave up after ${GIVE_UP_MS / 60_000} minutes on ${pr.headSha.slice(0, 7)}, waiting on ${waitingOn.join(', ')}`,
      )
      process.exit(1)
    }
    await Bun.sleep(POLL_MS)
  }
}

// Comments after drive last answered the thread. drive's own reply carries the answer's timestamp, so it never counts.
function unanswered(thread: Thread, history: History) {
  const answeredAt = history.entries.findLast((entry) => 'thread' in entry && entry.thread === thread.id)?.at
  return thread.comments.filter((comment) => answeredAt === undefined || comment.at > answeredAt)
}

// People's PR comments since drive started watching, minus drive's own and the ones it answered.
function openIssueComments(snapshot: Snapshot, watchFile: WatchFile, history: History) {
  const answered = new Set(history.entries.flatMap((entry) => ('comment' in entry ? [entry.comment] : [])))
  return snapshot.issueComments.filter(
    (comment) =>
      !comment.isBot &&
      Date.parse(comment.at) >= Date.parse(watchFile.startedAt) &&
      !watchFile.posted.includes(comment.id) &&
      !answered.has(comment.id),
  )
}

async function respond(pr: Pr, ledgerPath: string) {
  const ledger = parseLedger(await Bun.file(ledgerPath).json())
  const branch = (await $`git branch --show-current`.quiet().text()).trim()
  if (branch !== pr.headRef) fail(`on branch ${branch}, not the PR branch ${pr.headRef}`)
  const sha = (await $`git rev-parse --short HEAD`.quiet().text()).trim()
  const [{ threads, issueComments }, history, watchFile] = await Promise.all([
    takeSnapshot(pr),
    readHistory(pr),
    readWatchFile(pr),
  ])
  const driveResolved = new Set([...history.resolved, ...watchFile.acknowledged])

  // Check the whole ledger before posting anything, so a bad entry never leaves it half posted.
  const posts = ledger.flatMap((entry): { answer: Answer; body: string | null; answers: Comment }[] => {
    const body =
      entry.verdict === 'rejected' ? (entry.reply ?? null) : `Fixed in ${sha}.${entry.reply ? ` ${entry.reply}` : ''}`
    if ('comment' in entry) {
      const comment = issueComments.find((candidate) => candidate.id === entry.comment)
      if (!comment) fail(`comment ${entry.comment} is not on PR #${pr.number}`)
      if (!body && comment.author !== pr.viewer)
        fail(`comment ${comment.id} is from ${comment.author}; rejecting it needs a reply`)
      const answer = {
        comment: comment.id,
        verdict: entry.verdict,
        where: `comment ${comment.id}`,
        title: firstLine(comment.body),
      }
      return [{ answer, body: body && `> ${firstLine(comment.body)}\n\n${body}`, answers: comment }]
    }
    const thread = threads.find((candidate) => candidate.id === entry.thread)
    if (!thread) fail(`thread ${entry.thread} is not on PR #${pr.number}`)
    const where = `${thread.path}:${thread.line ?? '?'}`
    if (thread.resolved && !driveResolved.has(thread.id)) {
      console.log(`skipped ${where}: resolved by ${thread.resolvedBy ?? 'unknown'}`)
      return []
    }
    const latest = unanswered(thread, history).at(-1)
    if (!latest) fail(`${where} has no comment after drive's last answer`)
    if (!body && latest.author !== pr.viewer) fail(`${where} ends with ${latest.author}; rejecting it needs a reply`)
    return [
      { answer: { thread: thread.id, verdict: entry.verdict, where, title: thread.title }, body, answers: latest },
    ]
  })

  for (const { answer, body, answers } of posts) {
    // No body: the user's own comment already settled it, so drive only records that it was handled.
    if (!body) {
      await record(pr, history, { ...answer, reply: null, at: answers.at })
      console.log(`settled ${answer.where} without a reply`)
      continue
    }
    if ('comment' in answer) {
      const posted = (await github(`repos/${pr.owner}/${pr.repo}/issues/${pr.number}/comments`, 'POST', {
        body,
      })) as { created_at: string }
      await record(pr, history, { ...answer, reply: body, at: posted.created_at })
      console.log(`${answer.verdict} ${answer.where}`)
      continue
    }
    const data = (await graphql(
      `mutation($id: ID!, $body: String!) { addPullRequestReviewThreadReply(input: {pullRequestReviewThreadId: $id, body: $body}) { comment { createdAt } } }`,
      { id: answer.thread, body },
    )) as { addPullRequestReviewThreadReply: { comment: { createdAt: string } } }
    // A rejection stays open until the reviewer agrees: Greptile's 👍 lets watch resolve it, a person resolves their own.
    if (answer.verdict !== 'rejected') {
      await resolveThread(answer.thread)
      history.resolved.push(answer.thread)
    }
    await record(pr, history, { ...answer, reply: body, at: data.addPullRequestReviewThreadReply.comment.createdAt })
    console.log(
      `${answer.verdict} ${answer.where}${answer.verdict === 'rejected' ? ', left open for the reviewer' : ', resolved'}`,
    )
  }
}

// Written after every post, so a failure partway through never leaves drive's own reply looking unanswered.
async function record(pr: Pr, history: History, entry: HistoryEntry) {
  history.entries.push(entry)
  await Bun.write(`${pr.runDir}/history.json`, JSON.stringify(history, null, 2))
}

type PrCommit = {
  oid: string
  additions: number
  deletions: number
  messageHeadline: string
  url: string
  parents: { totalCount: number }
}

async function report(pr: Pr, notes: string | null, dryRun: boolean) {
  const [snapshot, watchFile, history, commits] = await Promise.all([
    takeSnapshot(pr),
    readWatchFile(pr),
    readHistory(pr),
    fetchCommits(pr),
  ])
  // Files whose merge needed a hand resolution; a commit that is not local, like one from a deleted branch, shows none.
  const conflicts = new Map<string, string[]>()
  for (const commit of commits.commits.filter((commit) => commit.parents.totalCount > 1)) {
    const shown = await $`git show --remerge-diff --format= --name-only ${commit.oid}`.quiet().nothrow()
    conflicts.set(commit.oid, shown.exitCode === 0 ? shown.text().split('\n').filter(Boolean) : [])
  }
  const body = renderReport(
    { ...pr, headSha: snapshot.pr.headSha },
    snapshot,
    watchFile,
    history,
    commits,
    conflicts,
    notes,
  )
  if (dryRun) {
    console.log(body)
    return
  }
  // One report per PR: a later run edits it, unless someone deleted it.
  const edited =
    watchFile.reportComment === null
      ? null
      : await request(`repos/${pr.owner}/${pr.repo}/issues/comments/${watchFile.reportComment}`, 'PATCH', { body })
  if (edited && !edited.ok && edited.status !== 404) fail(`editing the report: ${edited.status} ${await edited.text()}`)
  const comment = (
    edited?.ok
      ? await edited.json()
      : await github(`repos/${pr.owner}/${pr.repo}/issues/${pr.number}/comments`, 'POST', { body })
  ) as { id: number; html_url: string }
  watchFile.reportComment = comment.id
  if (!watchFile.posted.includes(comment.id)) watchFile.posted.push(comment.id)
  await writeWatchFile(pr, watchFile)
  console.log(`report ${comment.html_url}`)
}

async function fetchCommits(pr: Pr) {
  const data = (await graphql(
    `query($owner: String!, $repo: String!, $number: Int!) {
      repository(owner: $owner, name: $repo) { pullRequest(number: $number) {
        additions deletions
        commits(last: 100) { nodes { commit { oid additions deletions messageHeadline url parents { totalCount } } } }
      } }
    }`,
    { owner: pr.owner, repo: pr.repo, number: pr.number },
  )) as {
    repository: {
      pullRequest: { additions: number; deletions: number; commits: { nodes: { commit: PrCommit }[] } }
    }
  }
  const { additions, deletions, commits } = data.repository.pullRequest
  return { additions, deletions, commits: commits.nodes.map((node) => node.commit) }
}

function renderReport(
  pr: Pr,
  snapshot: Snapshot,
  watchFile: WatchFile,
  history: History,
  pull: Awaited<ReturnType<typeof fetchCommits>>,
  conflicts: Map<string, string[]>,
  notes: string | null,
) {
  const heads = Object.keys(watchFile.headSeenAt)
  const startIndex = pull.commits.findIndex((commit) => commit.oid === heads[0])
  const loopCommits = startIndex === -1 ? [] : pull.commits.slice(startIndex + 1)
  const key = (entry: HistoryEntry) => ('thread' in entry ? entry.thread : entry.comment)
  // A thread answered more than once counts once, with its last answer.
  const answers = [...new Map(history.entries.map((entry) => [key(entry), entry])).values()]
  const threadOf = (entry: HistoryEntry) =>
    'thread' in entry ? snapshot.threads.find((thread) => thread.id === entry.thread) : undefined
  const finding = (entry: HistoryEntry) => {
    const url =
      threadOf(entry)?.url ??
      ('comment' in entry ? snapshot.issueComments.find((comment) => comment.id === entry.comment)?.url : undefined)
    return `${url ? `[${entry.title}](${url})` : entry.title} in \`${entry.where}\``
  }
  const fixed = answers.filter((entry) => entry.verdict !== 'rejected')

  // The calls the agent made on the author's behalf; a fix done as asked is not one.
  type Call = { severity: string | null; open: boolean; lines: string[] }
  const rejected: Call[] = []
  const differently: Call[] = []
  const afterPushback: Call[] = []
  for (const entry of answers) {
    const thread = threadOf(entry)
    const severity = thread?.severity ?? null
    const head = `- ${severity ? `${severity} ` : ''}${finding(entry)}.`
    if (entry.verdict === 'rejected') {
      const agreed = thread && (watchFile.acknowledged.includes(thread.id) || thread.resolvedBy?.endsWith('[bot]'))
      const outcome = !thread
        ? ''
        : agreed
          ? ' The reviewer agreed.'
          : thread.resolved
            ? ` Resolved by ${thread.resolvedBy ?? 'someone'}.`
            : ' **Still open.**'
      const quote = entry.reply === null ? "Rejected in the author's own comment." : reason(entry.reply)
      rejected.push({
        severity,
        open: thread !== undefined && !thread.resolved,
        lines: [head + outcome, `  > ${quote}`],
      })
      continue
    }
    const reversed = history.entries.some((other) => key(other) === key(entry) && other.verdict === 'rejected')
    if (entry.verdict === 'fixed' && !reversed) continue
    const note = entry.reply?.replace(/^Fixed in [0-9a-f]{7,40}\.\s*/, '') ?? ''
    ;(reversed ? afterPushback : differently).push({
      severity,
      open: false,
      lines: [head, ...(note ? [`  > ${reason(note)}`] : [])],
    })
  }
  const merges = loopCommits.flatMap((commit) => {
    const files = conflicts.get(commit.oid) ?? []
    return files.length
      ? [
          `- [\`${commit.oid.slice(0, 7)}\`](${commit.url}) merged \`${pr.baseRef}\` and resolved ${files.map((file) => `\`${file}\``).join(', ')} by hand.`,
        ]
      : []
  })
  const rank = (call: Call) => (call.open ? 0 : 10) + (call.severity ? Number(call.severity.slice(1)) : 9)
  const calls = rejected.length + differently.length + afterPushback.length + merges.length

  const failing = snapshot.checks.filter(isFailing)
  const pending = snapshot.checks.filter((check) => check.state === 'pending')
  const scores = snapshot.greptile
  const allSame = scores.length > 0 && scores.every((summary) => summary.onHead && summary.score === scores[0]!.score)
  const scored = !scores.length
    ? 'No reviewer has scored it yet'
    : allSame
      ? `${scores.length === 1 ? scores[0]!.bot : scores.length === 2 ? 'Both reviewers' : `All ${scores.length} reviewers`} score it ${scores[0]!.score ?? '?'}/5`
      : `Scores: ${scores.map((summary) => `${summary.bot} ${summary.score ?? '?'}/5${summary.onHead ? '' : ` on \`${summary.reviewedSha?.slice(0, 7) ?? 'an older commit'}\``}`).join(', ')}`
  const ci = failing.length
    ? `${failing.length} ${failing.length === 1 ? 'check fails' : 'checks fail'}`
    : pending.length
      ? `${pending.length} ${pending.length === 1 ? 'check is' : 'checks are'} still running`
      : 'CI passes'
  const conflict = snapshot.mergeable === 'CONFLICTING' ? ` It conflicts with \`${pr.baseRef}\`.` : ''
  const settled = Object.values(watchFile.rounds).map((round) => Date.parse(round.at))
  const minutes = settled.length ? Math.round((Math.max(...settled) - Date.parse(watchFile.startedAt)) / 60_000) : null
  const rounds = `${heads.length} review ${heads.length === 1 ? 'round' : 'rounds'}${minutes === null ? '' : ` (${minutes} min)`}`
  const asAsked = fixed.length - differently.length - afterPushback.length
  const byBot = new Map<string, string[]>()
  for (const head of heads)
    for (const score of watchFile.rounds[head]?.scores ?? []) {
      const [bot, value] = score.split(' ')
      byBot.set(bot!, [...(byBot.get(bot!) ?? []), value!])
    }
  const trend = [...byBot.values()].some((values) => values.length > 1)
    ? ` Scores by round: ${[...byBot].map(([bot, values]) => `${bot} ${values.join(' -> ')}`).join(', ')}.`
    : ''

  const lines = [
    `**Review loop ${status(snapshot, watchFile, history) === 'done' ? 'finished' : 'stopped'} on \`${pr.headSha.slice(0, 7)}\`.** ${scored} and ${ci}.${conflict}`,
    '',
    `Over ${rounds}, the agent fixed ${asAsked} ${asAsked === 1 ? 'finding' : 'findings'} as asked.${calls ? ` The ${calls === 1 ? 'call' : `${calls} calls`} below ${calls === 1 ? 'was' : 'were'} its own and may be worth a look.` : ''}${trend}`,
  ]
  const section = (title: string, items: string[]) => {
    if (items.length) lines.push('', `**${title}**`, '', ...items)
  }
  if (notes) lines.push('', '**Needs a decision**', '', notes)
  section('Not addressed', [
    ...openThreads(snapshot, history).map(
      (thread) =>
        `- ${thread.severity ? `${thread.severity} ` : ''}[${thread.title}](${thread.url}) in \`${thread.path}:${thread.line ?? '?'}\`.`,
    ),
    ...openIssueComments(snapshot, watchFile, history).map(
      (comment) => `- [A comment](${comment.url}) from ${comment.author}.`,
    ),
    ...failing.map((check) => `- [${check.name}](${check.url}) fails.`),
  ])
  const sorted = (group: Call[]) => group.toSorted((a, b) => rank(a) - rank(b)).flatMap((call) => call.lines)
  section('Rejected', sorted(rejected))
  section('Fixed differently than asked', sorted(differently))
  section('Fixed after the reviewer pushed back', sorted(afterPushback))
  section('Merge conflicts resolved by hand', merges)

  if (loopCommits.length) {
    const own = loopCommits.filter((commit) => commit.parents.totalCount === 1)
    const count = (n: number) => n.toLocaleString('en-US')
    const added = own.reduce((sum, commit) => sum + commit.additions, 0)
    const deleted = own.reduce((sum, commit) => sum + commit.deletions, 0)
    const fixedIn = (commit: PrCommit) =>
      fixed
        .filter((entry) => {
          const sha = entry.reply?.match(/^Fixed in ([0-9a-f]{7,40})\./)?.[1]
          return sha !== undefined && commit.oid.startsWith(sha)
        })
        .map((entry) => {
          const url = threadOf(entry)?.url
          return url ? `[${entry.title}](${url})` : entry.title
        })
        .join('<br>')
    lines.push(
      '',
      `<details><summary>${loopCommits.length} ${loopCommits.length === 1 ? 'commit' : 'commits'} during review: +${count(added)} −${count(deleted)} (the whole PR is +${count(pull.additions)} −${count(pull.deletions)})</summary>`,
      '',
      '| Commit | Lines | Change | Fixed findings |',
      '|---|---|---|---|',
      ...loopCommits.map((commit) => {
        const size =
          commit.parents.totalCount > 1 ? `merged \`${pr.baseRef}\`` : `+${commit.additions} −${commit.deletions}`
        const cells = [`[\`${commit.oid.slice(0, 7)}\`](${commit.url})`, size, commit.messageHeadline, fixedIn(commit)]
        return `| ${cells.map((cell) => cell.replaceAll('|', '\\|')).join(' | ')} |`
      }),
      '',
      '</details>',
    )
  }

  lines.push(
    '',
    `<sub>Posted from ${pr.viewer}'s account by drive, the agent loop that answered review on this PR.</sub>`,
  )
  return lines.join('\n')
}

// An answer as one quotable line: whole sentences up to about 300 characters, without the "Not fixing." lead-in the
// section title already says. An odd backtick count would leave the rest of the line as code.
function reason(text: string) {
  const flat = text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^Not (?:fixing|changing|adding this|applicable)[.:,]\s*/i, '')
  const sentences = flat.split(/(?<=[.!?])\s+(?=[A-Z`(])/)
  let cut = sentences[0]!
  for (const sentence of sentences.slice(1)) {
    if (cut.length + sentence.length + 1 > 300) break
    cut += ` ${sentence}`
  }
  if (cut.length > 320) cut = `${cut.slice(0, 300).replace(/\s+\S*$/, '')}…`
  else if (cut.length < flat.length) cut += ' …'
  cut = cut.charAt(0).toUpperCase() + cut.slice(1)
  return (cut.match(/`/g)?.length ?? 0) % 2 ? `${cut}\`` : cut
}

type LedgerEntry = Target & { verdict: Verdict; reply?: string }

function parseLedger(raw: unknown): LedgerEntry[] {
  if (!Array.isArray(raw)) fail('ledger must be a JSON array')
  return raw.map((entry: unknown, index) => {
    if (typeof entry !== 'object' || entry === null) fail(`ledger[${index}] is not an object`)
    const { thread, comment, verdict, reply } = entry as Record<string, unknown>
    if (verdict !== 'fixed' && verdict !== 'fixed-differently' && verdict !== 'rejected')
      fail(`ledger[${index}].verdict must be "fixed", "fixed-differently", or "rejected"`)
    if (verdict === 'fixed-differently' && !reply) fail(`ledger[${index}] is fixed-differently, so it needs a reply`)
    if (reply !== undefined && typeof reply !== 'string') fail(`ledger[${index}].reply must be a string`)
    if (typeof thread === 'string') return { thread, verdict, reply }
    if (typeof comment === 'number') return { comment, verdict, reply }
    fail(`ledger[${index}] needs a thread id or a comment id`)
  })
}

async function takeSnapshot(pr: Pr): Promise<Snapshot> {
  const raw = await fetchPr(pr)
  const { runDir: _, viewer: __, ...prFields } = pr
  const issueComments = raw.comments.map((comment) => ({
    id: comment.databaseId,
    author: comment.author?.login ?? 'ghost',
    isBot: comment.author?.__typename === 'Bot',
    body: comment.body,
    at: comment.createdAt,
    url: comment.url,
  }))
  return {
    pr: { ...prFields, headSha: raw.headRefOid },
    mergeable: raw.mergeable,
    closed: raw.closed,
    greptile: issueComments.flatMap((comment) => parseSummary(raw.headRefOid, comment)),
    threads: raw.threads.flatMap(parseThread),
    issueComments,
    checks: parseChecks(raw.contexts),
  }
}

function isGreptile(check: Check) {
  return check.app.startsWith('greptile')
}

// Greptile's own checks mirror its score, which the loop reads from the summary instead.
function isFailing(check: Check) {
  return check.state === 'fail' && !isGreptile(check)
}

function openThreads(snapshot: Snapshot, history: History) {
  return snapshot.threads.filter((thread) => !thread.resolved && unanswered(thread, history).length > 0)
}

function status(snapshot: Snapshot, watchFile: WatchFile, history: History): 'done' | 'open' {
  const done =
    snapshot.mergeable !== 'CONFLICTING' &&
    snapshot.greptile.length > 0 &&
    snapshot.greptile.every((summary) => summary.onHead && summary.score === 5) &&
    openThreads(snapshot, history).length === 0 &&
    openIssueComments(snapshot, watchFile, history).length === 0 &&
    !snapshot.checks.some(isFailing)
  return done ? 'done' : 'open'
}

async function writeState(pr: Pr, snapshot: Snapshot, watchFile: WatchFile, history: History) {
  const open = openThreads(snapshot, history)
  const state = {
    pr: snapshot.pr,
    viewer: pr.viewer,
    status: status(snapshot, watchFile, history),
    mergeable: snapshot.mergeable,
    greptile: snapshot.greptile,
    openThreads: open.map((thread) => ({ ...thread, unanswered: unanswered(thread, history).length })),
    openComments: openIssueComments(snapshot, watchFile, history),
    awaitingReviewer: snapshot.threads
      .filter((thread) => !thread.resolved && !open.includes(thread))
      .map(({ id, path, line, reviewer, title }) => ({ id, path, line, reviewer, title })),
    failing: snapshot.checks.filter(isFailing).map((check) => ({ ...check, ...watchFile.failures[failureKey(check)] })),
    pending: snapshot.checks.filter((check) => check.state === 'pending').map((check) => check.name),
    history: history.entries,
  }
  await Bun.write(`${pr.runDir}/state.json`, JSON.stringify(state, null, 2))
}

function summarize(pr: Pr, snapshot: Snapshot, watchFile: WatchFile, history: History) {
  const scores = snapshot.greptile.length
    ? snapshot.greptile
        .map(
          (summary) =>
            `${summary.bot} ${summary.score ?? '?'}/5 ${summary.onHead ? 'on head' : `on ${summary.reviewedSha?.slice(0, 7) ?? 'unknown commit'}`}`,
        )
        .join(', ')
    : 'no Greptile summary'
  const open = openThreads(snapshot, history).length + openIssueComments(snapshot, watchFile, history).length
  const awaiting = snapshot.threads.filter((thread) => !thread.resolved).length - openThreads(snapshot, history).length
  const failing = snapshot.checks.filter(isFailing).map((check) => check.name)
  return [
    `PR #${pr.number} ${pr.headSha.slice(0, 7)} ${status(snapshot, watchFile, history)}${snapshot.mergeable === 'CONFLICTING' ? `, conflicts with ${pr.baseRef}` : ''}`,
    `greptile: ${scores}`,
    `open: ${open}, awaiting reviewer: ${awaiting}`,
    `checks: ${failing.length ? `failing ${failing.join(', ')}` : 'none failing'}`,
    `state: ${pr.runDir}/state.json`,
  ].join('\n')
}

async function loadPr(number: string | undefined): Promise<Pr> {
  const view = (await $`gh pr view ${number ?? []} --json number,url,headRefName,headRefOid,baseRefName`
    .quiet()
    .json()) as {
    number: number
    url: string
    headRefName: string
    headRefOid: string
    baseRefName: string
  }
  const [, owner, repo] = new URL(view.url).pathname.split('/')
  if (!owner || !repo) fail(`cannot read owner/repo from ${view.url}`)
  const gitDir = (await $`git rev-parse --absolute-git-dir`.quiet().text()).trim()
  const runDir = `${gitDir}/drive/${view.number}`
  await mkdir(`${runDir}/logs`, { recursive: true })
  return {
    number: view.number,
    owner,
    repo,
    headSha: view.headRefOid,
    headRef: view.headRefName,
    baseRef: view.baseRefName,
    viewer: ((await github('user')) as { login: string }).login,
    runDir,
  }
}

type Page<T> = { pageInfo: { hasNextPage: boolean; endCursor: string }; nodes: T[] }
type RawAuthor = { login: string; __typename: string } | null
type RawIssueComment = { databaseId: number; author: RawAuthor; body: string; createdAt: string; url: string }
type RawThread = {
  id: string
  isResolved: boolean
  isOutdated: boolean
  path: string
  line: number | null
  originalLine: number | null
  resolvedBy: { login: string } | null
  comments: { nodes: { databaseId: number; author: RawAuthor; body: string; createdAt: string; url: string }[] }
  last: { nodes: { reactions: { nodes: { content: string; user: { login: string } | null }[] } }[] }
}
type RawContext =
  | {
      __typename: 'CheckRun'
      databaseId: number
      name: string
      status: string
      conclusion: string | null
      url: string
      startedAt: string | null
      checkSuite: { app: { slug: string } | null }
    }
  | { __typename: 'StatusContext'; context: string; state: string; targetUrl: string | null }
type RawPr = {
  headRefOid: string
  mergeable: Snapshot['mergeable']
  closed: boolean
  comments?: Page<RawIssueComment>
  reviewThreads?: Page<RawThread>
  commits?: { nodes: { commit: { statusCheckRollup: { contexts: Page<RawContext> } | null } }[] }
}

async function fetchPr(pr: Pr) {
  // Everything a poll reads, in one query. Later rounds fetch only the connections that have another page.
  // GitHub charges per thread the nested connections could return; 40 threads a page keeps the query at 1 point.
  const query = `query($owner: String!, $repo: String!, $number: Int!,
      $comments: String, $threads: String, $checks: String,
      $withComments: Boolean!, $withThreads: Boolean!, $withChecks: Boolean!) {
    repository(owner: $owner, name: $repo) { pullRequest(number: $number) {
      headRefOid
      mergeable
      closed
      comments(first: 100, after: $comments) @include(if: $withComments) {
        pageInfo { hasNextPage endCursor }
        nodes { databaseId author { login __typename } body createdAt url }
      }
      reviewThreads(first: 40, after: $threads) @include(if: $withThreads) {
        pageInfo { hasNextPage endCursor }
        nodes { id isResolved isOutdated path line originalLine resolvedBy { login }
          comments(first: 50) { nodes { databaseId author { login __typename } body createdAt url } }
          last: comments(last: 1) { nodes { reactions(first: 30) { nodes { content user { login } } } } } }
      }
      commits(last: 1) @include(if: $withChecks) { nodes { commit { statusCheckRollup {
        contexts(first: 100, after: $checks) {
          pageInfo { hasNextPage endCursor }
          nodes {
            __typename
            ... on CheckRun { databaseId name status conclusion url startedAt checkSuite { app { slug } } }
            ... on StatusContext { context state targetUrl }
          }
        }
      } } } }
    } }
  }`
  const comments: RawIssueComment[] = []
  const threads: RawThread[] = []
  const contexts: RawContext[] = []
  // Each connection's next cursor; null before its first page, removed after its last.
  const cursors = new Map<'comments' | 'threads' | 'checks', string | null>([
    ['comments', null],
    ['threads', null],
    ['checks', null],
  ])
  let head: Pick<RawPr, 'headRefOid' | 'mergeable' | 'closed'> | undefined
  while (cursors.size > 0) {
    const data = (
      (await graphql(query, {
        owner: pr.owner,
        repo: pr.repo,
        number: pr.number,
        comments: cursors.get('comments') ?? null,
        threads: cursors.get('threads') ?? null,
        checks: cursors.get('checks') ?? null,
        withComments: cursors.has('comments'),
        withThreads: cursors.has('threads'),
        withChecks: cursors.has('checks'),
      })) as { repository: { pullRequest: RawPr } }
    ).repository.pullRequest
    head ??= data
    const pages = {
      comments: data.comments,
      threads: data.reviewThreads,
      checks: data.commits?.nodes[0]?.commit.statusCheckRollup?.contexts,
    }
    comments.push(...(pages.comments?.nodes ?? []))
    threads.push(...(pages.threads?.nodes ?? []))
    contexts.push(...(pages.checks?.nodes ?? []))
    for (const name of [...cursors.keys()]) {
      const page = pages[name]
      if (page?.pageInfo.hasNextPage) cursors.set(name, page.pageInfo.endCursor)
      else cursors.delete(name)
    }
  }
  return { ...head!, comments, threads, contexts }
}

function parseSummary(headSha: string, comment: IssueComment): Summary[] {
  if (!comment.body.startsWith('<!-- greptile_summary -->')) return []
  // worker-v2 summaries carry no score marker, only the heading.
  const score =
    comment.body.match(/<!-- greptile_confidence_score:([0-5]) -->/)?.[1] ??
    comment.body.match(/(?:<h[23]>|^#{2,3} )[^\n]*?confidence score:?\s*([0-5])\/5/im)?.[1]
  const reviewedSha = comment.body.match(/last reviewed commit[^\n]*?\/commit\/([0-9a-f]{7,40})/i)?.[1] ?? null
  const reviews = comment.body.match(/Reviews \((\d+)\)/)?.[1]
  return [
    {
      bot: comment.author.replace(/\[bot\]$/, ''),
      score: score === undefined ? null : Number(score),
      reviewedSha,
      onHead: reviewedSha !== null && headSha.startsWith(reviewedSha),
      reviews: reviews === undefined ? null : Number(reviews),
      url: comment.url,
      text: comment.body
        .replace(/<h2>[\s\S]*?<\/h2>/g, '')
        .replace(/<details>[\s\S]*?<\/details>/g, '')
        .replace(/<sub>[\s\S]*?<\/sub>/g, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .trim(),
    },
  ]
}

function parseThread(thread: RawThread): Thread[] {
  const comments = thread.comments.nodes.map((comment) => ({
    id: comment.databaseId,
    author: comment.author?.login ?? 'ghost',
    isBot: comment.author?.__typename === 'Bot',
    body: cleanComment(comment.body),
    at: comment.createdAt,
  }))
  const [first] = comments
  if (!first) return []
  return [
    {
      id: thread.id,
      resolved: thread.isResolved,
      resolvedBy: thread.resolvedBy?.login ?? null,
      path: thread.path,
      line: thread.line ?? thread.originalLine,
      outdated: thread.isOutdated,
      reviewer: first.author,
      reviewerIsBot: first.isBot,
      severity: thread.comments.nodes[0]?.body.match(/<img alt="(P\d)"/)?.[1] ?? null,
      title: first.body.match(/\*\*(.+?)\*\*/)?.[1] ?? firstLine(first.body),
      url: thread.comments.nodes[0]!.url,
      comments,
      // GraphQL reports an app's reaction as a User whose login ends in [bot].
      botReactions: (thread.last.nodes[0]?.reactions.nodes ?? [])
        .filter((reaction) => reaction.user?.login.endsWith('[bot]'))
        .map((reaction) => reaction.content),
    },
  ]
}

// Greptile wraps each finding in a severity badge, a "Prompt To Fix With AI" copy, and IDE deep links.
function cleanComment(body: string) {
  return body
    .replace(/<a href="#"><img alt="P\d"[^>]*><\/a>/g, '')
    .replace(/<details><summary>Prompt To Fix With AI<\/summary>[\s\S]*?<\/details>/g, '')
    .replace(/<a [^>]*>\s*<picture>[\s\S]*?<\/picture>\s*<\/a>/g, '')
    .trim()
}

function firstLine(body: string) {
  return body.trim().split('\n')[0]!.slice(0, 80)
}

// Greptile answers a reply in its thread with a reply comment, a 👍 when it accepts, or nothing; it shows 👀 meanwhile.
function botReaction(thread: Thread): '+1' | 'eyes' | null {
  if (thread.botReactions.includes('THUMBS_UP')) return '+1'
  return thread.botReactions.includes('EYES') ? 'eyes' : null
}

async function resolveThread(id: string) {
  await graphql(`mutation($id: ID!) { resolveReviewThread(input: {threadId: $id}) { thread { id } } }`, { id })
}

// REST's check-run shape. Head check runs come from GraphQL and are mapped into it, so they share
// latestRuns and checkRunState with the base-branch lookup, which uses REST.
type RawCheckRun = {
  id: number
  name: string
  status: string
  conclusion: string | null
  html_url: string
  started_at: string | null
  app: { slug: string } | null
}

function parseChecks(contexts: RawContext[]): Check[] {
  const runs = contexts.flatMap((context): RawCheckRun[] =>
    context.__typename === 'CheckRun'
      ? [
          {
            id: context.databaseId,
            name: context.name,
            status: context.status.toLowerCase(),
            conclusion: context.conclusion?.toLowerCase() ?? null,
            html_url: context.url,
            started_at: context.startedAt,
            app: context.checkSuite.app,
          },
        ]
      : [],
  )
  // EXPECTED is a required status nobody has posted yet; REST's commit status omits it too.
  const statuses = contexts.flatMap((context) =>
    context.__typename === 'StatusContext' && context.state !== 'EXPECTED' ? [context] : [],
  )
  return [
    ...latestRuns(runs).map((run) => ({
      id: run.id,
      name: run.name,
      app: run.app?.slug ?? 'unknown',
      state: checkRunState(run),
      url: run.html_url,
    })),
    ...statuses.map((status) => ({
      id: null,
      name: status.context,
      app: 'status',
      state: commitStatusState(status.state.toLowerCase()),
      url: status.targetUrl ?? '',
    })),
  ].filter((check) => !IGNORED_CHECKS.has(check.name))
}

// Re-runs and repeated workflow events leave several runs per check; only the latest counts.
function latestRuns(runs: RawCheckRun[]) {
  const latest = new Map<string, RawCheckRun>()
  for (const run of runs) {
    const key = `${run.app?.slug}/${run.name}`
    const seen = latest.get(key)
    if (!seen || (run.started_at ?? '') > (seen.started_at ?? '')) latest.set(key, run)
  }
  return [...latest.values()]
}

function checkRunState(run: RawCheckRun): CheckState {
  if (run.status !== 'completed') return 'pending'
  switch (run.conclusion) {
    case 'success':
    case 'neutral':
      return 'pass'
    // A cancelled run was superseded by a newer one or stopped by hand; neither is a failure to fix.
    case 'skipped':
    case 'cancelled':
      return 'skip'
    default:
      return 'fail'
  }
}

function commitStatusState(state: string): CheckState {
  if (state === 'pending') return 'pending'
  return state === 'success' ? 'pass' : 'fail'
}

function failureKey(check: Check) {
  return check.id === null ? `status/${check.name}` : String(check.id)
}

async function describeFailure(pr: Pr, check: Check): Promise<Failure> {
  const onBase = await fetchBaseConclusion(pr, check)
  if (check.app !== 'github-actions' || check.id === null) return { onBase, annotations: [], log: null, errorLines: [] }

  const [annotations, logs] = await Promise.all([
    github(`repos/${pr.owner}/${pr.repo}/check-runs/${check.id}/annotations`) as Promise<
      { path: string; start_line: number; annotation_level: string; message: string }[]
    >,
    // Actions check-run ids are job ids.
    request(`repos/${pr.owner}/${pr.repo}/actions/jobs/${check.id}/logs`),
  ])
  const logText = logs.ok ? await logs.text() : ''
  const log = `${pr.runDir}/logs/${check.id}.log`
  await Bun.write(log, logText)
  return {
    onBase,
    annotations: annotations
      .filter((annotation) => annotation.annotation_level === 'failure')
      .map((annotation) => `${annotation.path}:${annotation.start_line} ${annotation.message}`),
    log,
    errorLines: logText
      .split('\n')
      .flatMap((line, index) => (line.includes('##[error]') ? [index + 1] : []))
      .slice(0, 20),
  }
}

// The same check's latest conclusion on the base branch tip, to tell PR breakage from breakage already on base.
async function fetchBaseConclusion(pr: Pr, check: Check): Promise<string | null> {
  if (check.app === 'status') {
    const status = (await github(`repos/${pr.owner}/${pr.repo}/commits/${pr.baseRef}/status`)) as {
      statuses: { context: string; state: string }[]
    }
    return status.statuses.find((commitStatus) => commitStatus.context === check.name)?.state ?? null
  }
  const runs = (await github(
    `repos/${pr.owner}/${pr.repo}/commits/${pr.baseRef}/check-runs?check_name=${encodeURIComponent(check.name)}`,
  )) as { check_runs: RawCheckRun[] }
  const [latest] = latestRuns(runs.check_runs.filter((run) => run.app?.slug === check.app))
  return latest ? (latest.conclusion ?? latest.status) : null
}

async function readHistory(pr: Pr): Promise<History> {
  const file = Bun.file(`${pr.runDir}/history.json`)
  return (await file.exists()) ? ((await file.json()) as History) : { entries: [], resolved: [] }
}

async function readWatchFile(pr: Pr): Promise<WatchFile> {
  const file = Bun.file(`${pr.runDir}/watch.json`)
  const empty: WatchFile = {
    startedAt: new Date().toISOString(),
    seen: {},
    open: [],
    checks: [],
    acknowledged: [],
    posted: [],
    reviewRequested: [],
    conflicts: [],
    headSeenAt: {},
    rounds: {},
    reportComment: null,
    failures: {},
  }
  // Files from an older drive.ts lack newer fields.
  return (await file.exists()) ? { ...empty, ...((await file.json()) as Partial<WatchFile>) } : empty
}

async function writeWatchFile(pr: Pr, watchFile: WatchFile) {
  await Bun.write(`${pr.runDir}/watch.json`, JSON.stringify(watchFile, null, 2))
}

function request(path: string, method = 'GET', body?: unknown) {
  return fetch(`https://api.github.com/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

async function github(path: string, method = 'GET', body?: unknown): Promise<unknown> {
  const response = await request(path, method, body)
  if (!response.ok) fail(`${method} ${path}: ${response.status} ${await response.text()}`)
  return response.json()
}

async function graphql(query: string, variables: Record<string, string | number | boolean | null>) {
  const { data, errors } = (await github('graphql', 'POST', { query, variables })) as {
    data: unknown
    errors?: { message: string }[]
  }
  if (errors?.length) fail(`GraphQL: ${errors.map((error) => error.message).join('; ')}`)
  return data
}

function fail(message: string): never {
  console.error(`drive: ${message}`)
  process.exit(1)
}
