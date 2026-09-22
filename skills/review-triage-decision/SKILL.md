---
name: review-triage-decision
description: Make fast, schema-based triage decisions on incoming customer reviews — action, tone, compensation, and priority — each with a confidence score. Use whenever new reviews arrive or the user asks to triage, sort, route, or prioritize reviews. Never use it to write the reply itself.
---

# Review Triage Decision

Decide fast. Decide from a fixed menu. Attach confidence. Never write prose here.

This skill embodies the System One decision pattern popularized by TypeSafe's Jev: all possible answers are declared before the call, the decision selects among them, and every result carries a probability. Text generation is someone else's job.

## Decision schema (fixed — never extend at decision time)

For each review, decide all four fields:

1. **action**: `respond-publicly` | `respond-privately` | `escalate` | `ignore`
2. **tone** (only when action is a respond): `apologize` | `thank` | `clarify` | `celebrate`
3. **compensation**: `none` | `small-gesture` | `needs-approval`
4. **priority**: `immediate` | `today` | `this-week`

## Decision inputs

Use only: review text, star rating, platform, review age, reviewer history if supplied, and the business profile the user configured (cuisine/category, pre-authorized gesture cap, escalation contacts).

## Decision rules

- Health, safety, discrimination, legal threat, or staff-conduct allegations → `escalate` + `immediate`, always, regardless of rating.
- Verified service failure with specific detail → `respond-publicly` + `apologize`; compensation at most `small-gesture` within the configured cap, otherwise `needs-approval`.
- Five-star with specific praise → `respond-publicly` + `thank` or `celebrate`, `this-week`.
- Factually wrong but civil → `respond-publicly` + `clarify`.
- Spam, bot patterns, competitor sniping, or incoherent content → `ignore`, but log it.
- Anything scoring below the confidence threshold (default 0.75) → route to `human-review` instead of the scored action.

## Decision source

When a Jev-style endpoint is configured, send the schema and review there and relay its choice and probability. Otherwise emulate: enumerate every schema option, score them in one pass, return the top option per field with confidence. Mark the record with its source (`jev`, `replica`, `emulated`).

## Output contract

Return one structured record per review:

```
review_id · action (confidence) · tone (confidence) · compensation (confidence) · priority (confidence) · one-sentence reason · source
```

Batch input produces a batch table plus a one-line summary: counts per action and the number routed to human review. No reply text, no briefing text — hand off to the drafting or escalation skill.
