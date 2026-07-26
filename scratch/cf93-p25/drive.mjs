// CF-93 LEG 1 visual verification driver.
//   node drive.mjs <outDir> <savePath> <tag> [width] [height]
import { readFileSync } from 'node:fs'
import { launch, connect, Session } from './cdp.mjs'

const [, , OUT, SAVE, TAG, W = '1280', H = '720'] = process.argv
const width = Number(W), height = Number(H)
const saveJson = readFileSync(SAVE, 'utf8')

let chrome = null
try { const r = await fetch('http://127.0.0.1:9222/json/version'); if (!r.ok) throw 0 } catch { chrome = launch(width, height) }

const wsUrl = await connect()
const s = await Session.open(wsUrl)
await s.send('Page.enable'); await s.send('Runtime.enable')
await s.setViewport(width, height)

const log = (...a) => console.log(`[${TAG}]`, ...a)

// 1) land on the origin so localStorage is same-origin, inject the save, reload
await s.send('Page.navigate', { url: 'http://localhost:4173/' })
await s.waitFor(`document.readyState === 'complete'`, { label: 'initial load' })
await s.evalJs(`localStorage.setItem('pba.v1.save', ${JSON.stringify(saveJson)}); 'ok'`)
await s.send('Page.navigate', { url: 'http://localhost:4173/' })
await s.waitFor(`document.readyState === 'complete'`, { label: 'reload after inject' })
await new Promise((r) => setTimeout(r, 1500))
log('restored. body text head:', (await s.evalJs(`document.body.innerText.slice(0,160)`)) || '(empty)')
await s.shot(`${TAG}-00-restored`)

// 2) find and click the CONTINUE CTA (desktop ShopPanel) / mobile equivalent
const clickedContinue = await s.evalJs(`(() => {
  const btns = [...document.querySelectorAll('button')];
  const b = btns.find(x => /CONTINUE/i.test(x.textContent || ''));
  if (!b) return 'NOT_FOUND:' + btns.map(x=>(x.textContent||'').trim().slice(0,20)).join('|');
  b.click(); return 'CLICKED';
})()`)
log('continue ->', clickedContinue)
if (!String(clickedContinue).startsWith('CLICKED')) { await s.shot(`${TAG}-ERR-no-continue`); process.exit(2) }

// 3) wait for the combat canvas, then BURST-capture: the ramp window is ~1s
await s.waitFor(`document.querySelector('[data-testid="combat-canvas-container"]')`, { timeoutMs: 30000, label: 'combat canvas' })
log('combat canvas mounted; burst capturing')
const frames = []
for (let i = 0; i < 34; i++) {
  const p = await s.shot(`${TAG}-f${String(i).padStart(2, '0')}`)
  const hasResolution = await s.evalJs(`/DEALT/.test(document.body.innerText)`)
  frames.push({ i, hasResolution })
  if (hasResolution) { log(`resolution DOM appeared at frame ${i}`); break }
  await new Promise((r) => setTimeout(r, 120))
}

// 4) resolution panel — B4 + B5 live in the DOM, so read them directly
await s.waitFor(`/DEALT/.test(document.body.innerText)`, { timeoutMs: 60000, label: 'RoundResolution' })
await new Promise((r) => setTimeout(r, 400))
await s.shot(`${TAG}-90-resolution`)
const panel = await s.evalJs(`(() => {
  const t = document.body.innerText;
  return JSON.stringify({
    hasDECIDED: /DECIDED BY/.test(t),
    decidedLine: (t.match(/DECIDED BY [A-Z ]+/) || [null])[0],
    hasDRAIN: /DRAIN/.test(t),
    dealt: (t.match(/DEALT\\s*(\\d+)/) || [null,null])[1],
    taken: (t.match(/TAKEN\\s*(\\d+)/) || [null,null])[1],
    drain: (t.match(/DRAIN\\s*(\\d+)/) || [null,null])[1],
    header: (t.match(/ROUND \\d+ — (VICTORY|DRAW|DEFEAT)/) || [null,null])[1],
    headline: (t.match(/(You crushed the ghost\\.|Both fell — a draw\\.|The ghost outlasted you\\.)/) || [null,null])[1],
  });
})()`)
log('RESOLUTION PANEL:', panel)

// 5) B1 revert — advance to the next combat and re-capture the header
const next = await s.evalJs(`(() => {
  const b=[...document.querySelectorAll('button')].find(x=>/CONTINUE|NEXT/i.test(x.textContent||''));
  if(!b) return 'NOT_FOUND'; b.click(); return 'CLICKED';
})()`)
log('advance ->', next)
if (next === 'CLICKED') {
  await new Promise((r) => setTimeout(r, 1200))
  await s.shot(`${TAG}-95-after-resolution`)
  const c2 = await s.evalJs(`(() => {
    const b=[...document.querySelectorAll('button')].find(x=>/CONTINUE/i.test(x.textContent||''));
    if(!b) return 'NOT_FOUND'; b.click(); return 'CLICKED';
  })()`)
  log('second combat ->', c2)
  if (c2 === 'CLICKED') {
    await s.waitFor(`document.querySelector('[data-testid="combat-canvas-container"]')`, { timeoutMs: 30000, label: 'combat 2 canvas' })
    await new Promise((r) => setTimeout(r, 250))
    await s.shot(`${TAG}-96-combat2-start`)
    log('combat 2 opening frame captured (B1 revert check)')
  }
}
log('frames captured:', frames.length)
// leave browser up for reuse
process.exit(0)
