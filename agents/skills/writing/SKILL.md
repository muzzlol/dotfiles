---
name: writing
description: Write and revise prose for human readers. Use for replies, explanations, procedures, documentation, PR desc., commit messages, and user-facing text.
---

Write for one forward reading: later text may add detail, but it must not force the reader to reinterpret earlier text.

## Set the tone

Before writing, identify the reader, their relationship to the writer, and where they will read the text. Then write as a skilled writer of that kind of text would (a respected maintainer writing a PR description or review comment, a staff engineer writing a design doc, a support engineer at a developer-tools company answering a customer, a product writer writing UI copy).

Test each sentence by imagining that writer saying it aloud to this reader. Keep it if they would say it in those words; otherwise rewrite it into what they would say, or delete it if they would say nothing.

Stiff: `Please be advised that the API key must be rotated prior to deployment.`

Spoken: `Rotate the API key before you deploy.`

## Describe or direct

When explaining how something works, write **declaratively**: describe the subject, naming the actor, behavior, conditions, and cause needed to explain the result.

When explaining how to do something, write **procedurally**: direct the reader with imperative verbs, put actions in execution order, and place each prerequisite or warning before the action it governs. State the expected result when the reader needs it to tell whether the action worked.

When a document must both describe and direct, include explanation inside the procedure only when it helps the reader choose, perform, or verify an action.

## Order

When rewriting, reassess the draft’s framing and assumptions for the intended reader and purpose. Pick your battles: change what alters what the reader understands or does, and leave what doesn't, such as the author's choice not to capitalize.

When answering a direct question, state the answer first if the reader can understand it without a missing premise. Otherwise, start from what the reader already knows, not from what you just learned.

Apply the same order to every unit: open each section and each paragraph with its point, and let the rest of the unit support or qualify it.

## Format by job

Use every formatting element and punctuation mark whose job the text has, and none whose job it lacks. An element's job is helping the reader understand, find, or act on something; formatting without one is decoration that costs attention.

- Use connected prose when causality, qualification, or argument carries the meaning; numbered steps when order is part of the meaning; bullets for independent items. Add headings only when the structure is complex enough that the reader must navigate.
- Indent an exception under the rule it narrows. A peer bullet hides what it modifies; inlining it bloats the rule.
- Put a line the reader must not miss (a warning, a breaking change, the ask) on its own line, before the action it governs.
- Bold only the few phrases a skimmer must not miss; each extra bold phrase weakens the others. Start list items with a bold label only when the reader will scan for items by name or refer back to them, and end the label with a period when it works as a heading or a colon when the text after it defines it.
- Choose the punctuation mark that names the relationship: a colon for what explains or expands a claim, a semicolon for two claims that form one thought, parentheses for a skippable aside, `->` for a sequence or transformation, `~` for an approximate number. Write every em dash as `--`.
- Use shorthand engineers read at a glance where it says the same thing in fewer words: `=` for a definition, `<` and `>` for comparisons, `x` for a multiple, `/` for alternatives, `*` for a caveat footnoted below, `^` for the message above, `•` between short items on one line (a row of links closing a support reply), and `>` to quote the line you're replying to when the reply builds on it. The same goes for labels: `nit:` for a non-blocking review comment, `tl;dr:` atop a long message, `edit:` for a change to something people already read.
- Use tables (for items that share attributes, when the reader needs comparison or lookup), `<details>`, GitHub alerts, `suggestion` blocks, and mermaid only where markdown rendering is confirmed: the text goes straight into a destination that renders it, such as a GitHub PR, issue, or comment, or a Markdown file. A chat reply, or a draft the user will paste elsewhere, is unconfirmed. Unrendered, these turn into noise; other markdown stays readable anywhere.
- Text shown verbatim in a product UI gets no markup.

## Build for forward reading

- Put each condition, exception, definition, or premise before the text it governs.

  Bad: `The service deletes uploads after 30 days unless the account has an active subscription.`

  Better: `For accounts without an active subscription, the service deletes uploads after 30 days.`

- Keep subjects near their verbs, verbs near their objects, modifiers near what they modify, and pronouns near unambiguous antecedents.
- Make the actor the subject: `The migration dropped the index`, not `The index was dropped`. Use the passive when the actor is unknown or irrelevant, or when the acted-on thing is the topic.
- Begin sentences with what earlier text established; put new information at the end.
- Name causal, conditional, and contrasting relationships with words such as `because`, `if`, `so`, and `but`; do not leave the reader to infer a relationship from adjacency.
- References locate; prose explains. Every path, line number, label, or ID follows a complete statement of the point it supports.

## Choose precise, familiar words

- Use the word the reader uses themselves (`PR`, `repo`, `prod`, `config`): the most familiar word that preserves the exact meaning. Do not swap in a simpler word that changes the meaning ("deleted" when it was archived) or a fancier one that adds none ("utilize" for "use").
- Explain anything not yet established and not obvious before relying on it. Cut it if the point survives without it.
- Use the same word for the same thing throughout the conversation. Before adding a term, check whether a word already defined will do. If the reader needs both terms, show the difference with an example.
- Replace labels such as "safe", "fast", "simple", and "robust" with the behavior, mechanism, or measurement that supports them.
- Do not rank options by a cost you have not checked.
- Anchor a category with an instance in parentheses (importance claims ("it is important to note")). An unanchored category lets each reader draw its boundary differently.

Vague: `The retry behavior is robust.`

Precise: `After a timeout, the client retries twice and then returns the last error.`

## State uncertainty

State what is unknown and which conclusion or action the uncertainty limits. Do not spread a local uncertainty across the whole answer with generic hedges or disclaimers.

Example: `I did not run the migration, so its completion time is unverified.`

## Delete what changes nothing

Delete a sentence when the answer, and what the reader decides or does, survive without it.
Delete empty framing such as announcements ("here is a breakdown"), importance claims ("it is important to note"), recaps that repeat the same conclusion, and explanations of implications the preceding text already establishes.

Cut phrases by the same test ("throughout the duration of" becomes "during"), but keep articles and connectives: dropping them shortens the text and makes it harder to follow.

A sentence that manages the relationship instead of carrying content (thanks, an apology, praise, an offer of more help) stays only when it is specific and the writer from **Set the tone** would say it to this reader: thanks for the repro they wrote, an apology for the outage we caused.

## Make documents self-contained

A new reader must not need the conversation that produced a document. Replace references such as "as discussed", "from our thread", and "the earlier conversation" with the premise, decision, or rationale they stand for. A durable, accessible source may supply evidence or detail, but the document carries the context needed to interpret its main claims.

## Ask for a decision

When the text asks the reader to decide something, write each item as [DECISIONS.md](DECISIONS.md) lays out.

## Test the draft

Read from left to right, stopping after the direct answer, each section, and each completed step. Everything read so far remains true; later text may deepen it but never correct it.

## Scope

This skill governs prose for human readers. Prompts, skills, and agent rules follow the proompting and skill-format skills instead; clear prose does not replace their controls and completion criteria.

[EVIDENCE.md](EVIDENCE.md) records the research behind inherited rules and the debunked advice that must not re-enter. Consult the relevant entry before changing a research-backed rule.
