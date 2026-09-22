---
name: escalation-briefing
description: Prepare a concise internal briefing for a review that triage routed to escalate, including severity, recommended owner, suggested next steps, and a holding reply if appropriate. Use only for escalate decisions. Never publish anything publicly from this skill.
---

# Escalation Briefing

Give a human everything needed to act in ninety seconds of reading.

Keep all user-facing text in English. Everything produced here is internal.

## Inputs

Require: the review, its triage record, and the business profile (escalation contacts and categories if configured). If the triage record is missing or is not `escalate`, send it back to triage.

## Briefing rules

- Classify severity: `health-safety` | `legal-threat` | `staff-conduct` | `discrimination-claim` | `major-service-failure` | `other`.
- State facts from the review only; clearly separate the customer's claims from verified information. Never treat an allegation as established fact.
- Recommend one owner (from configured contacts or by role) and up to three concrete next steps in order.
- Recommend whether a public holding reply is wise. When it is, include one — neutral, non-admitting, promising follow-up without a deadline the business might miss.
- Include a response-window recommendation tied to the triage priority (`immediate` → within hours).

## Output contract

Return a briefing block:

1. one-line summary (severity + platform + rating);
2. what the customer claims;
3. what we know vs. what needs verification;
4. recommended owner and next steps;
5. holding reply text, or the reason none should be posted yet.
