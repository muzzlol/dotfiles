---
name: proompting
description: Designs and audits persistent prompts, agent rules, harnesses, tool policies, and skills. Use when creating or reviewing those; not for ordinary one-off requests.
---

The durable boundary is external enforcement versus model-mediated behavior. Software can guarantee only the property it correctly encodes at an unavoidable enforcement point. Everything the model must interpret, judge, remember, or choose remains empirical: it depends on the specific model, task, context, and tools, and earns confidence from evidence in proportion to the risk.

## Workflow

1. **Define the system.** Identify the message roles, tools, possible side effects, and costly failures. (Reference: **Spend the model on judgment**.)

   **Done when:** the task and capability boundaries are explicitly defined.

2. **Specify each rule.** (Reference: **Prompt rules**.) For each rule:
   - state what should ideally happen;
   - pin when and what it covers only if the rule sentence does not already make that clear;
   - state the required fallback when uncertainty can change behavior; if none is specified, surface the missing policy instead of inventing it;
   - name observable evidence of compliance — prefer evidence hard to fake without doing the work;
   - add exceptions or a conflict note only when a real exception or conflict exists.

   **Done when:** no important term depends on an unstated interpretation.

3. **Remove what the model does not need.**
   - Delete instructions that conflict, are outdated, or repeat another instruction.
   - Keep an instruction or interface choice only when a stated requirement, observed failure, or established default supports it. Support for a restriction, default, or limit must establish its exact behavior or value. A name, example, purpose, or preferred use case is not a requirement; if nothing establishes a restriction, leave the behavior allowed.
   - When cardinality is unspecified, use unquantified prose (“independent inputs,” not “multiple independent inputs”) and omit validators such as `minItems` and `maxItems`; singular or plural nouns and whether empty or one-item input seems useful do not specify cardinality.
   - Ask the model for a tool input only when the model must choose its value. If code can derive the value, derive it in code.
   - Mention how a tool works only when the model must account for it.

   **Done when:** every remaining instruction and interface choice can cite its support. (Reference: every section.)

4. **Assign controls.** Choose capability restrictions, authorization or approval, deterministic validation, semantic review, or prompt text according to what can actually decide the property. When the owner is prompt judgment, require an operational decision rule (trigger, action, exceptions, unsure → ask/abstain/escalate) — phrases like "be careful" are not controls. (Reference: **Spend the model on judgment**, **Control selection**.)

   **Done when:** every high-impact failure has an owner outside prompt text wherever feasible.

5. **Evaluate where it matters.** Compare baseline and candidate when failures are costly, repeated, or uncertain. Use representative, edge, adversarial, and known-regression cases; repeat runs when outputs vary. (Reference: **Evidence discipline**.)

   **Done when:** material model-sensitive choices are tested or their uncertainty is stated explicitly.

## Spend the model on judgment

Use the model to choose what to investigate, express the investigation, and interpret its outcome. Move work into software once its correct execution can be specified and checked.

Give the model programmable access to real application behavior and runtime data. Its program should control the query, experiment, filtering, and returned result. The tool should handle stable operational details, execute predictable steps, and save underlying evidence outside context when it may need verification or reanalysis.

Repeated discovery, output transcription, turn-by-turn coordination, duplicated application logic, raw context dumps, and guesses about measurable behavior indicate a tooling gap. Fix the boundary before the prompt.

When the procedure is still unclear, let the model perform it and record what happens. Move it into software once those traces reveal a stable procedure and doing so is worth the implementation cost. Never move work from software back to instructions without a written reason.

**Bad:** The model discovers log resources, starts and polls a query, then loads every result into context to filter it.
**Better:** The model writes the query and filtering logic; the tool resolves resources, executes the query, saves the evidence, and returns the model-selected result.

**Bad:** The model searches source code and guesses where N+1 queries occur.
**Better:** The model writes an experiment against instrumented production functions; software records database calls, and the model judges the measured behavior.

**Bad:** The model re-types a subagent's proof into its output.
**Better:** It cites the proof by id; software reattaches it verbatim.

## Prompt rules

**Write the rule**
- State the desired behavior and fallback directly. Add rationale only when it communicates scope, purpose, or a tradeoff the rule cannot express economically. State the criterion, not a proxy for it: "flag when length hurts cohesion," not "flag functions over 50 lines" — quotas and thresholds are lossy stand-ins for a judgment the model can apply. Completeness bars and environment facts the model cannot derive are not proxies; they add information.
- Encode valid behavior in interfaces whenever possible; use examples for ambiguity, judgment, and style.

**Examples**
- Keep examples valid, representative, and varied; strip details you do not want copied. Use a bad/good contrast when the failure is easier to show than to describe, and pair each bad case with its correction; labeling an example `Bad` is not a guarantee that it will not be imitated.

**Load and ownership**
- Keep always-loaded instructions for guidance needed across tasks. Put branch-specific guidance behind clear pointers, and test routing when missing it would matter.
- Put tool-specific behavior in the tool definition rather than duplicating it in the system prompt. Keep only policy that applies across tools in the shared prompt.
- When the model chooses whether to call a tool, its description states when to call it. If a requirement or observed failure establishes that some requests should use another tool or no tool, state that boundary, name the alternative, and say what to do when unsure. Overlapping tools must disambiguate against each other, and state cost when it should change the choice ("slower; prefer X for simple lookups"). Do not invent a restriction to complete this structure.

**What does not transfer**
- There is no universal rule-count limit, ordering, markup, emphasis, or example count that transfers across models. When adherence is weak, delete low-value rules before decorating the survivors. If a critical rule is buried, try moving it to the start or end, and compare placements only when adherence materially matters. A rule is low-value when it does not change behavior against the model's default; the default is model-specific, so disagreement is settled by running, not debate.
- Position, repetition, formatting, capitalization, emotion, politeness, and reasoning directives such as "think step by step" are model- and task-specific interventions, not reliable sources of emphasis or quality.

**Output shape**
- Constrain the final output as the consumer requires. If strict formatting harms task quality, evaluate a separate solve-then-format stage — answer freely, then convert to the required shape — rather than assuming either layout is universally better.

## Control selection

- **Formal properties:** Use types, schemas, constrained decoding, parsers, tests, and validators for properties they can decide. Fail closed where the risk requires it. A valid shape does not prove truthful content, correct intent, or authorization. A validator guards only the path it sits on; when paths are added or changed, re-verify each property is still checked on all of them.
- **Reject versus repair:** A rejecting check may cause a retry or failure, so keep prompt guidance when it improves first-pass success. Retire duplicate guidance only when a deterministic repair fully enforces the rule without a model retry or changing meaning. For example, an approval gate that rejects an unconfirmed deletion should keep the prompt rule to ask first; a renderer that safely strips terminal color codes needs no matching prompt rule. When a new rejecting check gates costly output, run it in shadow first — log what it would have rejected, measure false accepts and rejects — and enforce only after the numbers support it.
- **Adversarial review:** When deterministic checking is unavailable, a second model may provide another fallible signal. Ask it for concrete counterexamples and exact violation locations, and measure false accepts and rejects. Give it the artifact and necessary source material but not the generator's rationale — the rationale anchors the review toward the generator's conclusion. Model diversity can help but does not guarantee independence; retain human review for consequential uncertainty.

## Evidence discipline

Label advice by what supports it: guaranteed by construction, environment or product fact, cross-model empirical result, model-and-task-specific result, or untested hypothesis. Apply established, low-cost defaults directly. Test model-sensitive choices when failures are costly, repeated, or uncertain. Tie eval findings to the tested model and version, and re-run relevant evals after material system changes.

Acceptance criteria may inspect source files, execution state, tool logs, and side effects, not only the final text. A citation is evidence only after its existence and support for the claim are checked. Never treat generated reasoning as proof; models produce fluent rationales for wrong answers, so verify claims using sources, tool results, and tests.

## Done when

A review is complete when every high-impact requirement has a defined scope and control owner, every example satisfies the hard requirements, no unresolved conflict remains, and material uncertainties and residual risks are stated explicitly.
