// Performance profiling of the optimized build (see docs/perf/README.md).
//
//   npm run build && node scripts/profile.mjs [--match-seconds=180] [--cycles=5] [--cycle-seconds=30]
//
// 1. Plays a full 180 s match in a headed Chromium (real GPU) with an aim-and-fire autopilot that
//    uses the real keyboard controls, recording every frame time and per-second entity counts (?perf).
// 2. Runs N cycles of start → play → leave and measures the JS heap and DOM counters after a forced GC.
// Writes docs/perf/results.json, results.md, frame-times-*.svg and samples-*.json.
// 3. A stress match (idle player, spawn every second, up to 40 enemies) shows the worst case.
import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'

const arg = (name, fallback) => Number(process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback)
const MATCH_SECONDS = arg('match-seconds', 180)
const CYCLES = arg('cycles', 5)
const CYCLE_SECONDS = arg('cycle-seconds', 30)
// --only=standard|stress|memory runs a subset and writes docs/perf/investigation-<only>.json instead of the report.
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1]
const PORT = 4173
const BASE = `http://localhost:${PORT}`
const OUT = join(import.meta.dirname, '..', 'docs', 'perf')
const VIEWPORT = { width: 1920, height: 1080 }

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function startPreview() {
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { shell: true, stdio: 'ignore' })
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(BASE)).ok) return server
    } catch {
      // not up yet
    }
    await sleep(500)
  }
  throw new Error('preview server did not start')
}

/** Aim-and-fire autopilot driving the real keyboard listeners; resumes if the window loses focus. */
function startAutopilot(enabled = true) {
  const held = new Set()
  const key = (code, on) => {
    if (on === held.has(code)) return
    if (on) held.add(code)
    else held.delete(code)
    window.dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', { code }))
  }
  window.__autopilotPauses = 0
  const loop = () => {
    const g = window.__PIRATE_TEST__
    if (g && g.store.get().phase === 'paused') {
      window.__autopilotPauses += 1
      g.resume()
    }
    if (enabled && g && g.store.get().phase === 'running') {
      const s = g.sim
      const p = s.player
      let target = null
      for (const e of s.enemies) if (!target || Math.hypot(e.x - p.x, e.y - p.y) < Math.hypot(target.x - p.x, target.y - p.y)) target = e
      if (target) {
        let d = Math.atan2(target.y - p.y, target.x - p.x) - p.angle
        d = Math.atan2(Math.sin(d), Math.cos(d))
        const dist = Math.hypot(target.x - p.x, target.y - p.y)
        key('KeyD', d > 0.05)
        key('KeyA', d < -0.05)
        key('Space', Math.abs(d) < 0.25)
        key('KeyW', dist > 300)
        key('KeyQ', Math.abs(d + Math.PI / 2) < 0.3)
        key('KeyE', Math.abs(d - Math.PI / 2) < 0.3)
      }
    }
    window.__autopilot = requestAnimationFrame(loop)
  }
  loop()
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]
}

function frameStats(frames) {
  const totalMs = frames.reduce((a, b) => a + b, 0)
  return {
    frames: frames.length,
    seconds: +(totalMs / 1000).toFixed(1),
    avgFps: +(frames.length / (totalMs / 1000)).toFixed(1),
    avgMs: +(totalMs / frames.length).toFixed(2),
    p50Ms: +percentile(frames, 50).toFixed(2),
    p95Ms: +percentile(frames, 95).toFixed(2),
    p99Ms: +percentile(frames, 99).toFixed(2),
    maxMs: +Math.max(...frames).toFixed(2),
    over20Ms: frames.filter((f) => f > 20).length,
    over33Ms: frames.filter((f) => f > 33.4).length,
  }
}

function chartSvg(frames, samples) {
  const W = 900
  const H = 260
  const pad = 40
  // Per-second max and average frame time.
  const perSecond = []
  let acc = 0
  let bucket = []
  for (const f of frames) {
    bucket.push(f)
    acc += f
    if (acc >= 1000) {
      perSecond.push({ avg: bucket.reduce((a, b) => a + b, 0) / bucket.length, max: Math.max(...bucket) })
      bucket = []
      acc -= 1000
    }
  }
  const maxY = Math.max(40, ...perSecond.map((p) => p.max))
  const x = (i) => pad + (i / Math.max(1, perSecond.length - 1)) * (W - pad * 2)
  const y = (v) => H - pad - (v / maxY) * (H - pad * 2)
  const line = (values, color) => `<polyline fill="none" stroke="${color}" stroke-width="1.5" points="${values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}"/>`
  const maxEntities = Math.max(1, ...samples.map((s) => s.enemies + s.projectiles))
  const ye = (v) => H - pad - (v / maxEntities) * (H - pad * 2)
  const entities = `<polyline fill="none" stroke="#9aa5b1" stroke-width="1" stroke-dasharray="3 3" points="${samples.map((s, i) => `${x(i).toFixed(1)},${ye(s.enemies + s.projectiles).toFixed(1)}`).join(' ')}"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="sans-serif" font-size="11">
<rect width="${W}" height="${H}" fill="#fff"/>
<line x1="${pad}" x2="${W - pad}" y1="${y(16.7)}" y2="${y(16.7)}" stroke="#2f9b2a" stroke-dasharray="4 4"/>
<text x="${W - pad + 4}" y="${y(16.7) + 4}" fill="#2f9b2a">16.7 ms</text>
${entities}
${line(perSecond.map((p) => p.max), '#e07b39')}
${line(perSecond.map((p) => p.avg), '#2b6cb0')}
<line x1="${pad}" x2="${pad}" y1="${pad}" y2="${H - pad}" stroke="#333"/>
<line x1="${pad}" x2="${W - pad}" y1="${H - pad}" y2="${H - pad}" stroke="#333"/>
<text x="${pad}" y="${pad - 12}">Frame time per second (ms): blue = average, orange = worst frame; dashed grey = enemies + projectiles (max ${maxEntities})</text>
<text x="${pad - 6}" y="${y(maxY) + 4}" text-anchor="end">${maxY.toFixed(0)}</text>
<text x="${pad - 6}" y="${H - pad + 4}" text-anchor="end">0</text>
<text x="${W - pad}" y="${H - pad + 16}" text-anchor="end">${perSecond.length} s</text>
</svg>
`
}

async function environment(browser) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 })
  const page = await context.newPage()
  await page.goto(BASE)
  const info = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2') ?? document.createElement('canvas').getContext('webgl')
    const ext = gl?.getExtension('WEBGL_debug_renderer_info')
    return {
      gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown',
      viewport: `${innerWidth}×${innerHeight} CSS px`,
      devicePixelRatio: devicePixelRatio,
      screen: `${screen.width}×${screen.height}`,
    }
  })
  await context.close()
  return {
    os: `${os.type()} ${os.release()} (${os.arch()})`,
    cpu: `${os.cpus()[0]?.model} × ${os.cpus().length} threads`,
    memoryGb: +(os.totalmem() / 1024 ** 3).toFixed(1),
    browser: `Chromium ${browser.version()} (Playwright, headed)`,
    ...info,
  }
}

async function runMatch(browser, name, { durationSec, spawnIntervalSec, overrides, autopilot }) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 })
  const page = await context.newPage()
  const consoleProblems = []
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && consoleProblems.push(`${m.type()}: ${m.text()}`))
  page.on('pageerror', (e) => consoleProblems.push(`pageerror: ${e.message}`))
  await page.goto(`${BASE}/?perf&test&sound&scenario=instant&seed=42&overrides=${encodeURIComponent(JSON.stringify(overrides))}`)
  await page.evaluate((options) => localStorage.setItem('pirate-battle:options:v1', JSON.stringify(options)), { durationSec, spawnIntervalSec })
  await page.reload()
  await page.getByRole('button', { name: 'Play' }).click()
  await page.waitForFunction(() => !!window.__PIRATE_TEST__?.sim && !!document.querySelector('.arena canvas'))
  await page.bringToFront()
  await page.evaluate(startAutopilot, autopilot)
  console.log(`Playing the ${name} match (${durationSec} s)…`)
  await page.locator('#result-title').waitFor({ timeout: (durationSec + 60) * 1000 })
  const recorded = await page.evaluate(() => ({
    frames: window.__PIRATE_PERF__.frames,
    samples: window.__PIRATE_PERF__.samples,
    resumes: window.__autopilotPauses,
    longFrames: window.__PIRATE_PERF__.longFrames,
    score: Number(document.querySelector('.result-score')?.textContent ?? 0),
  }))
  await context.close()
  const s = recorded.samples
  const stat = (key) => ({ avg: +(s.reduce((a, x) => a + x[key], 0) / s.length).toFixed(1), max: Math.max(...s.map((x) => x[key])) })
  const prefix = ONLY ? "investigation-" : ""
  writeFileSync(join(OUT, `${prefix}frame-times-${name}.svg`), chartSvg(recorded.frames, s))
  writeFileSync(join(OUT, `${prefix}samples-${name}.json`), JSON.stringify(s))
  return {
    config: { durationSec, spawnIntervalSec, seed: 42, overrides, autopilot, other: 'DEFAULT_CONFIG' },
    result: { score: recorded.score, autoResumes: recorded.resumes },
    frameTimes: frameStats(recorded.frames),
    // skip the first ~2 s (shader compilation, texture upload)
    frameTimesAfterWarmup: frameStats(recorded.frames.slice(120)),
    entities: { enemies: stat('enemies'), projectiles: stat('projectiles'), effects: stat('effects'), displayObjects: stat('displayObjects') },
    longFrames: recorded.longFrames,
    consoleProblems: consoleProblems.filter((m) => !/GL Driver Message/.test(m)),
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  const server = await startPreview()
  // Headed: real GPU. Background throttling off so an occluded window does not skew frame times.
  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'],
  })
  const report = { date: new Date().toISOString() }
  try {
    const durationSec = Math.min(180, Math.max(60, MATCH_SECONDS))
    report.environment = await environment(browser)
    const want = (name) => !ONLY || ONLY === name
    report.matches = {}
    if (want('standard'))
      report.matches.standard = await runMatch(browser, 'standard', { durationSec, spawnIntervalSec: 3, overrides: { player: { maxHealth: 1_000_000 } }, autopilot: true })
    // Worst case: idle player, spawn every second, up to 40 enemies that keep firing.
    if (want('stress'))
      report.matches.stress = await runMatch(browser, 'stress', { durationSec, spawnIntervalSec: 1, overrides: { player: { maxHealth: 1_000_000 }, session: { maxEnemies: 40 } }, autopilot: false })
    const overrides = encodeURIComponent(JSON.stringify({ player: { maxHealth: 1_000_000 } }))

    if (!want('memory')) return finish(report)
    // ------------------------------------------------------------------ memory: start → play → leave cycles
    const memContext = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 })
    const mem = await memContext.newPage()
    const memConsole = []
    mem.on('console', (m) => ['error', 'warning'].includes(m.type()) && memConsole.push(`${m.type()}: ${m.text()}`))
    const cdp = await memContext.newCDPSession(mem)
    await cdp.send('HeapProfiler.enable')
    const measure = async (label) => {
      for (let i = 0; i < 3; i++) await cdp.send('HeapProfiler.collectGarbage')
      await sleep(300)
      const heap = await cdp.send('Runtime.getHeapUsage')
      const dom = await cdp.send('Memory.getDOMCounters')
      const page = await mem.evaluate(() => ({ canvases: document.querySelectorAll('canvas').length, hook: window.__PIRATE_TEST__ ? 'session' : 'none' }))
      return { label, heapMb: +(heap.usedSize / 1024 ** 2).toFixed(2), nodes: dom.nodes, listeners: dom.jsEventListeners, documents: dom.documents, ...page }
    }
    await mem.goto(`${BASE}/?test&scenario=instant&seed=7&overrides=${overrides}`)
    await mem.getByRole('button', { name: 'Play' }).waitFor()
    const cycles = [await measure('menu, before any match')]
    // Warm-up cycle so lazily created caches (textures, shaders) are not counted as growth.
    for (let i = 0; i <= CYCLES; i++) {
      await mem.getByRole('button', { name: 'Play' }).click()
      await mem.waitForFunction(() => !!window.__PIRATE_TEST__?.sim && !!document.querySelector('.arena canvas'))
      await mem.bringToFront()
      await mem.evaluate(startAutopilot)
      await sleep(CYCLE_SECONDS * 1000)
      const inMatch = await mem.evaluate(() => ({ enemies: window.__PIRATE_TEST__.sim.enemies.length, elapsed: window.__PIRATE_TEST__.sim.elapsed }))
      await mem.evaluate(() => cancelAnimationFrame(window.__autopilot))
      await mem.keyboard.press('Escape')
      await mem.getByRole('dialog').getByRole('button', { name: 'Main Menu' }).click()
      await mem.getByRole('button', { name: 'Play' }).waitFor()
      cycles.push({ ...(await measure(i === 0 ? 'after warm-up cycle' : `after cycle ${i}`)), playedSeconds: +inMatch.elapsed.toFixed(1), enemiesAtExit: inMatch.enemies })
    }
    report.memory = { cyclesAfterWarmup: CYCLES, secondsPerCycle: CYCLE_SECONDS, measurements: cycles, consoleProblems: memConsole.filter((m) => !/GL Driver Message/.test(m)) }
    await memContext.close()
  } finally {
    await browser.close()
    // shell:true spawns a shell; kill the whole tree on Windows.
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
    else server.kill()
  }
  finish(report)
}

function finish(report) {
  if (ONLY) {
    writeFileSync(join(OUT, `investigation-${ONLY}.json`), `${JSON.stringify(report, null, 2)}\n`)
    return
  }
  writeFileSync(join(OUT, 'results.json'), `${JSON.stringify(report, null, 2)}\n`)
  const md = [
    `# Profiling results (${report.date})`,
    '',
    '## Environment',
    '',
    ...Object.entries(report.environment).map(([k, v]) => `- **${k}**: ${v}`),
    '',
    ...Object.entries(report.matches).flatMap(([name, m]) => [
      `## ${name === 'standard' ? 'Standard' : 'Stress'} match (${m.config.durationSec} s)`,
      '',
      `Config: spawn every ${m.config.spawnIntervalSec} s · overrides ${JSON.stringify(m.config.overrides)} · autopilot ${m.config.autopilot ? 'on' : 'off'} · score ${m.result.score} · auto-resumes ${m.result.autoResumes}`,
      '',
      '| Metric | Whole match | After 2 s warm-up |',
      '| --- | ---: | ---: |',
      ...Object.keys(m.frameTimes).map((k) => `| ${k} | ${m.frameTimes[k]} | ${m.frameTimesAfterWarmup[k]} |`),
      '',
      '| Entities (per-second samples) | Average | Max |',
      '| --- | ---: | ---: |',
      ...Object.entries(m.entities).map(([k, v]) => `| ${k} | ${v.avg} | ${v.max} |`),
      '',
      `Console warnings/errors: ${m.consoleProblems.length ? m.consoleProblems.join('; ') : 'none'}`,
      '',
      `![Frame times](frame-times-${name}.svg)`,
      '',
    ]),
    `## Memory: ${report.memory.cyclesAfterWarmup} cycles of start → play ${report.memory.secondsPerCycle} s → leave (after forced GC)`,
    '',
    '| Measurement | JS heap (MB) | DOM nodes | JS listeners | Canvases | Session alive | Played (s) |',
    '| --- | ---: | ---: | ---: | ---: | --- | ---: |',
    ...report.memory.measurements.map((r) => `| ${r.label} | ${r.heapMb} | ${r.nodes} | ${r.listeners} | ${r.canvases} | ${r.hook} | ${r.playedSeconds ?? '–'} |`),
    '',
    `Console warnings/errors: ${report.memory.consoleProblems.length ? report.memory.consoleProblems.join('; ') : 'none'}`,
    '',
  ].join('\n')
  writeFileSync(join(OUT, 'results.md'), md)
  console.log(md)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
