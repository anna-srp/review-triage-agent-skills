import { randomUUID } from 'node:crypto'
import { assistantText, createZooworkClient, isRunFinished, runOutcome } from '@zoowork-ai/sdk'
import { bodyOf, json, secureHeaders } from '../server/http.js'
import { consumeTurn, readState, sameOrigin, setState, TURN_LIMIT } from '../server/session.js'

const JEV_QUESTIONS = {
  action: {
    type: 'choice',
    instructions: 'What should the restaurant do with this review? Health, safety, discrimination, legal threats, or staff-conduct allegations must escalate.',
    criteria: {
      'respond-publicly': 'A public reply is appropriate: ordinary praise, complaints, or factual corrections',
      'respond-privately': 'Better handled by direct message: personal details or account-specific issues',
      'escalate': 'A human must handle it: health, safety, legal risk, discrimination, or staff conduct allegations',
      'ignore': 'Spam, bots, promotion, competitor sniping, or incoherent content',
    },
  },
  tone: {
    type: 'choice',
    instructions: 'If the restaurant responds, which tone fits best?',
    criteria: {
      apologize: 'A service or quality failure needs owning',
      thank: 'Genuine praise deserves gratitude',
      clarify: 'A factual error needs polite correction',
      celebrate: 'Exceptional praise worth amplifying',
    },
  },
  priority: {
    type: 'choice',
    instructions: 'How urgent is handling this review?',
    criteria: {
      immediate: 'Within hours: safety, legal, or viral risk',
      today: 'Same business day: verified service failures',
      'this-week': 'Routine: praise and minor feedback',
    },
  },
}

async function jevDecide(text) {
  const t0 = performance.now()
  const res = await fetch('https://api.typesafe.ai/v1/systemone', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.JEV_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'jev-latest', state: `Customer review of a restaurant: ${text}`, questions: JEV_QUESTIONS }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`jev ${res.status}`)
  const body = await res.json()
  const a = body.answers
  const action = a.action.choice
  return {
    text: text.slice(0, 200),
    action,
    action_conf: a.action.confidence,
    tone: ['escalate', 'ignore'].includes(action) ? null : a.tone.choice,
    priority: a.priority.choice,
    latency_ms: Math.round(performance.now() - t0),
    source: body.model ?? 'jev',
  }
}

async function agentDecide(reviews, send) {
  const apiKey = process.env.ZOOWORK_API_KEY
  const agentId = process.env.ZOOWORK_AGENT_ID
  if (!apiKey?.startsWith('zct_') || !agentId?.startsWith('agt_')) throw new Error('runtime not configured')
  const client = createZooworkClient({ apiKey })
  const session = await client.createSession(agentId, {
    initial_events: [{
      type: 'user.message',
      content: [
        'Before answering, open and read the review-triage-decision skill file and follow its decision schema exactly, in emulated mode.',
        'Triage the following customer reviews for a United States casual restaurant with a $10 pre-authorized gesture cap.',
        'Return ONLY a JSON array, no markdown. One element per review, in order: {"text","action","action_conf","tone","priority"}. text: echo trimmed to 200 chars. tone null when action is escalate or ignore.',
        JSON.stringify(reviews),
      ].join('\n'),
      idempotency_key: `msg_${randomUUID()}`,
    }],
    metadata: { origin: 'review-triage-public-ui' },
  }, `conversation_${randomUUID()}`)

  let text = ''
  let cursor
  const deadline = Date.now() + 100_000
  let attempts = 0
  let finished = false
  while (Date.now() < deadline && attempts < 5 && !finished) {
    attempts += 1
    try {
      for await (const event of client.streamEvents(agentId, session.session_id, { ...(cursor ? { cursor } : {}) })) {
        cursor = event.cursor ?? cursor
        text += assistantText(event)
        if (isRunFinished(event)) { finished = runOutcome(event) === 'succeeded'; break }
      }
    } catch (error) {
      if (error?.status >= 400 && error?.status < 500) throw error
    }
    if (!finished && Date.now() < deadline) await new Promise((r) => setTimeout(r, Math.min(800 * 2 ** attempts, 5_000)))
  }
  const match = text.match(/\[[\s\S]*\]/)
  if (!match) throw new Error('no json from agent')
  let count = 0
  const latencies = []
  for (const d of JSON.parse(match[0])) {
    if (!d || typeof d.action !== 'string') continue
    send({ type: 'decision', decision: { ...d, text: String(d.text ?? '').slice(0, 200), source: 'emulated' } })
    count += 1
  }
  return { count, median: null, source: 'emulated (ZooWork Runtime)' }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' })
  if (!sameOrigin(req)) return json(res, 403, { error: 'Cross-origin request rejected' })

  const raw = bodyOf(req).reviews
  const reviews = Array.isArray(raw) ? raw.map((s) => String(s).trim()).filter(Boolean).slice(0, 5) : []
  if (!reviews.length) return json(res, 400, { error: 'Send 1-5 reviews, one per line.' })
  if (reviews.some((s) => s.length > 500)) return json(res, 400, { error: 'Keep each review under 500 characters.' })

  const usage = consumeTurn(readState(req))
  res.setHeader('X-RateLimit-Limit', String(TURN_LIMIT))
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, TURN_LIMIT - usage.state.used)))
  if (!usage.ok) {
    res.setHeader('Retry-After', String(usage.retryAfter))
    setState(res, usage.state)
    return json(res, 429, { error: 'Hourly limit reached for this browser.', retryAfter: usage.retryAfter })
  }
  setState(res, usage.state)

  secureHeaders(res)
  res.statusCode = 200
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()
  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`)

  try {
    if (process.env.JEV_API_KEY) {
      send({ type: 'status', message: 'Deciding with Jev (System One)…' })
      const results = await Promise.allSettled(reviews.map(jevDecide))
      const ok = results.filter((r) => r.status === 'fulfilled').map((r) => r.value)
      for (const d of ok) send({ type: 'decision', decision: d })
      if (ok.length) {
        const lat = ok.map((d) => d.latency_ms).sort((a, b) => a - b)
        send({ type: 'done', count: ok.length, median_ms: lat[Math.floor(lat.length / 2)], source: ok[0].source })
      } else {
        send({ type: 'error', message: 'Jev is busy — try again in a minute.' })
      }
    } else {
      send({ type: 'status', message: 'Deciding on ZooWork Agent Runtime (emulated System One)…' })
      const out = await agentDecide(reviews, send)
      send({ type: 'done', count: out.count, median_ms: out.median, source: out.source })
    }
    res.end()
  } catch {
    send({ type: 'error', message: 'Review Triage is temporarily unavailable. Try again shortly.' })
    res.end()
  }
}
