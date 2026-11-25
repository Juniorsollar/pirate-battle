// Heap object census across start → play → leave cycles (see docs/perf/README.md § Memory).
// Needs an unminified build so class names are readable:
//   npx vite build --minify false --outDir dist-unminified && node scripts/heap-objects.mjs dist-unminified
import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
const BASE = 'http://localhost:4173'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const server = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort', '--outDir', process.argv[2]], { shell: true, stdio: 'ignore' })
for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE)).ok) break } catch {} await sleep(500) }
const browser = await chromium.launch({ headless: false, args: ['--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } })
const page = await ctx.newPage()
const cdp = await ctx.newCDPSession(page)
await cdp.send('HeapProfiler.enable')

async function snapshot() {
  for (let i = 0; i < 3; i++) await cdp.send('HeapProfiler.collectGarbage')
  const chunks = []
  const onChunk = (e) => chunks.push(e.chunk)
  cdp.on('HeapProfiler.addHeapSnapshotChunk', onChunk)
  await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false })
  cdp.off('HeapProfiler.addHeapSnapshotChunk', onChunk)
  const snap = JSON.parse(chunks.join(''))
  const F = snap.snapshot.meta.node_fields.length
  const types = snap.snapshot.meta.node_types[0]
  const counts = new Map()
  for (let i = 0; i < snap.nodes.length; i += F) {
    if (types[snap.nodes[i]] !== 'object') continue
    const name = snap.strings[snap.nodes[i + 1]]
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return counts
}

const overrides = encodeURIComponent(JSON.stringify({ player: { maxHealth: 1000000 } }))
await page.goto(`${BASE}/?test&scenario=instant&seed=7&overrides=${overrides}`)
async function cycle() {
  await page.getByRole('button', { name: 'Play' }).click()
  await page.waitForFunction(() => !!window.__PIRATE_TEST__?.sim && !!document.querySelector('.arena canvas'))
  const end = Date.now() + 10000
  while (Date.now() < end) {
    await page.evaluate(() => { const g = window.__PIRATE_TEST__; if (g?.store.get().phase === 'paused') g.resume() })
    await sleep(500)
  }
  await page.keyboard.press('Escape')
  await page.getByRole('dialog').getByRole('button', { name: 'Main Menu' }).click()
  await page.getByRole('button', { name: 'Play' }).waitFor()
}

// During a match (to learn the names), then after 4 and 12 cycles.
await page.getByRole('button', { name: 'Play' }).click()
await page.waitForFunction(() => !!window.__PIRATE_TEST__?.sim && !!document.querySelector('.arena canvas'))
await sleep(5000)
const during = await snapshot()
await page.keyboard.press('Escape')
await page.getByRole('dialog').getByRole('button', { name: 'Main Menu' }).click()
for (let i = 0; i < 3; i++) await cycle()
const a = await snapshot()
for (let i = 0; i < 8; i++) await cycle()
const b = await snapshot()

const watched = [...during.keys()].filter((n) => /^(GameSession|Simulation|GameRenderer|InputController|FlowField|PerfRecorder|_?Application|WebGLRenderer|_?Sprite|_?Container|TilingSprite|_?Texture|_?Ticker|Spritesheet|ViewContainer|RenderGroup|HTMLCanvasElement|WebGL2RenderingContext)\d*$/.test(n))
console.log('class'.padEnd(26), 'in match', 'after 4 cycles', 'after 12 cycles')
for (const n of watched.sort()) console.log(n.padEnd(26), String(during.get(n)).padStart(8), String(a.get(n) ?? 0).padStart(14), String(b.get(n) ?? 0).padStart(15))
const growth = [...b.entries()].map(([n, c]) => [n, c - (a.get(n) ?? 0)]).filter(([, d]) => d > 0).sort((x, y) => y[1] - x[1]).slice(0, 15)
console.log('\nobject types that grew between cycle 4 and 12:')
for (const [n, d] of growth) console.log(String(d).padStart(6), n.slice(0, 70))
await browser.close()
if (process.platform === 'win32') spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
else server.kill()
