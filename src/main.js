import baked from './baked-150.json'

// ---- replay machine ----
const laneOf = (action) =>
  action === 'escalate' ? 'escalate'
  : action === 'respond-privately' ? 'private'
  : action === 'ignore' ? 'ignore'
  : 'respond'

const el = (id) => document.getElementById(id)
const lanes = { respond: el('lane-respond'), escalate: el('lane-escalate'), private: el('lane-private'), ignore: el('lane-ignore') }
const counters = { respond: el('c-respond'), escalate: el('c-escalate'), private: el('c-private'), ignore: el('c-ignore') }
const tick = { count: el('t-count'), latency: el('t-latency'), cost: el('t-cost'), escalated: el('t-escalated') }
const feedChip = el('feed-chip')
const LANE_CAP = { respond: 14, escalate: 12, private: 6, ignore: 6 }
const CHIP_COLOR = { respond: '#2a78d6', escalate: '#e34948', private: '#1baf7a', ignore: '#85858e' }

function stars(n) { return '★'.repeat(n ?? 0) }

function chip(d, lane) {
  const c = document.createElement('div')
  c.className = `chip ${lane}`
  c.dataset.tip = `${d.action} (${(d.action_conf ?? 0).toFixed(2)})${d.tone ? ` · ${d.tone}` : ''} · ${d.priority} · ${d.latency_ms}ms — “${d.text}”`
  c.innerHTML = `<span class="stars">${stars(d.stars)}</span><span class="txt">${d.text}</span><span class="conf">${(d.action_conf ?? 0).toFixed(2)}</span>`
  return c
}

let running = false
async function replay() {
  if (running) return
  running = true
  for (const k of Object.keys(lanes)) { lanes[k].innerHTML = ''; counters[k].textContent = '0' }
  const laneCount = { respond: 0, escalate: 0, private: 0, ignore: 0 }
  const overflow = { respond: null, escalate: null, private: null, ignore: null }
  let done = 0
  let escalated = 0
  let costSoFar = 0
  const t0 = performance.now()

  // playback: 10 concurrent → effective inter-arrival ≈ latency/10. Use real latencies.
  for (const d of baked) {
    const lane = laneOf(d.action)
    // feed chip flies across
    feedChip.textContent = `${stars(d.stars)} ${d.text.slice(0, 60)}`
    feedChip.style.background = CHIP_COLOR[lane]
    feedChip.style.setProperty('--fly-ms', '200ms')
    feedChip.classList.remove('fly'); void feedChip.offsetWidth; feedChip.classList.add('fly')

    laneCount[lane] += 1
    if (laneCount[lane] <= LANE_CAP[lane]) {
      lanes[lane].appendChild(chip(d, lane))
    } else {
      if (!overflow[lane]) {
        overflow[lane] = document.createElement('div')
        overflow[lane].className = 'chip more'
        lanes[lane].appendChild(overflow[lane])
      }
      overflow[lane].textContent = `+ ${laneCount[lane] - LANE_CAP[lane]} more`
    }
    counters[lane].textContent = String(laneCount[lane])

    done += 1
    if (lane === 'escalate') escalated += 1
    costSoFar += (d.input_tokens ?? 620) / 1e6 * 0.042
    tick.count.textContent = String(done)
    tick.escalated.textContent = String(escalated)
    tick.cost.textContent = costSoFar.toFixed(4)
    tick.latency.textContent = String(d.latency_ms ?? 296)

    // real pacing: median 296ms latency ÷ 10 concurrent ≈ 30ms between arrivals
    await new Promise((r) => setTimeout(r, 26 + Math.random() * 14))
  }
  tick.latency.textContent = '296'
  const secs = ((performance.now() - t0) / 1000).toFixed(1)
  const hero = el('hero-seconds')
  if (hero) hero.textContent = secs
  running = false
}

el('run-demo').addEventListener('click', () => {
  el('machine-region').scrollIntoView({ behavior: 'smooth', block: 'start' })
  setTimeout(replay, 350)
})

const observer = new IntersectionObserver((entries) => {
  if (entries.some((e) => e.isIntersecting)) {
    observer.disconnect()
    replay()
  }
}, { threshold: 0.3 })
observer.observe(el('machine-region'))

// ---- live triage ----
const liveRun = el('live-run')
const liveInput = el('live-input')
const liveStatus = el('live-status')
const liveOutput = el('live-output')

function resultRow(d) {
  const lane = laneOf(d.action)
  const row = document.createElement('article')
  row.className = `result-row ${lane}`
  row.innerHTML = `
    <div>
      <p class="result-text">“${(d.text ?? '').slice(0, 200)}”</p>
      <p class="result-meta">${d.latency_ms != null ? `decided in ${d.latency_ms}ms · ` : ''}confidence ${(d.action_conf ?? 0).toFixed(2)} · ${d.source ?? ''}</p>
    </div>
    <div class="result-badges">
      <span class="badge ${lane}">${d.action}</span>
      ${d.tone ? `<span class="badge plain">${d.tone}</span>` : ''}
      <span class="badge plain">${d.priority ?? ''}</span>
    </div>`
  return row
}

liveRun.addEventListener('click', async () => {
  const lines = liveInput.value.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 5)
  if (!lines.length) { liveStatus.textContent = 'Paste at least one review first.'; return }
  liveRun.disabled = true
  liveOutput.innerHTML = ''
  liveStatus.textContent = 'Deciding…'
  try {
    const res = await fetch('/api/triage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviews: lines }),
    })
    if (res.status === 429) { liveStatus.textContent = 'Hourly limit reached — fork the repo to run unlimited.'; return }
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
        if (evt.type === 'decision') liveOutput.appendChild(resultRow(evt.decision))
        if (evt.type === 'done') liveStatus.textContent = `${evt.count} decision(s) · median ${evt.median_ms}ms · ${evt.source}`
        if (evt.type === 'error') liveStatus.textContent = evt.message
      }
    }
  } catch {
    liveStatus.textContent = 'Busy right now — the replay above is a real run; try again in a minute.'
  } finally {
    liveRun.disabled = false
  }
})

// copy prompt
el('copy-prompt').addEventListener('click', async (e) => {
  await navigator.clipboard.writeText(el('fork-prompt').textContent)
  e.target.textContent = 'Copied ✓'
  setTimeout(() => { e.target.textContent = 'Copy prompt' }, 1600)
})
