# Review Triage Agent Skills

A portable, English-language Skill pack for a **review-operations digital employee** for United States online businesses (restaurants, e-commerce, local services), built to run on ZooWork Agent Runtime.

It demonstrates the **System One decision pattern** popularized by TypeSafe's Jev: triage decisions are made against a fixed, predeclared schema with a confidence score — never as free-form text. Generative effort is spent only where it matters: drafting replies and briefing humans on escalations.

**A digital employee makes thousands of small decisions a day. Decisions and text generation are different jobs — this pack treats them that way.**

## Fast start

1. Clone this repository and open it in Codex or Claude Code.
2. Copy [SHORT_PROMPT.md](SHORT_PROMPT.md) for email or a web page, or use the complete [PROMPT.md](PROMPT.md) for explicit implementation details.
3. Create a ZooWork API key, save it in a local ignored `.env` file, and tell the assistant when it is ready. Never paste it into chat.
4. The assistant runs the checked-in setup and performs one bounded, emulated-mode triage verification on three sample reviews.
5. It then builds an original review-inbox UI and deploys it to a publicly accessible URL.

The API key is the only value entered manually. The Agent ID is created, stored, and reused automatically.

## Decision modes

| Mode | What decides | When |
|---|---|---|
| `emulated` (default) | The Agent's own model enumerates and scores the schema options in one pass | Works for every user with no extra key |
| `jev` | TypeSafe's Jev decision endpoint | When `JEV_API_KEY` is configured |
| `replica` | An open-source Jev-style replica (e.g. Kev, Bespoke Nimble) | When a compatible endpoint is configured |

The output contract is identical in all three modes, so a deployment upgrades transparently from emulated to a true System One endpoint — and every decision record notes its source.

## Fast setup versus real use

| Mode | What it does | When to use it |
|---|---|---|
| Fast setup | Incremental deployment plus one emulated triage turn on three checked-in sample reviews | Default installation |
| Real request | Triage of the user's actual reviews, reply drafting, escalation briefings, digests | First actual use |

Fast setup intentionally avoids external decision endpoints, live platform connections, and web access. The quick Runtime turn has a two-minute hard budget.

## Included Skills

| User intent | Runtime Skill | Purpose |
|---|---|---|
| Decide what to do with incoming reviews | `review-triage-decision` | Schema-based action/tone/compensation/priority decisions with confidence |
| Write the public or private reply | `review-reply-drafting` | Voice-consistent replies honoring the decided tone and compensation |
| Brief a human on a serious review | `escalation-briefing` | 90-second internal briefings with severity, owner, and next steps |
| Summarize the week | `reputation-digest` | Owner-facing digest with decision statistics and the cost story |

## Boundaries

- All user-facing conversation and UI copy are English only; United States market context.
- Reviews, ratings, and statistics come only from user-supplied or authorized sources; never invented.
- Public replies never admit legal liability, exceed the configured compensation cap, or expose private customer data.
- Health, safety, discrimination, legal, and staff-conduct matters always escalate to a human.
- Low-confidence decisions (below 0.75 by default) route to human review instead of guessing.
- `zoowork-managed-agents` belongs in the development assistant; the four repository Skills belong on the Runtime Agent.
