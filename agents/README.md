# Agent skills

How I work with coding agents: two skills take a task from discussion to a PR ready to merge, and a few base skills shape how the agent codes, writes, and explains along the way.

1. Once I've talked a task through with the agent, [exec](greptilia/exec/SKILL.md) does it. It makes the change, commits it on a new branch, explains the commit, then runs subagents for a Greptile (AI code review) pass, [simplify](skills/simplify/SKILL.md), and tests.
2. After the PR is open, [goop](greptilia/goop/SKILL.md) watches it until Greptile scores it 5/5 and CI is green. A fixer subagent fixes or answers each review comment and CI failure as it lands, applying fixes through exec. [goop.ts](greptilia/goop/goop.ts) does all of goop's GitHub polling and posting.

Both are tied to Greptile's monorepo (its test commands, the Greptile CLI), so they live in [greptilia/](greptilia/) instead of the global [skills/](skills/) folder. Expect to adapt them.

The base skills:

- [writing](skills/writing/SKILL.md): how I want anything a person reads to be written, from the agent's replies to me to PR descriptions and commit messages. This one changes the most.
- [proompting](skills/proompting/SKILL.md): how I build skills and prompts. I also use it to review prompts and LLM-powered apps.
- [skill-format](skills/skill-format/SKILL.md): how a skill triggers and how its file is laid out; proompting covers what the rules inside it say.
- [explain](skills/explain/SKILL.md): explains code and changes in plain language; exec uses it to walk me through each commit.
- [code-style](skills/code-style/SKILL.md): TypeScript style rules exec loads before it touches code.
- [simplify](skills/simplify/SKILL.md): finds cleanup in a change, such as repeated or misplaced work, low-info comments, and one-off helpers.
