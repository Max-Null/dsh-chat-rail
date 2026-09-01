/**
 * SSiD dev (DSH 0.1.2-alpha.4 kernel) loadThrough jump verification for
 * @max-null/dsh-chat-rail 0.6.0.
 *
 * Verifies: client bundle loads on the alpha.4 kernel, official TurnNavigator
 * stays hidden, the rail's first/last jumps land (the alpha.3+ jump pager
 * loadThrough(seq) or the immediate path when the window covers the turn),
 * and the console stays clean (no "not loaded" warns).
 *
 * Idempotent; read-only use of the running kernel (no instance operations).
 */
import { chromium } from 'playwright-core'

const URL = process.env.DSH_URL ?? 'http://127.0.0.1:3081/'
const PIN = '28281801'
const CHROME = 'C:/Users/MaxNull/AppData/Local/ms-playwright/chromium-1237/chrome-win64/chrome.exe'
/** Historical (non-running) session with substantial history — safe to open
 *  while the live instances keep their own running sessions untouched. */
const SESSION_HINT = '插件中心升级与更新决策汇总'

const results = []
const failures = []
const ok = (name, cond, detail = '') => {
  results.push(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!cond) failures.push(name)
}
const bad = (name, detail = '') => { results.push(`FAIL ${name}${detail ? ` — ${detail}` : ''}`); failures.push(name) }

const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const consoleErrors = []
const consoleWarns = []
page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${String(err).slice(0, 160)}`))
page.on('console', (msg) => {
  if (msg.type() === 'warning' || msg.type() === 'error') {
    const t = msg.text()
    if (t.includes('[chat-rail]')) consoleWarns.push(t.slice(0, 200))
  }
})

const login = async () => {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(1500)
  const gate = await page.evaluate(() => document.body.innerText.includes('访问密码'))
  if (gate) {
    const input = await page.$('input')
    if (input) { await input.fill(PIN); await page.keyboard.press('Enter'); await page.waitForTimeout(4000) }
  }
}

const openSession = async () => {
  // The session list may be collapsed ("展开其余 N 个会话"): expand before scanning.
  const expanded = await page.evaluate(() => {
    for (const el of document.querySelectorAll('button, [role="button"], span, div')) {
      const t = (el.textContent ?? '')
      if (t.includes('展开其余') && t.length < 30) { el.click(); return t.trim() }
    }
    return ''
  })
  if (expanded !== '') await page.waitForTimeout(1200)
  const clicked = await page.evaluate((hint) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    let node = walker.nextNode()
    while (node !== null) {
      if ((node.textContent ?? '').includes(hint)) { node.parentElement?.click(); return true }
      node = walker.nextNode()
    }
    return false
  }, SESSION_HINT)
  if (!clicked) throw new Error(`session hint "${SESSION_HINT}" not found after expand`)
  await page.waitForTimeout(10000)
}

try {
  await login()
  await openSession()

  // Accept late plugin-update dialogs away (they overlay the rail area).
  for (let attempt = 0; attempt < 6; attempt++) {
    const has = await page.evaluate(() => document.body.innerText.includes('插件更新'))
    if (!has) break
    await page.keyboard.press('Escape')
    await page.waitForTimeout(600)
  }
  await page.waitForTimeout(3000)

  // 1. Client bundle loaded on the alpha.4 kernel.
  const styleMarker = await page.evaluate(() => document.querySelector('style[data-plugin-css*="dsh-chat-rail"]') !== null)
  ok('style-marker', styleMarker, 'present=' + styleMarker)

  const nav = await page.evaluate(() => {
    const el = document.querySelector('.crl_nav')
    const items = document.querySelectorAll('.crl_item').length
    return { present: el !== null, items }
  })
  ok('rail-nav', nav.present && nav.items >= 2, 'present=' + nav.present + ' items=' + nav.items)

  // 2. Official TurnNavigator stays hidden (aria-label anchor, alpha.4 DOM).
  const official = await page.evaluate(() => {
    const el = document.querySelector('nav[aria-label="轮次导航"],nav[aria-label="Turn navigation"]')
    if (el === null) return 'absent'
    const style = getComputedStyle(el)
    return `present:${style.display}`
  })
  ok('official-rail-hidden', official === 'absent' || official === 'present:none', official)

  if (nav.present && nav.items >= 2) {
    // 3. Jump to the FIRST message (oldest — deep history on a long session).
    // loadThrough path budget: busy-wait + node poll + DOM poll, all capped at
    // ~5s each, so give the whole jump 12s before judging.
    await page.evaluate(() => document.querySelector('.crl_item[data-crl-index="0"]')?.click())
    await page.waitForTimeout(12000)
    const first = await page.evaluate(() => {
      const sp = document.querySelector('[data-conversation-scroll]')
      const ratio = sp !== null && sp.scrollHeight > 0 ? sp.scrollTop / sp.scrollHeight : -1
      return { ratio, scrollTop: sp?.scrollTop ?? -1, scrollHeight: sp?.scrollHeight ?? -1 }
    })
    ok('jump-first', first.ratio >= 0 && first.ratio < 0.15,
      `ratio=${first.ratio.toFixed(3)} (expect <0.15; scrollTop=${Math.round(first.scrollTop)}/${Math.round(first.scrollHeight)})`)

    // 4. Jump to the LAST message (bottom).
    await page.evaluate(() => {
      const items = document.querySelectorAll('.crl_item')
      items[items.length - 1]?.click()
    })
    await page.waitForTimeout(12000)
    const bottom = await page.evaluate(() => {
      const sp = document.querySelector('[data-conversation-scroll]')
      const ratio = sp !== null && sp.scrollHeight > 0 ? sp.scrollTop / sp.scrollHeight : -1
      return { ratio }
    })
    ok('jump-last', bottom.ratio > 0.85, `ratio=${bottom.ratio.toFixed(3)} (expect >0.85)`)

    await page.screenshot({ path: 'C:/Users/MaxNull/AppData/Local/Temp/ssid-loadthrough-e2e.png' })
  } else {
    bad('rail-nav', 'no rail or too few items after session open (nav=' + nav.present + ' items=' + nav.items + ')')
    await page.screenshot({ path: 'C:/Users/MaxNull/AppData/Local/Temp/ssid-loadthrough-norail.png' })
  }
} catch (err) {
  bad('run', String(err).slice(0, 300))
}

ok('jump-warns', consoleWarns.length === 0, consoleWarns.length === 0 ? 'no chat-rail warns' : 'warns=' + JSON.stringify(consoleWarns.slice(0, 2)))
const realErrors = consoleErrors.filter((e) => !e.includes('favicon'))
ok('console-clean', realErrors.length === 0 ? true : false, realErrors.length === 0 ? 'no page errors' : 'errors=' + JSON.stringify(realErrors.slice(0, 3)))

console.log(results.join('\n'))
console.log('\nSUMMARY: ' + (results.length - failures.length) + '/' + results.length + ' passed')
await browser.close()
process.exit(failures.length > 0 ? 1 : 0)
