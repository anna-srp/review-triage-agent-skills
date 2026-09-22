# Build, Verify, and Publicly Deploy Review Triage

Copy everything below this line into a new Codex or Claude Code conversation.

---

Build, verify, and publicly deploy the English-language United States Review Triage Agent using this public Skill Pack:
https://github.com/anna-srp/review-triage-agent-skills

Open or download the repository. Read its README.md, PROMPT.md, Agent Persona, and all four Skills, and treat them as the source of truth. Install and follow ZooWork's official development Skill.

When you need my ZooWork API key, ask once and configure it as ZOOWORK_API_KEY for this local project. Keep it out of source code, browser code, logs, and Git. Never print the key back to me.

Create or reuse one persistent Review Triage Agent, attach its four Skills, start it on ZooWork Agent Runtime, and run the repository's bounded emulated-mode verification on the checked-in sample reviews. Preserve its decision-schema, confidence-threshold, and escalation boundaries.

After verification passes, reuse the same Agent and build a lightweight, original public UI shaped like a review inbox: a paste-reviews box (one review per line, or a small CSV), example reviews, a triage-results table showing action, tone, compensation, priority, confidence, and one-line reason per review, buttons to draft the reply or escalation briefing for a selected review, a streaming conversation/results view, loading and error states, and New conversation. Keep the API key and Agent ID server-side, create a separate ZooWork Session for each visitor or conversation, keep the public MVP text-only with no live platform connections, and add a basic usage limit. Publish it with a suitable hosting provider and return the public URL.

Finish by reporting the running Agent status, attached Skills, verification result, public URL, and UI test result. Do not stop at a plan or Markdown report.

My additional requirements: [add changes here, or leave as none].
