import baked from './baked-triage.json'

const reviewById = Object.fromEntries(baked.reviews.map((r) => [r.id, r]))
const decisions = baked.decisions

const stream = document.getElementById('stream')
const stat = {
  decisions: document.getElementById('stat-decisions'),
  reviews: document.getElementById('stat-reviews'),
  time: document.getElementById('stat-time'),
  cost: document.getElementById('stat-cost'),
  escalated: document.getElementById('stat-escalated'),
}

function stars(n) { return '★'.repeat(n) + '☆'.repeat(5 - n) }
function actionClass(a) {
  if (a === 'escalate') return 'escalate'
  if (a === 'ignore') return 'ignore'
  return 'respond'
}

function card(review, d) {
  const el = document.createElement('article')
  el.className = `card ${actionClass(d.action)}`
  const conf = Math.round((d.action_conf ?? 0) * 100)
  el.innerHTML = `
    <div class="card-meta">
      <p class="card-stars">${stars(review.stars)}</p>
      <p class="card-platform">${review.platform}</p>
    </div>
    <div class="card-body">
      <p>&ldquo;${review.text}&rdquo;</p>
      <p class="card-reason">${d.reason ?? ''}</p>
    </div>
    <div class="card-decision">
      <div class="badges">
        <span class="badge badge-action ${actionClass(d.action)}">${d.action}</span>
        ${d.tone ? `<span class="badge badge-tone">${d.tone}</span>` : ''}
        <span class="badge badge-priority ${d.priority}">${d.priority}</span>
      </div>
      <div class="conf">
        <div class="conf-track"><div class="conf-fill" data-w="${conf}"></div></div>
        <span class="conf-num">${(d.action_conf ?? 0).toFixed(2)}</span>
      </div>
    </div>`
  return el
}

function countUp(el, target, ms, decimals = 0) {
  const start = performance.now()
  function tick(now) {
    const p = Math.min(1, (now - start) / ms)
    const eased = 1 - (1 - p) ** 3
    el.textContent = (target * eased).toFixed(decimals)
    if (p < 1) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

let running = false
async function runStream() {
  if (running) return
  running = true
  stream.innerHTML = ''
  stat.reviews.textContent = String(decisions.length)
  const t0 = performance.now()
  let made = 0
  let escalated = 0

  for (const d of decisions) {
    const review = reviewById[d.id]
    if (!review) continue
    const el = card(review, d)
    stream.appendChild(el)
    requestAnimationFrame(() => {
      const fill = el.querySelector('.conf-fill')
      if (fill) fill.style.width = `${fill.dataset.w}%`
    })
    made += d.tone ? 4 : 3
    if (d.action === 'escalate') escalated += 1
    stat.decisions.textContent = String(made)
    stat.escalated.textContent = String(escalated)
    stat.time.textContent = ((performance.now() - t0) / 1000).toFixed(1)
    // System One pacing: decisions land fast
    await new Promise((r) => setTimeout(r, 240 + Math.random() * 160))
  }
  stat.time.textContent = ((performance.now() - t0) / 1000).toFixed(1)
  countUp(stat.cost, 0.001, 400, 3)
  running = false
}

document.getElementById('run-demo').addEventListener('click', () => {
  document.querySelector('.stream-region').scrollIntoView({ behavior: 'smooth', block: 'start' })
  runStream()
})

// auto-run once when the stream scrolls into view
const observer = new IntersectionObserver((entries) => {
  if (entries.some((e) => e.isIntersecting)) {
    observer.disconnect()
    runStream()
  }
}, { threshold: 0.25 })
observer.observe(document.querySelector('.stream-region'))

// ---- live triage ----
const liveRun = document.getElementById('live-run')
const liveInput = document.getElementById('live-input')
const liveStatus = document.getElementById('live-status')
const liveOutput = document.getElementById('live-output')

function liveCard(d) {
  const el = document.createElement('article')
  el.className = `card ${actionClass(d.action)}`
  const conf = Math.round((d.action_conf ?? 0) * 100)
  el.innerHTML = `
    <div class="card-meta">
      <p class="card-stars">${d.stars ? stars(d.stars) : '—'}</p>
      <p class="card-platform">yours</p>
    </div>
    <div class="card-body">
      <p>&ldquo;${(d.text ?? '').slice(0, 220)}&rdquo;</p>
      <p class="card-reason">${d.reason ?? ''}</p>
    </div>
    <div class="card-decision">
      <div class="badges">
        <span class="badge badge-action ${actionClass(d.action)}">${d.action}</span>
        ${d.tone ? `<span class="badge badge-tone">${d.tone}</span>` : ''}
        <span class="badge badge-priority ${d.priority}">${d.priority}</span>
      </div>
      <div class="conf">
        <div class="conf-track"><div class="conf-fill" data-w="${conf}"></div></div>
        <span class="conf-num">${(d.action_conf ?? 0).toFixed(2)}</span>
      </div>
    </div>`
  requestAnimationFrame(() => {
    const fill = el.querySelector('.conf-fill')
    if (fill) fill.style.width = `${fill.dataset.w}%`
  })
  return el
}

liveRun.addEventListener('click', async () => {
  const lines = liveInput.value.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 5)
  if (!lines.length) { liveStatus.textContent = 'Paste at least one review first.'; return }
  liveRun.disabled = true
  liveOutput.innerHTML = ''
  liveStatus.textContent = 'Opening a private session on ZooWork Agent Runtime…'
  try {
    const res = await fetch('/api/triage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviews: lines }),
    })
    if (res.status === 429) {
      liveStatus.textContent = 'This browser hit its hourly limit — fork the repo to run unlimited.'
      return
    }
    if (!res.ok || !res.body) throw new Error('bad response')
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const frames = buffer.split('\n\n')
      buffer = frames.pop() ?? ''
      for (const frame of frames) {
        const line = frame.split('\n').find((l) => l.startsWith('data: '))
        if (!line) continue
        const evt = JSON.parse(line.slice(6))
        if (evt.type === 'status') liveStatus.textContent = evt.message
        if (evt.type === 'decision') liveOutput.appendChild(liveCard(evt.decision))
        if (evt.type === 'done') liveStatus.textContent = `Done — ${evt.count} review(s) triaged on the live agent.`
        if (evt.type === 'error') liveStatus.textContent = evt.message
      }
    }
  } catch {
    liveStatus.textContent = 'The live agent is busy right now — the replay above is a real run; try again in a minute.'
  } finally {
    liveRun.disabled = false
  }
})

// copy prompt
document.getElementById('copy-prompt').addEventListener('click', async (e) => {
  const text = document.getElementById('fork-prompt').textContent
  await navigator.clipboard.writeText(text)
  e.target.textContent = 'Copied ✓'
  setTimeout(() => { e.target.textContent = 'Copy prompt' }, 1600)
})
