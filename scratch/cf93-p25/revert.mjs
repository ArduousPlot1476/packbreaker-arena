// STEP 1 — B1 revert-on-next-combat, observed. Same page session, same run:
// combat 1 must reach the ramp (header -> SUDDEN DEATH), combat 2 must open on
// '— COMBAT —'. Diagnostic-heavy: the prior attempt died blind at canvas mount.
import { readFileSync } from 'node:fs'
import { launch, connect, Session } from './cdp.mjs'

const [, , OUT, SAVE, TAG, W = '1280', H = '720'] = process.argv
const width = Number(W), height = Number(H)
const saveJson = readFileSync(SAVE, 'utf8')

let chrome = null
try { const r = await fetch('http://127.0.0.1:9222/json/version'); if (!r.ok) throw 0 } catch { chrome = launch(width, height) }
const s = await Session.open(await connect())
await s.send('Page.enable'); await s.send('Runtime.enable')
await s.setViewport(width, height)
const log = (...a) => console.log(`[${TAG}]`, ...a)

const snap = () => s.evalJs(`(() => {
  const t = document.body.innerText;
  return JSON.stringify({
    canvas: !!document.querySelector('[data-testid="combat-canvas-container"]'),
    buttons: [...document.querySelectorAll('button')].filter(b=>!b.disabled).map(b=>(b.textContent||'').trim().slice(0,22)).filter(Boolean).slice(0,8),
    modal: !!document.querySelector('[data-testid="relic-offer-modal"]'),
    dealt: /DEALT/.test(t),
    round: (t.match(/ROUND (\\d+)/)||[null,null])[1],
  });
})()`)

const clickText = (re) => s.evalJs(`(() => {
  const b=[...document.querySelectorAll('button')].filter(x=>!x.disabled).find(x=>${re}.test((x.textContent||'').trim()));
  if(!b) return 'NOT_FOUND'; b.click(); return 'CLICKED:'+(b.textContent||'').trim().slice(0,22);
})()`)

// --- restore + combat 1 -------------------------------------------------------
await s.send('Page.navigate', { url: 'http://localhost:4173/' })
await s.waitFor(`document.readyState === 'complete'`)
await s.evalJs(`localStorage.setItem('pba.v1.save', ${JSON.stringify(saveJson)}); 'ok'`)
await s.send('Page.navigate', { url: 'http://localhost:4173/' })
await s.waitFor(`document.readyState === 'complete'`)
await new Promise((r) => setTimeout(r, 1500))
log('restored:', await snap())

log('combat 1 ->', await clickText('/CONTINUE/i'))
await s.waitFor(`document.querySelector('[data-testid="combat-canvas-container"]')`, { timeoutMs: 30000, label: 'combat 1 canvas' })
// catch the ramp window
for (let i = 0; i < 30; i++) {
  await s.shot(`${TAG}-c1-f${String(i).padStart(2, '0')}`)
  if (await s.evalJs(`/DEALT/.test(document.body.innerText)`)) { log('c1 resolution at frame', i); break }
  await new Promise((r) => setTimeout(r, 120))
}
await s.waitFor(`/DEALT/.test(document.body.innerText)`, { timeoutMs: 60000, label: 'c1 resolution' })
log('c1 panel:', await s.evalJs(`(() => (document.body.innerText.match(/DECIDED BY [A-Z ]+/)||['(none)'])[0])()`))
await s.shot(`${TAG}-c1-resolution`)

// --- advance to combat 2, narrating every transition -------------------------
log('after resolution:', await snap())
log('next ->', await clickText('/NEXT ROUND/i'))
await new Promise((r) => setTimeout(r, 1500))
log('post-next:', await snap())
await s.shot(`${TAG}-between`)

// a mid-run relic offer can block the shop; dismiss/accept if present
const modal = await s.evalJs(`!!document.querySelector('[data-testid="relic-offer-modal"]')`)
if (modal) {
  log('relic offer modal present — taking the first enabled button')
  log('modal ->', await clickText('/./'))
  await new Promise((r) => setTimeout(r, 1200))
  log('post-modal:', await snap())
}

// click CONTINUE with retries until the canvas actually mounts
let mounted = false
for (let attempt = 1; attempt <= 8 && !mounted; attempt++) {
  const r = await clickText('/CONTINUE/i')
  log(`combat 2 attempt ${attempt} ->`, r)
  for (let w = 0; w < 20; w++) {
    if (await s.evalJs(`!!document.querySelector('[data-testid="combat-canvas-container"]')`)) { mounted = true; break }
    await new Promise((x) => setTimeout(x, 250))
  }
  if (!mounted) { log(`  not mounted; state:`, await snap()); await new Promise((x) => setTimeout(x, 800)) }
}
if (!mounted) { await s.shot(`${TAG}-FAIL-no-combat2`); log('HALT: combat 2 canvas never mounted'); process.exit(3) }

log('combat 2 canvas mounted — capturing OPENING frames (B1 revert check)')
for (let i = 0; i < 6; i++) {
  await s.shot(`${TAG}-c2-open-f${String(i).padStart(2, '0')}`)
  await new Promise((r) => setTimeout(r, 90))
}
log('done')
process.exit(0)
