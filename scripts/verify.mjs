import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  ZooworkError,
  assistantText,
  createZooworkClient,
  isRunFinished,
  runOutcome,
  toolCall,
} from '@zoowork-ai/sdk'

const root = process.cwd()
const statePath = path.join(root, '.zoowork', 'review-triage-agent.json')
const verificationPath = path.join(root, '.zoowork', 'review-triage-verification.json')
const expectedSkill = 'review-triage-decision'

async function loadEnv() {
  if (process.env.ZOOWORK_API_KEY?.startsWith('zct_')) return

  const raw = await readFile(path.join(root, '.env'), 'utf8')
  const line = raw.split(/\r?\n/).find((entry) => entry.startsWith('ZOOWORK_API_KEY='))
  if (!line) throw new Error('ZOOWORK_API_KEY is missing from .env')
  let value = line.slice('ZOOWORK_API_KEY='.length).trim()
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1)
  }
  if (!value.startsWith('zct_')) throw new Error('ZOOWORK_API_KEY in .env is not a zct_ key')
  process.env.ZOOWORK_API_KEY = value
}

function usedExpectedSkill(calls) {
  const input = calls.map((call) => JSON.stringify(call.args ?? {})).join('\n')
  return input.includes(`/skills/${expectedSkill}/`) || input.includes(`${expectedSkill}/SKILL.md`)
}

async function streamVerification(zc, agentId, sessionId, budgetMs = 120_000) {
  const deadline = Date.now() + budgetMs
  const calls = []
  let cursor
  let response = ''

  for (let attempt = 0; attempt < 4 && Date.now() < deadline; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), Math.max(1, deadline - Date.now()))

    try {
      for await (const event of zc.streamEvents(agentId, sessionId, {
        ...(cursor ? { cursor } : {}),
        signal: controller.signal,
      })) {
        cursor = event.cursor ?? cursor
        response += assistantText(event)
        const call = toolCall(event)
        if (call?.phase === 'start') calls.push(call)

        if (isRunFinished(event)) {
          return {
            outcome: runOutcome(event),
            response: response.trim(),
            calls,
          }
        }
      }
    } catch (error) {
      if (error instanceof ZooworkError && error.status >= 400 && error.status < 500) throw error
      if (Date.now() >= deadline) throw error
    } finally {
      clearTimeout(timer)
      controller.abort()
    }

    if (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(1_000 * 2 ** attempt, 5_000)))
    }
  }

  throw new Error('Quick verification did not finish within 120 seconds')
}

await loadEnv()
const state = JSON.parse(await readFile(statePath, 'utf8'))
if (!state.agentId) throw new Error('Run npm run deploy before npm run verify')

const zc = createZooworkClient()
await zc.waitUntilRunning(state.agentId, { timeoutMs: 60_000 })

const runKey = `review-triage-quick-check-${Date.now()}`
const session = await zc.createSession(state.agentId, {
  initial_events: [{
    type: 'user.message',
    idempotency_key: `${runKey}-verify`,
    content: [
      "This is a fast deployment verification for an English-language United States review-operations Agent.",
      "Before answering, open and read the review-triage-decision skill file (review-triage-decision/SKILL.md) and follow its decision schema and output contract exactly, in emulated mode.",
      "Triage these three sample reviews for a casual restaurant with a $10 pre-authorized gesture cap:",
      "R1 (2 stars, Google): 'Waited 45 minutes for a burger that arrived cold. Server was apologetic but kitchen was clearly slammed.'",
      "R2 (5 stars, Yelp): 'The mushroom ramen is the best thing I've eaten all year. Ask for extra chili crisp!'",
      "R3 (1 star, Google): 'Found a piece of plastic in my salad. I have photos and I am contacting the health department.'",
      "Return only the structured triage records and the batch summary line. Do not draft any replies, produce any briefing, call any external decision endpoint, or access the web.",
    ].join('\n'),
  }],
  metadata: { origin: 'review-triage-quick-verification' },
}, runKey)

const startedAt = Date.now()
const turn = await streamVerification(zc, state.agentId, session.session_id)
if (turn.outcome !== 'succeeded') throw new Error(`Quick verification ended with ${turn.outcome}`)
if (!usedExpectedSkill(turn.calls)) {
  throw new Error(`Runtime replied but did not consult ${expectedSkill}`)
}
if (!turn.response) throw new Error('Runtime verification returned no assistant response')

const result = {
  status: 'passed',
  mode: 'quick-no-render',
  agentId: state.agentId,
  sessionId: session.session_id,
  verifiedSkill: expectedSkill,
  renderedMedia: false,
  durationMs: Date.now() - startedAt,
  completedAt: new Date().toISOString(),
}

await writeFile(verificationPath, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 })
console.log(JSON.stringify(result, null, 2))
