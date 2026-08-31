---
name: writing
description: Write and revise prose for human readers. Use for replies, explanations, procedures, documentation, PR and commit messages, and user-facing text.
---

Write for one forward reading: later text may add detail, but it must not force the reader to reinterpret earlier text.

## Describe or direct

When explaining how something works, write **declaratively**: describe the subject, naming the actor, behavior, conditions, and cause needed to explain the result.

When explaining how to do something, write **procedurally**: direct the reader with imperative verbs, put actions in execution order, and place each prerequisite or warning before the action it governs. State the expected result when the reader needs it to tell whether the action worked.

When a document must both describe and direct, include explanation inside the procedure only when it helps the reader choose, perform, or verify an action.

## Order and form

When answering a direct question, state the answer first if the reader can understand it without a missing premise. Otherwise, state the required premise first.

Apply the same order to every unit: open each section and each paragraph with its point, and let the rest of the unit support or qualify it. Break a paragraph where the idea changes; add headings only when the structure is complex enough that the reader must navigate.

Choose form from the relationship between the information:

- Use numbered steps when order is part of the meaning.
- Use bullets for independent items.
- Use a table when items share the same attributes, the reader needs comparison or lookup, and the medium renders the table clearly.
- Use connected prose when causality, qualification, or argument carries the meaning.
- Indent an exception under the rule it narrows. A peer bullet hides what it modifies; inlining it bloats the rule. Warnings and prerequisites still come before the action they govern.

## Build for forward reading

- each condition, exception, definition, or premise before the text it governs.

  Bad: `The service deletes uploads after 30 days unless the account has an active subscription.`

  Better: `For accounts without an active subscription, the service deletes uploads after 30 days.`

- subjects near their verbs, verbs near their objects, modifiers near what they modify, and pronouns near unambiguous antecedents.
- begin sentences with what earlier text established; put new information at the end.
- name causal, conditional, and contrasting relationships with words such as `because`, `if`, `so`, and `but`; do not leave the reader to infer a relationship from adjacency.
- References locate; prose explains. Every path, line number, label, or ID follows a complete statement of the point it supports.

## Choose precise, familiar words

- Use the most familiar word that preserves the exact meaning. Do not trade precision for simplicity or use inflated wording for status.
- When only an unfamiliar technical term is precise enough, explain its role before relying on its name.
- Once a thing has a name, reuse that name. Do not rotate synonyms for variety.
- Replace labels such as "safe", "fast", "simple", and "robust" with the behavior, mechanism, or measurement that supports them.
- Anchor a category with an instance in parentheses (importance claims ("it is important to note")). An unanchored category lets each reader draw its boundary differently.

Vague: `The retry behavior is robust.`

Precise: `After a timeout, the client retries twice and then returns the last error.`

## State uncertainty

State what is unknown and which conclusion or action the uncertainty limits. Do not spread a local uncertainty across the whole answer with generic hedges or disclaimers.

Example: `I did not run the migration, so its completion time is unverified.`

## Delete sentences that change nothing

Delete a sentence when removing it changes neither what the reader understands, what they decide, nor what they do.
Delete empty framing such as announcements ("here is a breakdown"), importance claims ("it is important to note"), recaps that repeat the same conclusion, and explanations of implications the preceding text already establishes.

## Make documents self-contained

A new reader must not need the conversation that produced a document. Replace references such as "as discussed", "from our thread", and "the earlier conversation" with the premise, decision, or rationale they stand for. A durable, accessible source may supply evidence or detail, but the document carries the context needed to interpret its main claims.

## Test the draft

Read from left to right, stopping after the direct answer, each section, and each completed step. Everything read so far remains true; later text may deepen it but never correct it.

## Scope

This skill governs prose for human readers. Prompts, skills, and agent rules follow the proompting and skill-format skills instead; clear prose does not replace their controls and completion criteria.

[EVIDENCE.md](EVIDENCE.md) records the research behind inherited rules and the debunked advice that must not re-enter. Consult the relevant entry before changing a research-backed rule.
