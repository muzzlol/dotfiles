// Resolves a page's `source` into two commits, the patch between them, and a way to
// read files at each. Never checks out, switches, stashes, or touches the real index.
// See DESIGN.md, "Resolve source".
import { $ } from "bun";
import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import type { RefContext } from "./refs";
import type { ChangedFile, ResolvedSource } from "./src/source";

export const SOURCES = [
  "pr:<number>      the pull request, against where its branch left the base",
  "commit:<rev>     one commit, against its first parent",
  "<a>..<b>         b against a; <a>...<b> against where b left a",
  "worktree         uncommitted work, tracked and untracked, against HEAD",
  "worktree:<rev>   the same, against where HEAD left <rev>",
  "<any> -- <paths> only changes under these paths",
];

/** Git's empty tree: the base of a repository's first commit. */
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

/** Lockfiles and build output, counted in Files rather than listed. */
const GENERATED =
  /(^|\/)(bun\.lockb?|package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|poetry\.lock|uv\.lock|Pipfile\.lock|go\.sum|Gemfile\.lock|composer\.lock|flake\.lock)$|\.min\.(js|css)$|\.map$|(^|\/)(dist|__generated__|generated)\//;

export type Resolved = { resolved: ResolvedSource; patch: string; ctx: RefContext };

type Commits = { base: string; head: string; title: string; url?: string; repo?: string; published: boolean };

export async function resolveSource(source: string, repoDir: string): Promise<Resolved> {
  const [spec, pathspec = ""] = source.split(/\s+--\s+/);
  // Paths split on spaces, except inside quotes: worktree -- "my file.ts" src/
  const paths = [...pathspec.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]);
  const top = (await $`git rev-parse --show-toplevel`.cwd(repoDir).nothrow().quiet().text()).trim();
  if (!top) throw new Error(`${repoDir} isn't inside a git repository`);
  const git = (args: string[]) => $`git ${args}`.cwd(top).nothrow().quiet();
  const text = async (args: string[]) => {
    const out = await git(args);
    if (out.exitCode !== 0) throw new Error(`git ${args.join(" ")} failed: ${out.stderr.toString().trim()}`);
    return out.stdout.toString().trim();
  };
  const commit = async (rev: string) => {
    const sha = (await git(["rev-parse", "--verify", "--quiet", `${rev}^{commit}`])).stdout.toString().trim();
    if (!sha) throw new Error(`no commit "${rev}" in ${top}; fetch it, or check the name`);
    return sha;
  };
  const published = async (sha: string) => (await text(["for-each-ref", "--count=1", "--contains", sha, "refs/remotes"])) !== "";

  let commits: Commits;
  const pr = spec.match(/^pr:(\d+)$/);
  const one = spec.match(/^commit:(.+)$/);
  const range = spec.match(/^(?!pr:|commit:|worktree)(.+?)(\.\.\.?)(.+)$/);
  const worktree = spec.match(/^worktree(?::(.+))?$/);
  if (pr) {
    const view = JSON.parse(await $`gh pr view ${pr[1]} --json title,url,baseRefOid,headRefOid`.cwd(top).text()) as {
      title: string;
      url: string;
      baseRefOid: string;
      headRefOid: string;
    };
    await fetchMissing(top, [view.baseRefOid, view.headRefOid], `pull/${pr[1]}/head`);
    // A PR's diff starts where its branch left the base, not at the base's tip.
    const base = await text(["merge-base", view.baseRefOid, view.headRefOid]);
    const repo = view.url.match(/github\.com\/([^/]+\/[^/]+)\//)?.[1];
    commits = { base, head: view.headRefOid, title: view.title, url: view.url, repo, published: true };
  } else if (one) {
    const head = await commit(one[1]);
    const parent = (await git(["rev-parse", "--verify", "--quiet", `${head}^1`])).stdout.toString().trim();
    commits = { base: parent || EMPTY_TREE, head, title: await text(["log", "-1", "--format=%s", head]), published: await published(head) };
  } else if (range) {
    const [, a, dots, b] = range;
    const head = await commit(b);
    const base = dots === "..." ? await text(["merge-base", await commit(a), head]) : await commit(a);
    const count = Number(await text(["rev-list", "--count", `${base}..${head}`]));
    const title = count === 1 ? await text(["log", "-1", "--format=%s", head]) : `${count} commits, ${a}${dots}${b}`;
    commits = { base, head, title, published: await published(head) };
  } else if (worktree) {
    await refuseMidOperation(top, text);
    const base = worktree[1] ? await text(["merge-base", await commit(worktree[1]), "HEAD"]) : await commit("HEAD");
    const head = await snapshot(top, text);
    const branch = (await git(["symbolic-ref", "--short", "-q", "HEAD"])).stdout.toString().trim() || "a detached HEAD";
    const title = worktree[1] ? `${branch} since ${worktree[1]}, with uncommitted work` : `Uncommitted work on ${branch}`;
    // The snapshot exists only here, so links can't point at it.
    commits = { base, head, title, published: false };
  } else {
    throw new Error(`can't read source "${source}". Use one of:\n  ${SOURCES.join("\n  ")}`);
  }

  const patch = (await git(["diff", "--no-color", "--no-ext-diff", "-M", commits.base, commits.head, "--", ...paths])).stdout.toString();
  if (!patch.trim()) throw new Error(`source "${source}" has no changes between ${commits.base.slice(0, 9)} and ${commits.head.slice(0, 9)}`);
  const files = await markGenerated(await changedFiles(git, commits.base, commits.head, paths), top);
  const origin = (await git(["remote", "get-url", "origin"])).stdout.toString().trim();
  const repo = commits.repo ?? origin.match(/github\.com[:/]([^/]+\/[^/]+?)(\.git)?$/)?.[1] ?? basename(top);
  const onGitHub = /github\.com[:/]/.test(origin);
  const linkable = new Map<string, boolean>([[commits.head, commits.published && onGitHub]]);
  linkable.set(commits.base, onGitHub && commits.base !== EMPTY_TREE && (await published(commits.base)));
  return {
    patch,
    resolved: { source, repo, title: commits.title, url: commits.url, base: commits.base, head: commits.head, files, refs: {}, colors: [] },
    ctx: {
      base: commits.base,
      head: commits.head,
      files,
      read: async (sha, path) => {
        const shown = await git(["show", `${sha}:${path}`]);
        return shown.exitCode === 0 ? shown.stdout.toString() : undefined;
      },
      paths: async (sha) => (await text(["ls-tree", "-r", "--name-only", sha])).split("\n"),
      link: (sha, path, start, end) => (linkable.get(sha) ? `https://github.com/${repo}/blob/${sha}/${path}#L${start}-L${end}` : undefined),
    },
  };
}

/** Each changed file with its status and line counts, from git's NUL-separated output, so any path survives. */
async function changedFiles(git: (args: string[]) => ReturnType<typeof $>, base: string, head: string, paths: string[]): Promise<ChangedFile[]> {
  const run = async (format: string) => (await git(["diff", format, "-z", "-M", base, head, "--", ...paths])).stdout.toString().split("\0");
  // --numstat -z: "adds\tdels\tpath", or "adds\tdels\t" then the old and new paths for a rename.
  const counts = new Map<string, { additions: number; deletions: number }>();
  const numstat = await run("--numstat");
  for (let i = 0; i < numstat.length - 1; i++) {
    // Only the first two tabs separate fields; a path may hold more.
    const [, adds, dels, path] = numstat[i].match(/^([^\t]*)\t([^\t]*)\t(.*)$/s) ?? [];
    const key = path || numstat[(i += 2)];
    counts.set(key, { additions: Number(adds) || 0, deletions: Number(dels) || 0 });
  }
  // --name-status -z: a status letter, then one path, or the old and new paths for a rename or copy.
  const files: ChangedFile[] = [];
  const names = await run("--name-status");
  for (let i = 0; i < names.length - 1; ) {
    const letter = names[i++][0];
    const from = letter === "R" || letter === "C" ? names[i++] : undefined;
    const path = names[i++];
    const status = letter === "A" || letter === "C" ? "added" : letter === "D" ? "removed" : letter === "R" ? "renamed" : "modified";
    files.push({ path, status, ...(counts.get(path) ?? { additions: 0, deletions: 0 }), ...(letter === "R" ? { from } : {}) });
  }
  return files;
}

/** Fetches commits the local clone lacks. */
async function fetchMissing(top: string, shas: string[], fallbackRef: string) {
  const has = async (sha: string) => (await $`git cat-file -e ${`${sha}^{commit}`}`.cwd(top).nothrow().quiet()).exitCode === 0;
  for (const sha of shas) {
    if (await has(sha)) continue;
    await $`git fetch --quiet --no-tags origin ${sha}`.cwd(top).nothrow().quiet();
    if (!(await has(sha))) await $`git fetch --quiet --no-tags origin ${fallbackRef}`.cwd(top).nothrow().quiet();
    if (!(await has(sha))) throw new Error(`commit ${sha} isn't in ${top}, and fetching it from origin failed`);
  }
}

/** A rebase, merge, cherry-pick, or revert in progress leaves a worktree that isn't anyone's change. */
async function refuseMidOperation(top: string, text: (args: string[]) => Promise<string>) {
  for (const [marker, operation] of [
    ["rebase-merge", "a rebase"],
    ["rebase-apply", "a rebase"],
    ["MERGE_HEAD", "a merge"],
    ["CHERRY_PICK_HEAD", "a cherry-pick"],
    ["REVERT_HEAD", "a revert"],
  ]) {
    if (existsSync(resolve(top, await text(["rev-parse", "--git-path", marker]))))
      throw new Error(`the worktree is in the middle of ${operation}; finish or abort it, or name commits instead`);
  }
}

/**
 * Commits the worktree, tracked and untracked files alike, through a copy of the
 * index. The commit is on no branch; the real index, branches, and stash are untouched.
 */
async function snapshot(top: string, text: (args: string[]) => Promise<string>): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "explain-index-"));
  const index = join(dir, "index");
  try {
    // Copying keeps the index's file stats, so unchanged files aren't hashed again.
    const real = resolve(top, await text(["rev-parse", "--git-path", "index"]));
    if (existsSync(real)) copyFileSync(real, index);
    const env = { ...process.env, GIT_INDEX_FILE: index };
    const add = await $`git add -A`.cwd(top).env(env).nothrow().quiet();
    if (add.exitCode !== 0) throw new Error(`snapshotting the worktree failed: ${add.stderr.toString().trim()}`);
    const tree = (await $`git write-tree`.cwd(top).env(env).quiet().text()).trim();
    const message = "explain: worktree snapshot";
    return (await $`git -c user.name=explain -c user.email=explain@localhost commit-tree ${tree} -p HEAD -m ${message}`.cwd(top).quiet().text()).trim();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Flags lockfiles, build output, and files `.gitattributes` marks `linguist-generated`. */
async function markGenerated(files: ChangedFile[], top: string): Promise<ChangedFile[]> {
  const attrs = files.length
    ? (await $`git check-attr -z linguist-generated -- ${files.map((f) => f.path)}`.cwd(top).nothrow().quiet()).stdout.toString().split("\0")
    : [];
  const marked = new Set<string>();
  for (let i = 0; i + 2 < attrs.length; i += 3) if (attrs[i + 2] === "set" || attrs[i + 2] === "true") marked.add(attrs[i]);
  return files.map((f) => (GENERATED.test(f.path) || marked.has(f.path) ? { ...f, generated: true } : f));
}
