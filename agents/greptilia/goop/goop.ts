#!/usr/bin/env bun
// GitHub side of the goop loop.
//   bun goop.ts watch [pr]             print one line per new event until the round on the PR head settles
//   bun goop.ts state [pr]             snapshot the PR into state.json and print a summary
//   bun goop.ts respond <ledger> [pr]  post a fixer ledger: reply to each item, resolve the fixed threads
// [pr] defaults to the current branch's PR. Run files live in $(git rev-parse --git-dir)/goop/<pr>/:
// state.json (latest snapshot), watch.json (written only by watch), history.json (written only by respond), logs/.
//
// goop posts as the user's own GitHub account, so authorship cannot tell the user's comments from goop's.
// history.json records when goop answered each item; any later comment that goop did not post needs an answer.
import { $ } from 'bun'
import { mkdir } from 'node:fs/promises'

// About 6 GitHub calls per poll; 20s keeps one watch near 1,100 calls/hour against the 5,000/hour limit.
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
  comments: Comment[]
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
  greptile: Summary[]
  threads: Thread[]
  issueComments: IssueComment[]
  checks: Check[]
}

type Target = { thread: string } | { comment: number }
type Answer = Target & { verdict: 'fixed' | 'rejected'; where: string; title: string }
// `at` is GitHub's timestamp for goop's reply, or for the comment it settled without replying.
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
  headSeenAt: Record<string, string>
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
    if (!args[0]) fail('usage: goop.ts respond <ledger.json> [pr]')
    await respond(await loadPr(args[1]), args[0])
    break
  default:
    fail('usage: goop.ts watch|state [pr] | respond <ledger.json> [pr]')
}

async function watch(initial: Pr) {
  let checksDoneAt: number | null = null
  for (;;) {
    const pr = { ...initial, headSha: await fetchHeadSha(initial) }
    const [snapshot, watchFile, history] = await Promise.all([takeSnapshot(pr), readWatchFile(pr), readHistory(pr)])
    const goopResolved = new Set([...history.resolved, ...watchFile.acknowledged])
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

    const inFlight: string[] = []
    const open: string[] = []
    for (const thread of snapshot.threads) {
      const where = `${thread.path}:${thread.line ?? '?'}`
      const last = thread.comments.at(-1)!
      if (thread.resolved) {
        if (watchFile.open.includes(thread.id) && !goopResolved.has(thread.id)) {
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
      const reaction = await botReaction(pr, last)
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
      const id = Number(
        await $`gh api ${`repos/${pr.owner}/${pr.repo}/issues/${pr.number}/comments`} -f ${'body=@greptileai review'} -q .id`
          .quiet()
          .text(),
      )
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
    const waitingOn = [...pendingChecks, ...summariesBehind, ...inFlight]

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

// Comments after goop last answered the thread. goop's own reply carries the answer's timestamp, so it never counts.
function unanswered(thread: Thread, history: History) {
  const answeredAt = history.entries.findLast((entry) => 'thread' in entry && entry.thread === thread.id)?.at
  return thread.comments.filter((comment) => answeredAt === undefined || comment.at > answeredAt)
}

// People's PR comments since goop started watching, minus goop's own and the ones it answered.
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
  const [threads, issueComments, history, watchFile] = await Promise.all([
    fetchThreads(pr),
    fetchIssueComments(pr),
    readHistory(pr),
    readWatchFile(pr),
  ])
  const goopResolved = new Set([...history.resolved, ...watchFile.acknowledged])

  // Check the whole ledger before posting anything, so a bad entry never leaves it half posted.
  const posts = ledger.flatMap((entry): { answer: Answer; body: string | null; answers: Comment }[] => {
    const body =
      entry.verdict === 'fixed' ? `Fixed in ${sha}.${entry.reply ? ` ${entry.reply}` : ''}` : (entry.reply ?? null)
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
    if (thread.resolved && !goopResolved.has(thread.id)) {
      console.log(`skipped ${where}: resolved by ${thread.resolvedBy ?? 'unknown'}`)
      return []
    }
    const latest = unanswered(thread, history).at(-1)
    if (!latest) fail(`${where} has no comment after goop's last answer`)
    if (!body && latest.author !== pr.viewer) fail(`${where} ends with ${latest.author}; rejecting it needs a reply`)
    return [
      { answer: { thread: thread.id, verdict: entry.verdict, where, title: thread.title }, body, answers: latest },
    ]
  })

  for (const { answer, body, answers } of posts) {
    // No body: the user's own comment already settled it, so goop only records that it was handled.
    if (!body) {
      await record(pr, history, { ...answer, reply: null, at: answers.at })
      console.log(`settled ${answer.where} without a reply`)
      continue
    }
    if ('comment' in answer) {
      const posted =
        (await $`gh api ${`repos/${pr.owner}/${pr.repo}/issues/${pr.number}/comments`} -f ${`body=${body}`}`
          .quiet()
          .json()) as { created_at: string }
      await record(pr, history, { ...answer, reply: body, at: posted.created_at })
      console.log(`${answer.verdict} ${answer.where}`)
      continue
    }
    const data = (await graphql(
      `mutation($id: ID!, $body: String!) { addPullRequestReviewThreadReply(input: {pullRequestReviewThreadId: $id, body: $body}) { comment { createdAt } } }`,
      { id: answer.thread, body },
    )) as { addPullRequestReviewThreadReply: { comment: { createdAt: string } } }
    // A rejection stays open until the reviewer agrees: Greptile's 👍 lets watch resolve it, a person resolves their own.
    if (answer.verdict === 'fixed') {
      await resolveThread(answer.thread)
      history.resolved.push(answer.thread)
    }
    await record(pr, history, { ...answer, reply: body, at: data.addPullRequestReviewThreadReply.comment.createdAt })
    console.log(
      `${answer.verdict} ${answer.where}${answer.verdict === 'fixed' ? ', resolved' : ', left open for the reviewer'}`,
    )
  }
}

// Written after every post, so a failure partway through never leaves goop's own reply looking unanswered.
async function record(pr: Pr, history: History, entry: HistoryEntry) {
  history.entries.push(entry)
  await Bun.write(`${pr.runDir}/history.json`, JSON.stringify(history, null, 2))
}

type LedgerEntry = Target & { verdict: 'fixed' | 'rejected'; reply?: string }

function parseLedger(raw: unknown): LedgerEntry[] {
  if (!Array.isArray(raw)) fail('ledger must be a JSON array')
  return raw.map((entry: unknown, index) => {
    if (typeof entry !== 'object' || entry === null) fail(`ledger[${index}] is not an object`)
    const { thread, comment, verdict, reply } = entry as Record<string, unknown>
    if (verdict !== 'fixed' && verdict !== 'rejected') fail(`ledger[${index}].verdict must be "fixed" or "rejected"`)
    if (reply !== undefined && typeof reply !== 'string') fail(`ledger[${index}].reply must be a string`)
    if (typeof thread === 'string') return { thread, verdict, reply }
    if (typeof comment === 'number') return { comment, verdict, reply }
    fail(`ledger[${index}] needs a thread id or a comment id`)
  })
}

async function takeSnapshot(pr: Pr): Promise<Snapshot> {
  const [issueComments, threads, checks] = await Promise.all([
    fetchIssueComments(pr),
    fetchThreads(pr),
    fetchChecks(pr),
  ])
  const { runDir: _, viewer: __, ...prFields } = pr
  return {
    pr: prFields,
    greptile: issueComments.flatMap((comment) => parseSummary(pr, comment)),
    threads,
    issueComments,
    checks,
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
    `PR #${pr.number} ${pr.headSha.slice(0, 7)} ${status(snapshot, watchFile, history)}`,
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
  const runDir = `${gitDir}/goop/${view.number}`
  await mkdir(`${runDir}/logs`, { recursive: true })
  return {
    number: view.number,
    owner,
    repo,
    headSha: view.headRefOid,
    headRef: view.headRefName,
    baseRef: view.baseRefName,
    viewer: (await $`gh api user -q .login`.quiet().text()).trim(),
    runDir,
  }
}

async function fetchHeadSha(pr: Pr) {
  return (
    await $`gh pr view ${pr.number} --repo ${`${pr.owner}/${pr.repo}`} --json headRefOid -q .headRefOid`.quiet().text()
  ).trim()
}

async function fetchIssueComments(pr: Pr): Promise<IssueComment[]> {
  const pages =
    (await $`gh api ${`repos/${pr.owner}/${pr.repo}/issues/${pr.number}/comments?per_page=100`} --paginate --slurp`
      .quiet()
      .json()) as {
      id: number
      body: string
      html_url: string
      created_at: string
      user: { login: string; type: string }
    }[][]
  return pages.flat().map((comment) => ({
    id: comment.id,
    author: comment.user.login,
    isBot: comment.user.type === 'Bot',
    body: comment.body,
    at: comment.created_at,
    url: comment.html_url,
  }))
}

function parseSummary(pr: Pr, comment: IssueComment): Summary[] {
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
      onHead: reviewedSha !== null && pr.headSha.startsWith(reviewedSha),
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

type RawThread = {
  id: string
  isResolved: boolean
  isOutdated: boolean
  path: string
  line: number | null
  originalLine: number | null
  resolvedBy: { login: string } | null
  comments: {
    nodes: {
      databaseId: number
      author: { login: string; __typename: string } | null
      body: string
      createdAt: string
    }[]
  }
}

async function fetchThreads(pr: Pr): Promise<Thread[]> {
  const raw: RawThread[] = []
  let cursor: string | null = null
  do {
    const data = (await graphql(
      `query($owner: String!, $repo: String!, $number: Int!, $cursor: String) {
        repository(owner: $owner, name: $repo) { pullRequest(number: $number) {
          reviewThreads(first: 100, after: $cursor) {
            pageInfo { hasNextPage endCursor }
            nodes { id isResolved isOutdated path line originalLine resolvedBy { login }
              comments(first: 50) { nodes { databaseId author { login __typename } body createdAt } } }
          }
        } }
      }`,
      { owner: pr.owner, repo: pr.repo, number: pr.number, cursor },
    )) as {
      repository: {
        pullRequest: { reviewThreads: { pageInfo: { hasNextPage: boolean; endCursor: string }; nodes: RawThread[] } }
      }
    }
    const page = data.repository.pullRequest.reviewThreads
    raw.push(...page.nodes)
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null
  } while (cursor)

  return raw.flatMap((thread) => {
    const comments = thread.comments.nodes.map((comment) => ({
      id: comment.databaseId,
      author: comment.author?.login ?? 'ghost',
      isBot: comment.author?.__typename === 'Bot',
      body: cleanComment(comment.body),
      at: comment.createdAt,
    }))
    const [first] = comments
    if (!first) return []
    return {
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
      comments,
    }
  })
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
async function botReaction(pr: Pr, comment: Comment): Promise<'+1' | 'eyes' | null> {
  const reactions = (await $`gh api ${`repos/${pr.owner}/${pr.repo}/pulls/comments/${comment.id}/reactions`}`
    .quiet()
    .json()) as {
    content: string
    user: { type: string }
  }[]
  const contents = reactions.filter((reaction) => reaction.user.type === 'Bot').map((reaction) => reaction.content)
  if (contents.includes('+1')) return '+1'
  return contents.includes('eyes') ? 'eyes' : null
}

async function resolveThread(id: string) {
  await graphql(`mutation($id: ID!) { resolveReviewThread(input: {threadId: $id}) { thread { id } } }`, { id })
}

type RawCheckRun = {
  id: number
  name: string
  status: string
  conclusion: string | null
  html_url: string
  started_at: string | null
  app: { slug: string } | null
}

async function fetchChecks(pr: Pr): Promise<Check[]> {
  const [pages, status] = await Promise.all([
    $`gh api ${`repos/${pr.owner}/${pr.repo}/commits/${pr.headSha}/check-runs?per_page=100`} --paginate --slurp`
      .quiet()
      .json() as Promise<{ check_runs: RawCheckRun[] }[]>,
    $`gh api ${`repos/${pr.owner}/${pr.repo}/commits/${pr.headSha}/status`}`.quiet().json() as Promise<{
      statuses: { context: string; state: string; target_url: string | null }[]
    }>,
  ])
  return [
    ...latestRuns(pages.flatMap((page) => page.check_runs)).map((run) => ({
      id: run.id,
      name: run.name,
      app: run.app?.slug ?? 'unknown',
      state: checkRunState(run),
      url: run.html_url,
    })),
    ...status.statuses.map((commitStatus) => ({
      id: null,
      name: commitStatus.context,
      app: 'status',
      state: commitStatusState(commitStatus.state),
      url: commitStatus.target_url ?? '',
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

  const [annotations, logText] = await Promise.all([
    $`gh api ${`repos/${pr.owner}/${pr.repo}/check-runs/${check.id}/annotations`}`.quiet().json() as Promise<
      { path: string; start_line: number; annotation_level: string; message: string }[]
    >,
    // Actions check-run ids are job ids.
    $`gh api ${`repos/${pr.owner}/${pr.repo}/actions/jobs/${check.id}/logs`}`.quiet().nothrow().text(),
  ])
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
    const status = (await $`gh api ${`repos/${pr.owner}/${pr.repo}/commits/${pr.baseRef}/status`}`.quiet().json()) as {
      statuses: { context: string; state: string }[]
    }
    return status.statuses.find((commitStatus) => commitStatus.context === check.name)?.state ?? null
  }
  const runs =
    (await $`gh api ${`repos/${pr.owner}/${pr.repo}/commits/${pr.baseRef}/check-runs?check_name=${encodeURIComponent(check.name)}`}`
      .quiet()
      .json()) as { check_runs: RawCheckRun[] }
  const [latest] = latestRuns(runs.check_runs.filter((run) => run.app?.slug === check.app))
  return latest ? (latest.conclusion ?? latest.status) : null
}

async function readHistory(pr: Pr): Promise<History> {
  const file = Bun.file(`${pr.runDir}/history.json`)
  return (await file.exists()) ? ((await file.json()) as History) : { entries: [], resolved: [] }
}

async function readWatchFile(pr: Pr): Promise<WatchFile> {
  const file = Bun.file(`${pr.runDir}/watch.json`)
  if (await file.exists()) return (await file.json()) as WatchFile
  return {
    startedAt: new Date().toISOString(),
    seen: {},
    open: [],
    checks: [],
    acknowledged: [],
    posted: [],
    reviewRequested: [],
    headSeenAt: {},
    failures: {},
  }
}

async function writeWatchFile(pr: Pr, watchFile: WatchFile) {
  await Bun.write(`${pr.runDir}/watch.json`, JSON.stringify(watchFile, null, 2))
}

async function graphql(query: string, variables: Record<string, string | number | null>) {
  const fields = Object.entries(variables).flatMap(([key, value]) =>
    value === null ? [] : typeof value === 'number' ? ['-F', `${key}=${value}`] : ['-f', `${key}=${value}`],
  )
  const response = (await $`gh api graphql -f ${`query=${query}`} ${fields}`.quiet().json()) as { data: unknown }
  return response.data
}

function fail(message: string): never {
  console.error(`goop: ${message}`)
  process.exit(1)
}
