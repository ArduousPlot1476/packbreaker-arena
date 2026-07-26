// Zero-dependency CDP driver (Node 22 global WebSocket + fetch). puppeteer-core
// is NOT installed and installing it would touch pnpm-lock.yaml, which this
// phase forbids. Drives the LEG 1 visual verification against vite preview.
import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'

// System Chrome is not checkout-derivable. Overridable via CHROME_PATH so this runs
// on any machine; the default is the standard Windows install location.
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9222
const OUT = process.argv[2] ?? '.'
mkdirSync(OUT, { recursive: true })

export function launch(width = 1280, height = 720) {
  const proc = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    `--window-size=${width},${height}`,
    '--no-first-run', '--no-default-browser-check',
    '--user-data-dir=' + OUT + '/chrome-profile',
    'about:blank',
  ], { stdio: 'ignore', detached: false })
  return proc
}

export async function connect() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      const tabs = await r.json()
      const page = tabs.find((t) => t.type === 'page')
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('CDP endpoint never came up')
}

export class Session {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map() }
  static async open(url) {
    const ws = new WebSocket(url)
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
    const s = new Session(ws)
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && s.pending.has(msg.id)) {
        const { res, rej } = s.pending.get(msg.id); s.pending.delete(msg.id)
        msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result)
      }
    }
    return s
  }
  send(method, params = {}) {
    const id = ++this.id
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej })
      this.ws.send(JSON.stringify({ id, method, params }))
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); rej(new Error(method + ' timed out')) } }, 120000)
    })
  }
  async evalJs(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) throw new Error(expression.slice(0, 80) + ' -> ' + JSON.stringify(r.exceptionDetails.exception?.description ?? r.exceptionDetails))
    return r.result.value
  }
  async shot(name) {
    const r = await this.send('Page.captureScreenshot', { format: 'png' })
    const p = `${OUT}/${name}.png`
    writeFileSync(p, Buffer.from(r.data, 'base64'))
    return p
  }
  async waitFor(predicateJs, { timeoutMs = 120000, everyMs = 250, label = predicateJs } = {}) {
    const t0 = Date.now()
    while (Date.now() - t0 < timeoutMs) {
      if (await this.evalJs(`!!(${predicateJs})`)) return true
      await new Promise((r) => setTimeout(r, everyMs))
    }
    throw new Error(`waitFor TIMEOUT after ${timeoutMs}ms: ${label}`)
  }
  async setViewport(width, height) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: 1, mobile: width < 500,
    })
  }
}

// Reads the live Phaser scene's LEG 1 label state without touching game logic.
export const SCENE_PROBE = `(() => {
  const g = window.__PBA_GAME__;
  return JSON.stringify({ note: 'no game handle exported', hasHandle: !!g });
})()`;
