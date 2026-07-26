// Recipe-ladder GEOMETRY + COHERENCE GATE.
//
// Why this exists, stated plainly: all three Codex findings on this PR were
// already present in probe output or screenshots that had been reported as
// verification, and none of them was caught by it. The round-2 tally rendered
// "1 READY · 1 HELD · 12 KNOWN" over a ladder of 10 known rows and the probe
// PRINTED that string twice while exiting 0. "BottomPanel unobstructed" was
// asserted off a screenshot and was wrong in every capture by 11px.
//
// A probe that prints a contradiction and exits 0 is a report, not a gate.
// This file is the gate: it measures, it CHECKS, and it exits non-zero.
//
// Geometry lives here rather than in vitest deliberately — happy-dom has no
// layout engine, so getBoundingClientRect is all zeros there and a "panel fits
// its column" assertion would be vacuously green. Only a real browser can
// falsify it, so the real browser is where the assertion goes.
//
//   node assert.mjs <outDir> <savePath> <origin> [width] [height] [mobile]
import { readFileSync } from 'node:fs'
import { launch, connect, Session } from '../cf93-p25/cdp.mjs'

const [, , OUT, SAVE, ORIGIN, W = '1280', H = '720', MOBILE = '0'] = process.argv
const width = Number(W)
const height = Number(H)
const isMobile = MOBILE === '1'

let chrome = null
try {
  const r = await fetch('http://127.0.0.1:9222/json/version')
  if (!r.ok) throw 0
} catch {
  chrome = launch(width, height)
}

const s = await Session.open(await connect())
await s.send('Page.enable')
await s.send('Runtime.enable')
await s.send('Network.enable')
// Endpoint, not the word 'telemetry' — see drive.mjs.
await s.send('Network.setBlockedURLs', {
  urls: ['*/v1/telemetry/*', 'http://127.0.0.1:4000/*', 'http://localhost:4000/*'],
})
await s.setViewport(width, height)

await s.send('Page.navigate', { url: ORIGIN })
await s.waitFor(`document.readyState === 'complete'`, { label: 'initial load' })
await s.evalJs(`localStorage.setItem('pba.v1.save', ${JSON.stringify(readFileSync(SAVE, 'utf8'))}); 'ok'`)
await s.send('Page.navigate', { url: ORIGIN })
await s.waitFor(`document.querySelectorAll('[data-cell-col]').length === 24`, {
  timeoutMs: 60000,
  label: 'bag grid mounted',
})

if (isMobile) {
  const tapped = await s.evalJs(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => /CRAFT/i.test(x.textContent || ''));
    if (!b) return 'NOT_FOUND'; b.click(); return 'TAPPED';
  })()`)
  if (tapped !== 'TAPPED') {
    console.error('FATAL: could not reach the Crafting tab')
    process.exit(2)
  }
  await new Promise((r) => setTimeout(r, 900))
} else {
  await s.waitFor(`document.querySelector('[data-testid="recipe-ladder-panel"]')`, {
    timeoutMs: 30000,
    label: 'recipe ladder panel',
  })
}
await new Promise((r) => setTimeout(r, 700))

const m = JSON.parse(
  await s.evalJs(`(() => {
  const num = (el) => { const t = (el && el.textContent || '').match(/^(\\d+)/); return t ? Number(t[1]) : null };
  const rect = (el) => { if (!el) return null; const b = el.getBoundingClientRect();
    return { top: Math.round(b.top), bottom: Math.round(b.bottom), height: Math.round(b.height) } };

  const panel = document.querySelector('[data-testid="recipe-ladder-panel"]');
  const rows = [...document.querySelectorAll('[data-testid^="ladder-row-"]')];
  const grid = panel ? panel.querySelector('.grid') : null;
  const column = panel ? panel.parentElement : null;
  const bottomBar = [...document.querySelectorAll('div')].find(
    (d) => /^LOG/.test((d.innerText || '').trim()) && d.getBoundingClientRect().height <= 40,
  );

  const byState = {};
  for (const r of rows) { const st = r.getAttribute('data-state'); byState[st] = (byState[st] || 0) + 1 }

  // Header tallies, read back out of the RENDERED text — not recomputed from
  // the same source the component used, or the check would be circular.
  const spans = panel ? [...panel.querySelectorAll('span')] : [];
  const headerTally = {};
  for (const sp of spans) {
    const t = (sp.textContent || '').trim();
    const mm = t.match(/^(\\d+) (READY|HELD|KNOWN)$/);
    if (mm) headerTally[mm[2].toLowerCase()] = Number(mm[1]);
  }

  const panelR = rect(panel), colR = rect(column), barR = rect(bottomBar);
  const lastRow = rows[rows.length - 1];

  return JSON.stringify({
    present: { panel: !!panel, grid: !!grid, column: !!column, bottomBar: !!bottomBar },
    viewportHeight: window.innerHeight,
    panel: panelR, column: colR, bottomBar: barR, lastRow: rect(lastRow),
    columnOverflow: (panelR && colR) ? Math.max(0, panelR.bottom - colR.bottom) : null,
    panelOverlapsBottomBar: (panelR && barR) ? Math.max(0, panelR.bottom - barR.top) : null,
    gridScrollHidden: grid ? Math.max(0, grid.scrollHeight - grid.clientHeight) : null,
    rowsRendered: rows.length,
    rowsFullyInViewport: rows.filter((r) => r.getBoundingClientRect().bottom <= window.innerHeight + 0.5).length,
    rowsByState: byState,
    headerTally,
    ruleLinePresent: document.body.innerText.includes('Inputs must sit edge-to-edge'),
    docScrollsHorizontally: document.documentElement.scrollWidth > window.innerWidth + 1,
  });
})()`),
)

const checks = []
const check = (id, ok, detail) => checks.push({ id, ok: !!ok, detail })

if (isMobile) {
  // 390-wide non-regression: the Crafting tab owns its own scroll, so the only
  // hard invariants are that the three sections exist and nothing overflows
  // the viewport horizontally.
  const text = await s.evalJs(`document.body.innerText`)
  check('M1 READY section present', text.includes('READY TO CRAFT'), 'READY TO CRAFT')
  check('M2 HELD section present', text.includes('AVAILABLE WITH CURRENT ITEMS'), 'AVAILABLE WITH…')
  check('M3 KNOWN section present', text.includes('OTHER RECIPES'), 'OTHER RECIPES')
  check('M4 no horizontal overflow', !m.docScrollsHorizontally, `docScrollsHorizontally=${m.docScrollsHorizontally}`)
} else {
  // ── geometry ────────────────────────────────────────────────────────────
  check('G1 panel present', m.present.panel, 'recipe-ladder-panel')
  check('G2 bottom bar found', m.present.bottomBar, 'LOG bar located for the overlap check')
  check(
    'G3 panel does not overflow its column',
    m.columnOverflow === 0,
    `columnOverflow=${m.columnOverflow} (panel.bottom=${m.panel?.bottom} column.bottom=${m.column?.bottom})`,
  )
  check(
    'G4 BottomPanel unobstructed',
    m.panelOverlapsBottomBar === 0,
    `panelOverlapsBottomBar=${m.panelOverlapsBottomBar} (bar.top=${m.bottomBar?.top})`,
  )
  check('G5 all 12 rows rendered', m.rowsRendered === 12, `rowsRendered=${m.rowsRendered}`)
  check(
    'G6 all rows fully inside the viewport',
    m.rowsFullyInViewport === m.rowsRendered,
    `rowsFullyInViewport=${m.rowsFullyInViewport}/${m.rowsRendered}`,
  )
  check(
    'G7 no ladder row hidden by grid clipping',
    m.gridScrollHidden === 0,
    `gridScrollHidden=${m.gridScrollHidden}px`,
  )

  // ── coherence: the round-2 defect class ─────────────────────────────────
  const t = m.headerTally
  const haveAll = ['ready', 'held', 'known'].every((k) => typeof t[k] === 'number')
  check('C1 header tally readable', haveAll, JSON.stringify(t))
  check(
    'C2 header tally sums to rendered rows',
    haveAll && t.ready + t.held + t.known === m.rowsRendered,
    `${t.ready}+${t.held}+${t.known}=${haveAll ? t.ready + t.held + t.known : '?'} vs rowsRendered=${m.rowsRendered}`,
  )
  check(
    'C3 each header count matches its rendered rung',
    haveAll &&
      t.ready === (m.rowsByState.ready || 0) &&
      t.held === (m.rowsByState.held || 0) &&
      t.known === (m.rowsByState.known || 0),
    `header=${JSON.stringify(t)} rendered=${JSON.stringify(m.rowsByState)}`,
  )
  check('C4 adjacency rule line present', m.ruleLinePresent, 'Inputs must sit edge-to-edge…')
}

console.log(`\n=== ladder gate @ ${width}x${height}${isMobile ? ' (mobile)' : ''} ===`)
for (const c of checks) console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.id}  — ${c.detail}`)
const failed = checks.filter((c) => !c.ok)
console.log(`\nMEASURED: columnOverflow=${m.columnOverflow} panelOverlapsBottomBar=${m.panelOverlapsBottomBar} gridScrollHidden=${m.gridScrollHidden}`)
console.log(`${failed.length === 0 ? 'GATE GREEN' : 'GATE RED'} — ${checks.length - failed.length}/${checks.length} checks passed`)

if (chrome) chrome.kill()
process.exit(failed.length === 0 ? 0 : 1)
