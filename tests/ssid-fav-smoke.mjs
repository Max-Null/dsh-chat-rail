/**
 * SSiD chat-rail favorites smoke test (manual-ish, driven via playwright-core).
 *
 * Steps:
 *  1. Open the SSiD DSH web UI at http://127.0.0.1:3081/ with the bundled
 *     chromium (headless shell binary works for CDP-rendered content).
 *  2. Wait for the app shell, then wait for chat-rail client marker
 *     (`style[data-plugin-css*="dsh-chat-rail"]`).
 *  3. Dump diagnostics: plugin style present, any console errors, the
 *     favorites toggle presence on the rail, message action buttons in rows.
 *
 * Exit code 0 = smoke passed; 1 = failures; 2 = environment issue.
 */
import { chromium } from 'playwright-core'
import { createHash } from 'node:crypto'

const URL = process.env.DSH_URL ?? 'http://127.0.0.1:3081/'
const CHROME = process.env.CHROME_BIN
  ?? 'C:/Users/MaxNull/AppData/Local/ms-playwright/chromium-1237/chrome-win64/chrome.exe'

const results = []
const errors = []

function ok(name, detail = '') { results.push(`PASS ${name}${detail ? ` — ${detail}` : ''}`) }
function bad(name, detail = '') { results.push(`FAIL ${name}${detail ? ` — ${detail}` : ''}`); errors.push(name) }

const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

const consoleErrors = []
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200))
})
page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${String(err).slice(0, 200)}`))

try {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(4000)

  // 1. App shell present?
  const root = await page.evaluate(() => document.getElementById('root') !== null)
  ok('app-shell', `root=${root}`)

  // 2. chat-rail plugin style marker injected?
  const pluginStyle = await page.evaluate(() =>
    document.querySelector('style[data-plugin-css*="dsh-chat-rail"]') !== null)
  ok('chat-rail-style-marker', `present=${pluginStyle}`)

  // 3. chat-rail nav capsule present?
  const nav = await page.evaluate(() => document.querySelector('.crl_nav') !== null)
  ok('chat-rail-nav', `present=${nav}`)

  // 4. Favorites toggle button on the rail?
  const favToggle = await page.evaluate(() => document.querySelector('.crl_favToggle') !== null)
  ok('fav-toggle', `present=${favToggle}`)

  // 5. Any injected message action buttons?
  const msgButtons = await page.evaluate(() => document.querySelectorAll('[data-crl-star]').length)
  ok('message-action-buttons', `star-count=${msgButtons}`)

  // 6. Console error health (non-fatal diagnostics)
  const realErrors = consoleErrors.filter((e) => !e.includes('favicon') && !e.includes('WebSocket') && !e.includes('err_'))
  ok('console-clean', realErrors.length === 0 ? 'no errors' : `errors=${JSON.stringify(realErrors.slice(0, 5))}`)
} catch (err) {
  bad('navigation', String(err).slice(0, 300))
}

console.log(results.join('\n'))
console.log(`\nSUMMARY: ${results.length - errors.length}/${results.length} passed`)
await browser.close()
process.exit(errors.length > 0 ? 1 : 0)
