# Asking the reader to decide

Follow this for every item that asks the reader to decide something, such as a report's "Needs a decision" list.

Write for a reader who knows what the work was for and nothing below it: not the code, not the comment, failure, or finding that raised the item, and not what happened during the work. Whoever writes the item has been inside that detail and will write in its terms unless they translate.

Each item, in this order:

1. **The question**, in bold, framed by what the product or system does differently depending on the answer, not by the finding or the code that raised it.
2. **The situation**, in a short paragraph: what triggers it, what happens today when it does, how often if known, and who or what pays for it. Describe a piece of code by what it does; add its name only when the reader will need it to find or discuss it.
3. **The options**, one bullet each, including leaving it as it is when that is viable: what changes for the reader's users or system, and what it costs (size of the change, what it makes worse in the common case such as latency or friction, risk, what it rules out).
4. **The pick**: the option you would take, and the one reason that decides it.
5. **Meanwhile**: what was done until the reader answers, such as leaving the thread open or the code unchanged.
6. **Where**: the link to the thread, check, or line, last, for a reader who wants to look.

Done when a reader who knows only what the work was for could choose an option from the item alone, without opening the link.

Example, for a PR that marks reviews as degraded when an integration they rely on fails:

Bad:

> `tokens.ts:387`: the catch adds the key to `disconnected` even after the connection is deleted, so `integration_disconnected` is reported. Direction: skip removed connections.

Better:

> **Should a review be marked degraded when an admin removes an integration while the review runs?**
> If an admin deletes an integration at the moment a review is fetching its credentials, the review records the integration as disconnected and shows as degraded, though nothing broke: the admin removed it on purpose. Both have to happen at the same moment, and the cost is one review with a wrong label.
>
> - Check that the integration still exists before recording it as disconnected: a small change on that one failure path.
> - Leave it: an occasional wrong "degraded" label; no data is affected.
>
> I'd leave it, since the worst case is a wrong label on one review. The comment thread stays open until you decide.
> [thread](https://github.com/…) · `packages/common/utils/tokens.ts:387`
