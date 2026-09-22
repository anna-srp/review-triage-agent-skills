import baked from './baked-150.json'

const $ = (id) => document.getElementById(id)
const laneOf = (a) =>
  a === 'escalate' ? 'escalate' : a === 'respond-privately' ? 'private' : a === 'ignore' ? 'ignore' : 'respond'
const stars = (n) => '★'.repeat(n ?? 0)

// ---- deterministic pixel avatar (8x8 mirrored, seeded by id) ----
const SKIN = ['#f2c9a0', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#a5694f']
const HAIR = ['#2d2d2d', '#5a3825', '#b55239', '#e8c25a', '#7a7a7a', '#3b2a55', '#1d4d8f', '#207a4b']
const SHIRT = ['#2a78d6', '#1baf7a', '#eda100', '#e34948', '#6b5bd2', '#d55181', '#1f8a99', '#75746f']
function seeded(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
}
function avatarURL(id) {
  const rnd = seeded(id)
  const skin = SKIN[(rnd() * SKIN.length) | 0]
  const hair = HAIR[(rnd() * HAIR.length) | 0]
  const shirt = SHIRT[(rnd() * SHIRT.length) | 0]
  const hairTop = 1 + ((rnd() * 2) | 0)          // hair depth
  const hasSide = rnd() > 0.4
  const eyeRow = 3 + ((rnd() * 2) | 0)
  const c = document.createElement('canvas')
  c.width = 8; c.height = 8
  const x = c.getContext('2d')
  x.fillStyle = '#eceae2'; x.fillRect(0, 0, 8, 8)
  // head 2..5 cols mirrored via symmetric draw
  for (let row = 1; row <= 5; row++) for (let col = 2; col <= 5; col++) { x.fillStyle = skin; x.fillRect(col, row, 1, 1) }
  // hair
  for (let row = 0; row < hairTop; row++) for (let col = 2; col <= 5; col++) { x.fillStyle = hair; x.fillRect(col, row, 1, 1) }
  if (hasSide) { x.fillStyle = hair; x.fillRect(1, 1, 1, 2); x.fillRect(6, 1, 1, 2) }
  // eyes
  x.fillStyle = '#1c1c1e'; x.fillRect(3, eyeRow, 1, 1); x.fillRect(5 - 1, eyeRow, 1, 1)
  // shirt
  x.fillStyle = shirt
  for (let col = 1; col <= 6; col++) x.fillRect(col, 6, 1, 1)
  for (let col = 0; col <= 7; col++) x.fillRect(col, 7, 1, 1)
  return c.toDataURL()
}

// ---- board setup: messy pile ----
const board = $('board')
const pileStage = $('pile-stage')
const bins = $('bins')
const counters = { respond: $('c-respond'), escalate: $('c-escalate'), private: $('c-private'), ignore: $('c-ignore') }
const tick = { count: $('t-count'), latency: $('t-latency'), cost: $('t-cost'), escalated: $('t-escalated') }

const notes = []
function buildPile() {
  const W = board.clientWidth
  const H = board.clientHeight
  baked.forEach((d, i) => {
    const rnd = seeded(d.id + 'pos')
    const note = document.createElement('button')
    note.type = 'button'
    note.className = 'note'
    note.dataset.idx = String(i)
    const av = avatarURL(d.id)
    note.innerHTML = `
      <img class="avatar" src="${av}" width="26" height="26" alt="">
      <span class="n-body">
        <span class="n-stars">${stars(d.stars)}</span>
        <span class="n-text">${d.text}</span>
      </span>
      <span class="n-badge"></span>`
    const x = 8 + rnd() * (W - 190)
    const y = 8 + rnd() * (H - 90)
    const rot = (rnd() - 0.5) * 22
    note.style.left = `${x}px`
    note.style.top = `${y}px`
    note.style.transform = `rotate(${rot}deg)`
    note.style.zIndex = String(3 + ((rnd() * 10) | 0))
    note.dataset.avatar = av
    note.addEventListener('click', () => openModal(i))
    pileStage.appendChild(note)
    notes.push(note)
  })
}

// ---- sort animation: FLIP each note into its bin slot ----
let sorted = false
async function runSort() {
  if (sorted) return
  sorted = true
  $('run-btn').style.display = 'none'
  bins.hidden = false
  requestAnimationFrame(() => bins.classList.add('show'))

  const grids = { respond: $('bin-respond'), escalate: $('bin-escalate'), private: $('bin-private'), ignore: $('bin-ignore') }
  const placed = { respond: 0, escalate: 0, private: 0, ignore: 0 }
  const total = { respond: 0, escalate: 0, private: 0, ignore: 0 }
  let done = 0, escalated = 0, cost = 0
  const boardRect = board.getBoundingClientRect()

  // measure real sorted-note size once, then size each bin's grid capacity from its actual box
  const NOTE_W = 148, NOTE_H = 78, GAP = 6
  const layout = {}
  for (const lane of Object.keys(grids)) {
    const grid = grids[lane].getBoundingClientRect()
    const cols = Math.max(1, Math.floor((grid.width + GAP) / (NOTE_W + GAP)))
    const rows = Math.max(1, Math.floor((grid.height + GAP) / (NOTE_H + GAP)))
    layout[lane] = { grid, cols, cap: cols * rows }
  }

  function slotXY(lane) {
    const { grid, cols } = layout[lane]
    const k = placed[lane]
    const col = k % cols
    const row = (k / cols) | 0
    const usable = grid.width - cols * NOTE_W - (cols - 1) * GAP
    return {
      x: grid.left - boardRect.left + usable / 2 + col * (NOTE_W + GAP),
      y: grid.top - boardRect.top + row * (NOTE_H + GAP),
    }
  }

  for (let i = 0; i < baked.length; i++) {
    const d = baked[i]
    const lane = laneOf(d.action)
    const note = notes[i]
    total[lane] += 1
    counters[lane].textContent = String(total[lane])

    const badge = note.querySelector('.n-badge')
    badge.textContent = d.action === 'respond-privately' ? 'private' : d.action.replace('respond-publicly', 'respond')
    badge.className = `n-badge ${lane}`
    note.classList.add('sorted', `is-${lane}`)

    if (placed[lane] < layout[lane].cap) {
      const { x, y } = slotXY(lane)
      placed[lane] += 1
      note.style.transition = 'left .5s cubic-bezier(.2,.85,.3,1), top .5s cubic-bezier(.2,.85,.3,1), transform .5s ease'
      note.style.left = `${x}px`
      note.style.top = `${y}px`
      note.style.transform = 'rotate(0deg)'
      note.style.zIndex = '6'
    } else {
      // fade into the bin's counter instead of overflowing
      const grid = grids[lane].getBoundingClientRect()
      note.style.transition = 'left .45s ease, top .45s ease, transform .45s ease, opacity .4s ease .15s'
      note.style.left = `${grid.left - boardRect.left + grid.width / 2 - 70}px`
      note.style.top = `${grid.top - boardRect.top + grid.height - 50}px`
      note.style.transform = 'rotate(0deg) scale(.5)'
      note.style.opacity = '0'
      setTimeout(() => { note.style.display = 'none' }, 700)
    }

    done += 1
    if (lane === 'escalate') escalated += 1
    cost += (d.input_tokens ?? 620) / 1e6 * 0.042
    tick.count.textContent = String(done)
    tick.escalated.textContent = String(escalated)
    tick.cost.textContent = cost.toFixed(4)
    tick.latency.textContent = String(d.latency_ms ?? 296)

    await new Promise((r) => setTimeout(r, 30))
  }
  tick.latency.textContent = '296'
  $('machine-note').innerHTML = 'Sorted. <b>Click any review</b> — the ones in <span style="color:var(--c-respond);font-weight:700">Respond</span> already have their reply written by the agent. <span style="color:var(--c-escalate);font-weight:700">Escalate</span> is waiting for a human, on purpose.'
}

$('run-btn').addEventListener('click', runSort)

// ---- modal ----
const modal = $('modal')
const modalBody = $('modal-body')
function openModal(i) {
  const d = baked[i]
  const lane = laneOf(d.action)
  const isReply = !!d.reply
  modalBody.innerHTML = `
    <div class="m-head">
      <img class="avatar" src="${notes[i].dataset.avatar}" width="44" height="44" alt="">
      <div>
        <div class="m-stars">${stars(d.stars)}</div>
        <div class="m-platform">${d.platform} review</div>
      </div>
    </div>
    <div class="m-review">“${d.text}”</div>
    <div class="m-decision">
      <span class="badge ${lane}">${d.action}</span>
      ${d.tone ? `<span class="badge plain">${d.tone}</span>` : ''}
      <span class="badge plain">${d.priority}</span>
      <span class="badge plain">conf ${(d.action_conf ?? 0).toFixed(2)}</span>
    </div>
    <div class="m-latency">decided by ${d.model ?? 'jev-1.13.0'} in ${d.latency_ms}ms</div>
    ${isReply ? `
      <div class="m-reply-label"><span class="dot-ok"></span> ${d.action === 'respond-privately' ? 'Private reply — drafted & sent' : 'Public reply — drafted & posted'}</div>
      <div class="m-reply">${d.reply}</div>
      <div class="m-posted">✓ auto-handled by the agent · gesture cap $10 respected</div>
    ` : `
      <div class="m-reply-label">${lane === 'escalate' ? 'Internal note — a human owns this' : 'Internal note — logged, no reply'}</div>
      <div class="m-reply ${lane === 'escalate' ? 'is-note' : 'is-ignore'}">${d.note ?? ''}</div>
      ${lane === 'escalate' ? '<div class="m-posted" style="color:var(--c-escalate)">⚠ never auto-replied — safety, legal & conduct always go to a person</div>' : ''}
    `}`
  modal.hidden = false
  document.body.style.overflow = 'hidden'
}
function closeModal() { modal.hidden = true; document.body.style.overflow = '' }
$('modal-close').addEventListener('click', closeModal)
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal() })
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closeModal() })

// build pile once layout is ready
requestAnimationFrame(buildPile)

// ---- live triage ----
const liveRun = $('live-run')
const liveInput = $('live-input')
const liveStatus = $('live-status')
const liveOutput = $('live-output')

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
        if (evt.type === 'done') liveStatus.textContent = `${evt.count} decision(s) · median ${evt.median_ms ?? '—'}ms · ${evt.source}`
        if (evt.type === 'error') liveStatus.textContent = evt.message
      }
    }
  } catch {
    liveStatus.textContent = 'Busy right now — the board above is a real run; try again in a minute.'
  } finally {
    liveRun.disabled = false
  }
})

// copy prompt
$('copy-prompt').addEventListener('click', async (e) => {
  await navigator.clipboard.writeText($('fork-prompt').textContent)
  e.target.textContent = 'Copied ✓'
  setTimeout(() => { e.target.textContent = 'Copy prompt' }, 1600)
})
