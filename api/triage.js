import { randomUUID } from 'node:crypto'
import { assistantText, createZooworkClient, isRunFinished, runOutcome } from '@zoowork-ai/sdk'
import { bodyOf, json, secureHeaders } from '../server/http.js'
import { consumeTurn, readState, sameOrigin, setState, TURN_LIMIT } from '../server/session.js'

function runtime() {
  const apiKey = process.env.ZOOWORK_API_KEY
  const agentId = process.env.ZOOWORK_AGENT_ID
  if (!apiKey?.startsWith('zct_')) throw new Error('ZooWork API key is not configured')
  if (!agentId?.startsWith('agt_')) throw new Error('Review Triage Agent is not configured')
  return { client: createZooworkClient({ apiKey }), agentId }
}

const triageInstruction = (reviews) => [
  'Before answering, open and read the review-triage-decision skill file and follow its decision schema exactly, in emulated mode.',
  'Triage the following customer reviews for a United States casual restaurant with a $10 pre-authorized gesture cap.',
  'Return ONLY a JSON array, no markdown, no prose. One element per review, in input order:',
  '{"id","stars","text","action","action_conf","tone","tone_conf","compensation","comp_conf","priority","priority_conf","reason","source"}.',
  'stars: infer 1-5 from the text if stated, else null. text: echo the review, trimmed to 220 chars. tone: null when action is escalate or ignore. reason: one sentence.',
  'Do not draft replies, produce briefings, call external endpoints, or access the web.',
  JSON.stringify(reviews.map((text, i) => ({ id: `U${String(i + 1).padStart(2, '0')}`, text }))),
].join('\n')

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' })
  if (!sameOrigin(req)) return json(res, 403, { error: 'Cross-origin request rejected' })

  const raw = bodyOf(req).reviews
  const reviews = Array.isArray(raw)
    ? raw.map((s) => String(s).trim()).filter(Boolean).slice(0, 5)
    : []
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

  try {
    const { client, agentId } = runtime()
    secureHeaders(res)
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders?.()
    const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`)

    send({ type: 'status', message: 'Session open — the agent is reading its decision schema…' })
    const session = await client.createSession(agentId, {
      initial_events: [{
        type: 'user.message',
        content: triageInstruction(reviews),
        actor: { ref: usage.state.visitorId ?? 'public-visitor' },
        idempotency_key: `msg_${randomUUID()}`,
      }],
      metadata: { origin: 'review-triage-public-ui' },
    }, `conversation_${randomUUID()}`)

    const controller = new AbortController()
    res.on('close', () => { if (!res.writableEnded) controller.abort() })

    let text = ''
    let cursor
    const deadline = Date.now() + 110_000
    let finished = false
    let attempts = 0
    while (!controller.signal.aborted && Date.now() < deadline && attempts < 5 && !finished) {
      attempts += 1
      try {
        for await (const event of client.streamEvents(agentId, session.session_id, {
          ...(cursor ? { cursor } : {}),
          signal: controller.signal,
        })) {
          cursor = event.cursor ?? cursor
          const chunk = assistantText(event)
          if (chunk) {
            if (!text) send({ type: 'status', message: 'Scoring the schema options…' })
            text += chunk
          }
          if (isRunFinished(event)) {
            finished = true
            if (runOutcome(event) !== 'succeeded') send({ type: 'error', message: 'The agent could not finish this turn. Try again.' })
            break
          }
        }
      } catch (error) {
        if (error?.status >= 400 && error?.status < 500) throw error
      }
      if (!finished && !controller.signal.aborted && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(800 * 2 ** attempts, 5_000)))
      }
    }

    const match = text.match(/\[[\s\S]*\]/)
    if (match) {
      let parsed = []
      try { parsed = JSON.parse(match[0]) } catch { /* fall through */ }
      let count = 0
      for (const d of parsed) {
        if (!d || typeof d !== 'object' || typeof d.action !== 'string') continue
        send({
          type: 'decision',
          decision: {
            stars: Number.isInteger(d.stars) ? Math.min(5, Math.max(1, d.stars)) : null,
            text: String(d.text ?? '').slice(0, 220),
            action: String(d.action).slice(0, 24),
            action_conf: typeof d.action_conf === 'number' ? d.action_conf : null,
            tone: d.tone ? String(d.tone).slice(0, 16) : null,
            priority: String(d.priority ?? '').slice(0, 16),
            reason: String(d.reason ?? '').slice(0, 200),
            source: String(d.source ?? 'emulated').slice(0, 12),
          },
        })
        count += 1
      }
      send(count ? { type: 'done', count } : { type: 'error', message: 'No decisions came back. Try simpler review text.' })
    } else if (finished) {
      send({ type: 'error', message: 'The agent replied in an unexpected format. Try again.' })
    } else {
      send({ type: 'error', message: 'The agent is taking too long. Try again in a minute.' })
    }
    res.end()
  } catch {
    if (!res.headersSent) return json(res, 503, { error: 'Review Triage is temporarily unavailable.' })
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'Review Triage is temporarily unavailable.' })}\n\n`)
    res.end()
  }
}
