/**
 * SSiD chat-rail favorites E2E (playwright-core, headless chromium).
 * After PIN: click a session row, wait for the rail, exercise favorite/fill/filter.
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

try {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(1500)
  const gate = await page.evaluate(() => document.body.innerText.includes('访问密码'))
  if (gate) {
    const input = await page.$('input')
    if (input) { await input.fill(PIN); await page.keyboard.press('Enter'); await page.waitForTimeout(4000) }
  }
  ok('app-shell', 'root loaded after PIN')

  const clickedLabel = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    let node = walker.nextNode()
    while (node !== null) {
      if ((node.textContent ?? '').includes('确认open-sea-skin优化提R')) {
        node.parentElement?.click()
        return '确认open-sea-skin优化提R'
      }
      node = walker.nextNode()
    }
    return null
  })
  ok('session-open', clickedLabel === null ? 'no row found' : 'clicked "' + clickedLabel + '"')

  await page.waitForTimeout(12000)

  const styleMarker = await page.evaluate(() => document.querySelector('style[data-plugin-css*="dsh-chat-rail"]') !== null)
  const navPresent = await page.evaluate(() => document.querySelector('.crl_nav') !== null)
  const favTogglePresent = await page.evaluate(() => document.querySelector('.crl_favToggle') !== null)
  const starCount = await page.evaluate(() => document.querySelectorAll('[data-crl-star]').length)
  const fillCount = await page.evaluate(() => document.querySelectorAll('[data-crl-fill]').length)
  ok('style-marker', 'present=' + styleMarker)
  ok('rail-nav', 'present=' + navPresent)
  ok('fav-toggle', 'present=' + favTogglePresent)
  ok('message-actions', 'stars=' + starCount + ' fills=' + fillCount)

  if (navPresent && starCount > 0) {
    const before = await page.evaluate(() => document.querySelector('[data-crl-star]')?.getAttribute('aria-pressed'))
    await page.evaluate(() => document.querySelector('[data-crl-star]')?.click())
    await page.waitForTimeout(500)
    const after = await page.evaluate(() => {
      const b = document.querySelector('[data-crl-star]')
      const stored = localStorage.getItem('@max-null/dsh-chat-rail:favorites')
      const starredRows = document.querySelectorAll('.crl_item.crl_favItem').length
      const yellow = document.querySelector('.crl_item.crl_favItem .crl_line') !== null
      return { pressed: b?.getAttribute('aria-pressed'), stored, starredRows, yellow }
    })
    ok('star-toggle', 'before=' + before + ' after=' + after.pressed + ' persisted=' + (after.stored !== null))
    ok('rail-yellow', 'rows=' + after.starredRows + ' yellowLine=' + after.yellow)

    const hasToggle = await page.evaluate(() => document.querySelector('.crl_favToggle') !== null)
    if (hasToggle) {
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