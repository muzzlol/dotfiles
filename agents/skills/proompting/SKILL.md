---
name: proompting
description: Use when creating or reviewing persistent prompts, agent rules, harnesses, tool policies, or skills; not for one-off user requests.
---

Software guarantees only properties correctly enforced at unavoidable points. Behavior left to model interpretation, judgment, memory, or choice remains empirical; confidence requires evidence for the specific model, task, context, and tools, proportional to failure cost.

## Workflow

1. **Define the system.** Identify the task, message roles, tools, capability boundaries, side effects, and costly failures.

   **Done when:** every listed system element is explicit.

2. **Establish requirements.** For each desired behavior or interface choice, record:
   - the required result and scope;
   - its support: a stated requirement, observed failure, or established default;
   - observable evidence of compliance, preferring evidence difficult to fake without doing the work;
   - any required fallback, real exception, or conflict.

   If uncertainty can change behavior and no fallback is supported, record the policy gap instead of inventing one. A restriction, default, or limit requires support for its exact behavior or value; a name, example, purpose, or preferred use case does not establish one. Without that support, leave the behavior allowed.

   **Done when:** every item has a result, scope, support, and evidence; applicable fallbacks, exceptions, conflicts, and policy gaps are explicit; and no behavior-changing term depends on unstated interpretation.

3. **Assign controls.** Map each requirement to a mechanism that can decide it: capability restriction, authorization or approval, deterministic validation or repair, semantic review, or prompt guidance. A model-judgment rule needs a trigger, action, exceptions, and an unsure fallback such as ask, abstain, or escalate; "be careful" is not a control.

   **Done when:** every requirement has a control, and no externally decidable costly failure relies on prompt text.

4. **Fit and write prompt guidance.** For each prompt requirement, edit its existing governing instruction before adding one. Delete, merge, or narrow conflicting, outdated, or repeated instructions; add only for an uncovered requirement. Apply **Prompt design**.

   **Done when:** every prompt requirement has one supported, nonduplicative governing instruction.

5. **Evaluate where it matters.** Compare baseline and candidate when a model-sensitive choice involves costly or repeated failures, or its effect is uncertain. Use representative, edge, adversarial, and regression cases; repeat runs when outputs vary.

   **Done when:** each target choice is tested or marked untested with its uncertainty and residual risk.

## Model and software responsibilities

Use the model for investigation choices and interpretation; use software for execution that can be specified and checked. Give the model programmable access to actual behavior and data: model-authored code should control queries, experiments, filtering, and result selection, while tools handle stable operational details. Save evidence outside the model context when it may need later verification.

Repeated resource discovery, polling or turn coordination, transcription, duplicated application logic, raw context dumps, or guesses about measurable behavior signal a tooling gap. Under existing capability and approval controls, let the model trace unclear procedures; move stable steps into software when justified. Do not move software work back into instructions without recording why.

## Prompt design

- State behavior and fallback directly. Include rationale only when needed for scope, purpose, or a tradeoff.
- Supply completion requirements and environment facts the model cannot derive. For model judgment, state a criterion instead of a proxy quota: "flag when length hurts cohesion," not "flag functions over 50 lines."
- Use examples only to resolve ambiguity or convey judgment or style. Keep them valid and representative, remove incidental details, and pair bad examples with corrections.
- Keep only cross-task guidance always loaded. Put conditional guidance behind a pointer that says when to load it, and test routing when failure would matter. Put tool-specific behavior in tool definitions and only cross-tool policy in shared prompts. For skills, follow `skill-format`.
- Treat rule count, placement, repetition, formatting, emphasis, capitalization, emotion, politeness, example count, and reasoning directives as model- and task-specific, not universal. Evaluate whether a rule changes target-model behavior. When adherence is weak, delete low-value rules before restyling survivors; for a costly buried-rule failure, compare beginning and end placement.
- Constrain output to consumer requirements. If that harms quality, evaluate solving first and formatting second.

## Tool and interface design

- Use types, schemas, constrained decoding, parsers, tests, and validators for properties they can decide; fail closed when failure cost requires it. Valid shape does not prove truth, intent, or authorization. Validators protect only invoking paths, so recheck coverage after path changes.
- Do not infer unspecified cardinality from grammar or usefulness. Use unquantified prose ("independent inputs") and omit unsupported `minItems` or `maxItems`.
- Ask the model for a value only when the model must choose it; derive code-owned values in code. Describe mechanics only when the model must account for them.
- Tool descriptions state when to call, distinguish overlaps and decision-relevant costs, and, when supported by step 2, name alternatives or no-tool boundaries and an unsure fallback. Do not invent boundaries to make routing exhaustive.

## Validation and review

### Reject or repair

- A rejection is not a repair. Keep prompt guidance when rejection can cause retry or failure and guidance improves first-pass success; retire it only when deterministic repair enforces the requirement without retry or meaning change.
- Before enforcing a new rejecting check on costly output, run it in shadow and measure both error rates against independently adjudicated accepted and rejected samples; enforce only when the rates meet defined bounds.

### Adversarial review

- When deterministic checking is unavailable, a second model can provide another fallible signal. Ask for concrete counterexamples and exact violation locations, and measure false accepts and rejects against independently adjudicated cases.
- Give the reviewer the artifact and necessary sources, but not the generator's rationale, which can anchor the review toward its conclusion. Model diversity does not guarantee independence; retain human review when error could cause a costly failure.

### Evidence

- Label advice as guaranteed by construction, environment or product fact, cross-model empirical result, model-and-task-specific result, or untested hypothesis.
- Apply established, low-cost defaults directly. Record the tested model and version, and rerun relevant evaluations after changes that may affect them.
- Acceptance criteria may inspect source files, execution state, tool logs, and side effects, not only final text. Treat citations as evidence only after checking that their sources exist and support the claim; never treat generated reasoning as proof.

## Done when

Complete when every step passes, every example meets its requirements, no conflict remains unresolved, and all policy gaps, untested choices, and residual risks are explicit.
