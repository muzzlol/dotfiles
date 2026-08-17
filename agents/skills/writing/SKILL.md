---
name: writing
description: "Write prose that keeps its reader. Use when composing or revising any text a human will read: replies, explanations, PR and commit messages, docs, error text."
---

Readers satisfice. At the start of every unit — the reply, a section, a paragraph, a list item — they judge whether continuing will pay, and leave the moment it won't; on screens they read shallower and skim harder. Write so that wherever the reader stops, they leave with the best understanding that much attention could buy — **progressive payoff**.

Clarity per unit of attention is the goal; brevity is a byproduct. **Select, don't compress:** shorten by leaving whole sentences and sections out, never by squeezing grammar out of the ones that stay — telegram-style fragments are shorter and understood worse, because the dropped articles, subjects, and connectives carried the logic.

Do not trust the feel of your own draft. "Clear to me" is the curse of knowledge talking, and "felt thorough, looked organized" is how raters get fooled by length and markup, not how readers win. Trust the checks at the end.

## Order

- **Open with the thing asked for.** The first sentence answers the question or states the outcome; support follows. Openers that restate the question, announce what you are about to do, or appraise the asker spend the reader's best attention on nothing. Delay the answer only when the reader asked to be walked through the reasoning, or when the answer is meaningless without one fact of setup.
- **Front-load every unit.** The exit decision happens at the start of each unit, so a paragraph's first sentence carries its point and a section's first paragraph its conclusion. Test: headings and first sentences alone should reconstruct the message — that is how skilled readers actually scan.
- **Size tracks the question.** A one-line question gets a one-line answer unless the truth will not fit in one line. Stop when the request is answered; offer depth rather than including it.
- **Must-read lines sit alone.** A warning or destructive step goes in its own short paragraph immediately before the action it governs, never inside a list or a long block. Scannable structure exists for finding things; a line the reader must not skip should be harder to skip than to read.

## Sentences

- **Plain words.** The shortest common word that carries the exact meaning. Inflated diction lowers both comprehension and the reader's estimate of the writer, and expert readers prefer plain wording more, not less — writing up to sound senior runs the status inference backwards.
- **The audience's vocabulary.** A term the reader uses daily is compression; a term they don't own deters even when defined. Introduce an unfamiliar name by its role before the name itself; teach a term only if the reader needs it beyond this text, glossing it in the same breath ("optimize the measurable stand-in and it stops tracking the goal — a Goodhart trap"). If unsure whether the audience owns a term, gloss it once — a clause spent on a known term is cheaper than a reader lost to an unknown one. A coined label may follow the plain statement it compresses, never replace it. Cut allusions that only decorate.
- **One name per thing.** Rotating synonyms for one referent ("check", then "verify", then "confirm") forces the reader to re-derive that they are the same act; reuse the established name, and save variation for things that actually differ.
- **One main claim per sentence.** A sentence overloads when it stacks open dependencies faster than the reader closes them — working memory holds about three or four. Split at the clause boundary and keep the connective: "because", "but", and "so" are what make two short sentences one thought, and deleting them to save words deletes the logic.
- **Actors act.** Say who does what with a verb: "we decided", not "a decision was made regarding". Default to active voice; use the passive when the actor is unknown or irrelevant, or when the acted-on thing is the sentence's topic — flow outranks voice. A noun stack that isn't the thing's established name gets unpacked into its relations ("the handler that sets task-queue priority", not "the task queue priority handler").
- **Known first, new last.** Inside a sentence, open from what the reader already holds and land the news at the end; a sentence whose link to the previous one isn't findable in its first words sends the reader searching backwards, and the search is where they quit. (Unit order and sentence order differ: the unit opens with its news; each sentence delivers that news anchored on what is already shared.)
- **Concrete anchors.** Ground each abstraction in a named instance — the actual function, the real value, a worked example. Evaluative labels ("safe", "fast", "simple") are claims until the mechanism or measurement appears. A number arrives inside its miniature story — who did what, what moved — never as a bare delta or citation ID.
- **Locally complete.** Every sentence decodes with what the reader is holding: no forward references ("as we'll see"), no recall demands ("per principle 4 above") — restate in place. For expert readers, cut the inferences they will draw themselves, but never the referential and logical links: cohesion costs an expert nothing, and a missing connective costs everyone.

## Shape

- **Form follows the information's shape.** Causality, rationale, and tradeoffs take connected prose — a list fragments an argument and measurably drains recall of the prose around it. Parallel discrete items (steps, options, parameters) take a list. N items × M attributes takes a table. Choose the form as an explicit step; when unsure, prose.
- **Lists hold parallel items only.** Each item the same kind of thing, no paragraphs disguised as bullets, and consecutive items never opening with the same words — readers skip repeated lead words wholesale.
- **Headings when there is something to navigate.** Multi-topic or long answers get keyword-first, sentence-case headings; marking structure helps even expert readers. A short single-topic answer wearing headings is costume. Bold is a budget: a few load-bearing phrases a scanner must not miss — emphasis works by contrast, and it helps the reader find, not remember.
- **Paragraphs break at idea boundaries** and stay short on screens; a block that fills the viewport reads as skippable.
- **No more markup than the content demands.** Raters reward lists, bold, and headers; readers don't understand more, heavy formatting fragments reasoning, and it now reads as machine output. Emoji only on request.

## Cut

- **Relevance is the admission test.** Every sentence either advances the reader's understanding of the subject or helps them judge it. Interesting-but-irrelevant material measurably reduces retention of everything around it — cut asides and color even when they're good.
- **Cut performative sentences.** Importance-signaling, expertise-signaling, throat-clearing, and closing recaps ("In summary…"): end when the answer ends.
- **A hedge must carry information.** Name the specific uncertainty and its consequence ("I didn't run the migration, so the timing claim is untested"), then stop. Blanket disclaimers and reflexive qualifiers spend attention and trust on nothing. Padding is also a diagnostic — verbose answers are disproportionately wrong ones — so treat the urge to pad as a prompt to verify, not to write.

## Register

Readers cannot tell machine text from human text by content; they judge by surface tells, and text read as machine-made takes a persistent trust penalty — the reader stops reading and starts auditing. Polish is not protection: fluent, comprehensive delivery measurably lowers scrutiny of wrong claims. Write to be checkable, not impressive.

- **Fingerprint words.** Where a plain word exists, these are banned: delve, showcase, boast, underscore (as a verb), tapestry, realm, testament, pivotal, meticulous, intricate, foster, vibrant, "rich" (figurative). They are corpus-measured signatures of machine prose; write the plain verb or nothing.
- **Fingerprint constructions, each with its repair.** Reflex "not just X — Y" frames (contrast is for correcting a misreading the reader actually has, not manufacturing one to sound sharp); "serves as / functions as / boasts" (write "is" or "has"); trailing-participle analysis ("…, highlighting the importance of…": make the consequence its own claim or end the sentence); adjective triplets by default (three slots invite one filler); chained sentence-openers "Moreover… Furthermore… Additionally…" (a real connective sits inside the thought; essay glue fakes flow); puffery ("plays a vital role", "stands as a testament": state the actual role); vague authority ("observers note", "industry reports": name the source or drop the claim).
- **Em dashes in moderation.** One is punctuation; several per paragraph is a fingerprint. Rewrite the extras as separate sentences or commas.
- **No flattery, no validation.** "Great question", "You're absolutely right", and agreement-first framing read as insincere and measurably reduce trust. Answer.

## Check

The curse of knowledge is why this pass is mechanical rather than felt. Before sending, verify:

1. The first sentence is the answer or outcome — delete it if it only announces, restates, or warms up.
2. Headings plus first sentences reconstruct the message.
3. Causal reasoning is in prose; every list is parallel items; every table is enumerable facts.
4. No fingerprint words or constructions; every hedge names its uncertainty.
5. Truncated at any section boundary, what the reader has is true, self-standing, and not misleading — the **cut test**.

When a reader says they're lost, the miss is usually a missing premise, not excess words: re-ground in what they already know and supply the premise — don't merely shorten.

## Scope and upkeep

This skill governs prose for human readers. Documents written for agents to read — skills, prompts, rules — follow the proompting and skill-format skills instead: there explanation is waste; here it is the product.

Every rule above is graded and sourced in [EVIDENCE.md](EVIDENCE.md), which also holds the debunked advice that must not re-enter (sentence-length comprehension percentages, "7±2", always-active-voice, jargon-is-fine-if-defined, readability-formula targets, friction-for-depth). Edit this file under the proompting skill's discipline: read a rule's grade there before weakening or deleting it, and check the Debunked list before admitting a new rule.
