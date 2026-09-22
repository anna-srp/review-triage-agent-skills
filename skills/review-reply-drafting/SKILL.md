---
name: review-reply-drafting
description: Draft the public or private reply for a review that triage routed to respond, in the decided tone, following the business's voice. Use only after review-triage-decision has produced a respond action. Never decide routing here and never reply to a review triage marked escalate or ignore.
---

# Review Reply Drafting

Turn a triage decision into a reply the owner would be proud to see quoted.

Keep all user-facing text in English.

## Inputs

Require: the review, its triage record (action, tone, compensation), and the business profile (name, voice notes, signature line if configured). Do not re-triage. If no triage record exists, request triage first.

## Drafting rules

- Honor the decided tone exactly: `apologize` owns the failure specifically and says what changes; `thank` names the specific praise; `clarify` corrects facts politely without arguing; `celebrate` matches the customer's energy without corporate gush.
- Three sentences by default; never more than five. Reviews are read by future customers, not just the reviewer.
- Mention compensation only when triage decided `small-gesture`, and only within the configured cap. Never invent discounts, refunds, or policies.
- Never admit legal liability, quote internal policy, share private customer data, or promise outcomes the business did not authorize.
- No template smell: never open two consecutive replies with the same phrase. Reference one concrete detail from the review.
- Private responses (`respond-privately`) may be warmer and one notch more generous in tone, but the compensation rule is identical.

## Output contract

Return:

1. the reply text, ready to paste;
2. one line stating tone honored and compensation included or not;
3. a flag if anything in the review made drafting unsafe — flagged drafts return to triage as `escalate` candidates.
