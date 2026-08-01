---
name: proompting
description: Designs and audits persistent prompts, agent rules, harnesses, tool policies, and skills. Use when creating or reviewing those; not for ordinary one-off requests.
---

The durable boundary is external enforcement versus model-mediated behavior. Software can guarantee only the property it correctly encodes at an unavoidable enforcement point. Everything the model must interpret, judge, remember, or choose remains empirical: it depends on the specific model, task, context, and tools, and earns confidence from evidence in proportion to the risk.

## Workflow

1. **Define the system.** Identify the message roles, tools, possible side effects, and costly failures. This step is complete when the task and capability boundaries are explicitly defined.
2. **Specify each rule.** For each rule, state what should ideally happen; pin when and what it covers only if the rule sentence does not already make that clear; state what to do when unsure; and name observable evidence of compliance — prefer evidence hard to fake without doing the work. Add exceptions or a conflict note only when a real exception or conflict exists. This step is complete when no important term depends on an unstated interpretation.
3. **Lint the instruction set.** Remove contradictions, stale rules, and accidental duplication. Fix bad examples by editing them — correct any that break a hard requirement, and drop or vary details you do not want imitated. This step is complete when no unresolved conflict remains among the requirements.
4. **Assign controls.** Choose capability restrictions, authorization or approval, deterministic validation, semantic review, or prompt text according to what can actually decide the property. When the owner is prompt judgment, require an operational decision rule (trigger, action, exceptions, unsure → ask/abstain/escalate) — phrases like "be careful" are not controls. This step is complete when every high-impact failure has an owner outside prompt text wherever feasible.
5. **Evaluate where it matters.** Compare baseline and candidate when failures are costly, repeated, or uncertain. Use representative, edge, adversarial, and known-regression cases; repeat runs when outputs vary. This step is complete when material model-sensitive choices are tested or their uncertainty is stated explicitly.

## Control selection

- **Formal properties:** Use types, schemas, constrained decoding, parsers, tests, and validators for properties they can decide. Fail closed where the risk requires it. A valid shape does not prove truthful content, correct intent, or authorization.
- **Reject versus repair:** A rejecting check may cause a retry or failure, so keep prompt guidance when it improves first-pass success. Retire duplicate guidance only when a deterministic repair fully enforces the rule without a model retry or changing meaning. For example, an approval gate that rejects an unconfirmed deletion should keep the prompt rule to ask first; a renderer that safely strips terminal color codes needs no matching prompt rule.
- **Adversarial review:** When deterministic checking is unavailable, a second model may provide another fallible signal. Ask it for concrete counterexamples and exact violation locations, give it the artifact and necessary source material but not the generator's rationale, which anchors the review toward the generator's conclusion, and measure false accepts and rejects. Model diversity can help but does not guarantee independence; retain human review for consequential uncertainty.

## Prompt rules

- State the desired behavior and fallback directly. Add rationale only when it communicates scope, purpose, or a tradeoff the rule cannot express economically. State the criterion, not a proxy for it: "flag when length hurts cohesion," not "flag functions over 50 lines" — quotas and thresholds are lossy stand-ins for a judgment the model can apply. Completeness bars and environment facts the model cannot derive are not proxies; they add information.
- Encode valid behavior in interfaces whenever possible; use examples for ambiguity, judgment, and style.
- Keep examples valid, representative, and varied; strip details you do not want copied. Use a bad/good contrast when the failure is easier to show than to describe, and pair each bad case with its correction; labeling an example `Bad` is not a guarantee that it will not be imitated.
- There is no universal rule-count limit, ordering, markup, emphasis, or example count that transfers across models. When adherence is weak, delete low-value rules before decorating the survivors; if a critical rule is buried, try moving it to the start or end, and compare placements only when adherence materially matters. A rule is low-value when it does not change behavior against the model's default; the default is model-specific, so disagreement is settled by running, not debate.
- Keep always-loaded instructions for guidance needed across tasks. Put branch-specific guidance behind clear pointers, and test routing when missing it would matter.
- Put tool-specific behavior in the tool definition rather than duplicating it in the system prompt. Keep only policy that applies across tools in the shared prompt.
- Position, repetition, formatting, capitalization, emotion, politeness, and reasoning directives such as "think step by step" are model- and task-specific interventions, not reliable sources of emphasis or quality.
- Constrain the final output as the consumer requires. If strict formatting harms task quality, evaluate a separate solve-then-format stage — answer freely, then convert to the required shape — rather than assuming either layout is universally better.

## Evidence discipline

Label advice by what supports it: guaranteed by construction, environment or product fact, cross-model empirical result, model-and-task-specific result, or untested hypothesis. Apply established, low-cost defaults directly. Test model-sensitive choices when failures are costly, repeated, or uncertain. Tie eval findings to the tested model and version, and re-run relevant evals after material system changes.

Acceptance criteria may inspect source files, execution state, tool logs, and side effects, not only the final text. A citation is evidence only after its existence and support for the claim are checked. Never treat generated reasoning as proof; models produce fluent rationales for wrong answers, so verify claims using sources, tool results, and tests.

A review is complete when every high-impact requirement has a defined scope and control owner, every example satisfies the hard requirements, no unresolved conflict remains, and material uncertainties and residual risks are explicit.
