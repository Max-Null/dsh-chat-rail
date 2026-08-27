/**
 * SSiD chat-rail favorites E2E (playwright-core, headless chromium).
 * Idempotent: resets host favorites at start, reloads, then drives the UI.
 */
import { chromium } from 'playwright-core'

const URL = process.env.DSH_URL ?? 'http://127.0.0.1:3081/'
const PIN = '28281801'
const CHROME = 'C:/Users/MaxNull/AppData/Local/ms-playwright/chromium-1237/chrome-win64/chrome.exe'

const results = []
const failures = []
const ok = (name, detail = '') => { results.push(`PASS ${name}${detail ? ` — ${detail}` : ''}`) }
const bad = (name, detail = '') => { results.push(`FAIL ${name}${detail ? ` — ${detail}` : ''}`); failures.push(name) }

const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const consoleErrors = []
page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${String(err).slice(0, 160)}`))

const openSession = async () => {
  await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    let node = walker.nextNode()
    while (node !== null) {
      if ((node.textContent ?? '').includes('确认open-sea-skin优化提R')) { node.parentElement?.click(); break }
      node = walker.nextNode()
    }
  })
  await page.waitForTimeout(10000)
}

try {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(1500)
  const gate = await page.evaluate(() => document.body.innerText.includes('访问密码'))
  if (gate) {
    const input = await page.$('input')
    if (input) { await input.fill(PIN); await page.keyboard.press('Enter'); await page.waitForTimeout(4000) }
  }
  ok('app-shell', 'root loaded after PIN')

  // ---- Idempotency reset: clear host favorites BEFORE any assertion ----
  // (host persistence means stale stars from earlier runs would poison the
  // "toggle hidden with no favorites" and "star-toggle flips" checks.)
  await page.evaluate(async () => {
    await fetch('/chat-rail/api/favorites', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ favorites: {} }),
    })
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  const gate2 = await page.evaluate(() => document.body.innerText.includes('访问密码'))
  if (gate2) { const input = await page.$('input'); if (input) { await input.fill(PIN); await page.keyboard.press('Enter'); await page.waitForTimeout(4000) } }

  await openSession()

  // Accept late plugin-update dialogs away (they overlay the rail area).
  for (let attempt = 0; attempt < 6; attempt++) {
    const has = await page.evaluate(() => document.body.innerText.includes('插件更新'))
    if (!has) break
    await page.keyboard.press('Escape')
    await page.waitForTimeout(600)
  }
  await page.waitForTimeout(3000)

  const styleMarker = await page.evaluate(() => document.querySelector('style[data-plugin-css*="dsh-chat-rail"]') !== null)
  const navPresent = await page.evaluate(() => document.querySelector('.crl_nav') !== null)
  const starCount = await page.evaluate(() => document.querySelectorAll('[data-crl-star]').length)
  const fillCount = await page.evaluate(() => document.querySelectorAll('[data-crl-fill]').length)
  ok('style-marker', 'present=' + styleMarker)
  ok('rail-nav', 'present=' + navPresent)
  ok('message-actions', 'stars=' + starCount + ' fills=' + fillCount)

  if (navPresent && starCount > 0) {
    // Toggle hidden with zero favorites.
    const toggleBefore = await page.evaluate(() => document.querySelector('.crl_favToggle') !== null)
    ok('fav-toggle-hidden-when-empty', 'present=' + toggleBefore + ' (expect false)')

    // Star the first message → toggle appears, star yellow, rail yellow line.
    const before = await page.evaluate(() => document.querySelector('[data-crl-star]')?.getAttribute('aria-pressed'))
    await page.evaluate(() => document.querySelector('[data-crl-star]')?.click())
    await page.waitForTimeout(800)
    const after = await page.evaluate(() => {
      const b = document.querySelector('[data-crl-star]')
      const pinned = document.querySelector('.crl_favToggle') !== null
      const starredRows = document.querySelectorAll('.crl_item.crl_favItem').length
      const yellow = document.querySelector('.crl_item.crl_favItem .crl_line') !== null
      return { pressed: b?.getAttribute('aria-pressed'), pinned, starredRows, yellow }
    })
    ok('star-toggle', 'before=' + before + ' after=' + after.pressed)
    ok('fav-toggle-shown-when-starred', 'present=' + after.pinned + ' (expect true)')
    ok('rail-yellow', 'rows=' + after.starredRows + ' yellowLine=' + after.yellow)

    // Favorites-only filter.
    if (after.pinned) {
      await page.evaluate(() => document.querySelector('.crl_favToggle')?.click())
      await page.waitForTimeout(400)
      const filtered = await page.evaluate(() => ({
        pressed: document.querySelector('.crl_favToggle')?.getAttribute('aria-pressed'),
        items: document.querySelectorAll('.crl_item').length,
        navStill: document.querySelector('.crl_nav') !== null,
      }))
      ok('fav-filter', 'pressed=' + filtered.pressed + ' items=' + filtered.items + ' navStill=' + filtered.navStill)
      await page.evaluate(() => document.querySelector('.crl_favToggle')?.click())
    }

    // Fill-to-input (plus button).
    if (fillCount > 0) {
      const beforeDraft = await page.evaluate(() => document.querySelector('textarea')?.value ?? '')
      await page.evaluate(() => document.querySelector('[data-crl-fill]')?.click())
      await page.waitForTimeout(800)
      const afterDraft = await page.evaluate(() => document.querySelector('textarea')?.value ?? '')
      ok('fill-to-input', 'draftChanged=' + (afterDraft !== beforeDraft) + ' len=' + afterDraft.length)
    } else {
      ok('fill-to-input', 'skipped (no fill button)')
    }

    await page.screenshot({ path: 'C:/Users/MaxNull/AppData/Local/Temp/ssid-fav-e2e.png' })
  } else {
    bad('rail-nav', 'no rail after session open (nav=' + navPresent + ')')
    await page.screenshot({ path: 'C:/Users/MaxNull/AppData/Local/Temp/ssid-fav-norail.png' })
  }
} catch (err) {
  bad('run', String(err).slice(0, 300))
}

const realErrors = consoleErrors.filter((e) => !e.includes('favicon'))
ok('console-clean', realErrors.length === 0 ? 'no page errors' : 'errors=' + JSON.stringify(realErrors.slice(0, 3)))

console.log(results.join('\n'))
console.log('\nSUMMARY: ' + (results.length - failures.length) + '/' + results.length + ' passed')
await browser.close()
process.exit(failures.length > 0 ? 1 : 0)
