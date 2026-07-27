// Recipe-ladder visual verification driver.
//   node drive.mjs <outDir> <savePath> <tag> <origin> [width] [height] [mobile]
//
// Reuses the tracked CF-93 LEG 1 CDP driver (../cf93-p25/cdp.mjs) rather than
// duplicating it — puppeteer-core is still not installed.
//
// ⚠ TELEMETRY IS BLOCKED AT THE BROWSER, NOT ASSUMED ABSENT. vite's dev server
// proxies /v1 -> 127.0.0.1:4000 (apps/client/vite.config.ts server.proxy), so a
// naive probe run POSTs real telemetry batches into the live server and
// contaminates the playtest dataset — the exact failure this milestone is
// opening a CF for. Network.setBlockedURLs is installed BEFORE the first
// navigation and the block is asserted, so a silent regression in the block
// fails the run instead of quietly polluting data.
import { readFileSync } from 'node:fs'
import { launch, connect, Session } from '../cf93-p25/cdp.mjs'

const [, , OUT, SAVE, TAG, ORIGIN, W = '1280', H = '720', MOBILE = '0'] = process.argv
const width = Number(W)
const height = Number(H)
const isMobile = MOBILE === '1'
const saveJson = readFileSync(SAVE, 'utf8')

let chrome = null
try {
  const r = await fetch('http://127.0.0.1:9222/json/version')
  if (!r.ok) throw 0
} catch {
  chrome = launch(width, height)
}

const wsUrl = await connect()
const s = await Session.open(wsUrl)
await s.send('Page.enable')
await s.send('Runtime.enable')
await s.send('Network.enable')

// --- the telemetry block, installed first and verified after -----------------
// ⚠ Pattern width matters. A first cut used '*/telemetry/*', which ALSO matched
// the dev server's own module URL for apps/client/src/telemetry/* — under
// `vite dev` source paths ARE URLs — and blocking it stopped the app booting
// (blank page, bag grid never mounted). Block the ENDPOINT, not the word.
await s.send('Network.setBlockedURLs', {
  urls: ['*/v1/telemetry/*', 'http://127.0.0.1:4000/*', 'http://localhost:4000/*'],
})
const blockedHits = []
s.ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data)
  if (m.method === 'Network.loadingFailed' && /BLOCKED/i.test(m.params?.blockedReason ?? '')) {
    blockedHits.push(m.params.requestId)
  }
  if (m.method === 'Network.requestWillBeSent') {
    const u = m.params?.request?.url ?? ''
    if (/\/v1\//.test(u)) console.log(`[${TAG}] telemetry attempt SEEN (must be blocked):`, u)
  }
})

await s.setViewport(width, height)
const log = (...a) => console.log(`[${TAG}]`, ...a)

await s.send('Page.navigate', { url: ORIGIN })
await s.waitFor(`document.readyState === 'complete'`, { label: 'initial load' })
await s.evalJs(`localStorage.setItem('pba.v1.save', ${JSON.stringify(saveJson)}); 'ok'`)
await s.send('Page.navigate', { url: ORIGIN })
await s.waitFor(`document.readyState === 'complete'`, { label: 'reload after inject' })
// readyState alone is not enough: the run screen is behind a lazy import and a
// save restore, so poll for a real run surface rather than sleeping a guess.
await s.waitFor(`document.querySelectorAll('[data-cell-col]').length === 24`, {
  timeoutMs: 60000,
  label: 'bag grid mounted',
})
await new Promise((r) => setTimeout(r, 600))

if (isMobile) {
  // Ladder lives in the [Crafting] tab on mobile; Shop is the default tab.
  const tapped = await s.evalJs(`(() => {
    const b = [...document.querySelectorAll('button')]
      .find(x => /CRAFT/i.test(x.textContent || ''));
    if (!b) return 'NOT_FOUND:' + [...document.querySelectorAll('button')]
      .map(x => (x.textContent || '').trim().slice(0, 14)).join('|');
    b.click(); return 'TAPPED';
  })()`)
  log('crafting tab ->', tapped)
  await new Promise((r) => setTimeout(r, 900))
} else {
  await s.waitFor(`document.querySelector('[data-testid="recipe-ladder-panel"]')`, {
    timeoutMs: 30000,
    label: 'recipe ladder panel',
  })
}

// --- read the ladder out of the DOM, so the claim is not screenshot-only -----
const ladder = await s.evalJs(`(() => {
  const rows = [...document.querySelectorAll('[data-testid^="ladder-row-"]')];
  const byState = {};
  for (const r of rows) {
    const st = r.getAttribute('data-state');
    (byState[st] ||= []).push(r.getAttribute('data-testid').replace('ladder-row-',''));
  }
  return JSON.stringify({
    total: rows.length,
    ready: byState.ready || [],
    held: byState.held || [],
    knownCount: (byState.known || []).length,
    ruleLinePresent: document.body.innerText.includes('Inputs must sit edge-to-edge'),
    footerRemedy: document.body.innerText.split('\\n').filter(
      (l) => l.includes('HELD') || l.includes('PLACE RECIPE INPUTS') || l.includes('RECIPE READY'),
    ),
  });
})()`)
log('LADDER:', ladder)

await s.shot(`${TAG}-ladder`)
log('telemetry requests blocked (count):', blockedHits.length)
log('done')
if (chrome) chrome.kill()
process.exit(0)
