---
name: reputation-digest
description: Summarize triage activity, decision statistics, and reputation trends over a period into a short owner-facing digest. Use when the user asks for a summary, report, digest, or what happened this week with reviews. Never modify past decisions here.
---

# Reputation Digest

Tell the owner what happened, what it cost, and what to fix — on one screen.

Keep all user-facing text in English.

## Inputs

Use the logged triage records for the requested period, plus any reply and escalation outcomes available. If no records exist for the period, say so; never fabricate activity.

## Digest rules

- Lead with the number that changed most (volume, average rating, escalations).
- Report decision statistics: total reviews, counts per action, average confidence, how many went to human review, and the decision-source mix (`jev` / `replica` / `emulated`).
- Include the cost story when decision-source data allows it: decisions made by the System One path versus what the same volume would cost in full LLM calls. This is the number owners screenshot.
- Surface at most three recurring themes from review content (e.g., wait times, one dish, shipping speed), each with a one-line suggested operational fix.
- Flag any open escalations still waiting on a human.
- Close with one sentence on trend direction versus the prior period.

## Output contract

Return a digest with:

1. headline metric;
2. decision statistics table;
3. top themes with suggested fixes;
4. open items;
5. trend line sentence.

Keep the whole digest under 250 words.
