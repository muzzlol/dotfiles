# Evidence — proompting skill

Test results behind rules in [SKILL.md](SKILL.md), labeled with the skill's own evidence categories. Each entry names the model and setup. Rerun an entry before relying on it for a different model, and consult it before changing a rule it supports.

## Reporting and trigger rules in an always-loaded skill

October 2026. claude-sonnet-5-5 in headless Claude Code with repository skills only (personal skills excluded), each concurrent run in its own checkout, reset between runs. The guidance under test was two additions to a repository's always-loaded code-style skill:

- A conditional report: "In your final message, give one line to each decision where a rule here made you decline or change part of the request, or where you departed from a rule… Skip decisions the reader would not otherwise question."
- A judged trigger: "When the user corrects, or asks you to fix, a coding pattern an agent would plausibly repeat in another task… end your final message with one question proposing" a safeguard.

Round 1 ran 7 tasks once each against the baseline and candidate skill, with prompts that described only the task. Round 2 ran 3 tasks 3 times per variant, with the prompt telling the agent to load the skill.

- **Loading confounds adherence.** In round 1 the skill loaded in 6 of 14 runs and never on the smallest edits, so most candidate runs tested routing rather than the additions; the filler below appeared only once round 2 forced loading. Basis of step 5's loading-versus-adherence split. — model-and-task-specific.
- **A conditional report draws reports of absence.** With loading forced, 12 of 18 final messages reported that no rule had changed anything ("No rule made me decline or change part of the request."), despite the skip clause. The baseline skill, which has no report rule, produced none in the 2 runs that loaded it. Basis of step 5's no-change cases. — model-and-task-specific.
- **A judged trigger for unprompted work resolves to "doesn't apply".** The trigger fired in none of the 14 runs where it should have, whether it sat at the end of the file behind a required file read or at the top without one. One run said it had judged the request "a one-off cleanup, not a correction of a coding pattern." Basis of step 3's checkable triggers and the placement note. — model-and-task-specific.
- **Self-reported compliance misses violations.** A run that loaded the report rule added guards the skill forbids and reported no departure. Basis of the self-report clause under Evidence. — model-and-task-specific; one run.
