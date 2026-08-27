/** Hover shots with the pc-overlay removed (it absorbs pointer events only in headless run). */
import { chromium } from 'playwright-core'

const URL = 'http://127.0.0.1:3081/'
const PIN = '28281801'
const CHROME = 'C:/Users/MaxNull/AppData/Local/ms-playwright/chromium-1237/chrome-win64/chrome.exe'

const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForTimeout(1500)
const gate = await page.evaluate(() => document.body.innerText.includes('访问密码'))
if (gate) { const i = await page.$('input'); if (i) { await i.fill(PIN); await page.keyboard.press('Enter'); await page.waitForTimeout(4000) } }

await page.evaluate(() => {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node !== null) {
    if ((node.textContent ?? '').includes('确认open-sea-skin优化提R')) { node.parentElement?.click(); break }
    node = walker.nextNode()
  }
})
await page.waitForTimeout(10000)
for (let attempt = 0; attempt < 6; attempt++) {
  const has = await page.evaluate(() => document.body.innerText.includes('插件更新'))
  if (!has) break
  await page.keyboard.press('Escape')
  await page.waitForTimeout(600)
}
await page.evaluate(() => document.querySelector('[data-crl-star]')?.scrollIntoView({ block: 'center' }))
await page.waitForTimeout(600)

// Neutralize any overlay that would swallow pointer events for the mouse.
await page.evaluate(() => {
  for (const el of document.querySelectorAll('div')) {
    const cls = (el.className ?? '').toString()
    if (cls.includes('pc-overlay') || cls.includes('overlay')) {
      el.style.pointerEvents = 'none'
    }
  }
})

async function shotHover(sel, file) {
  const box = await page.evaluate((selector) => {
    const el = document.querySelector(selector)
    if (el === null) return null
    const r = el.getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height }
  }, sel)
  if (box === null) { console.log('MISS', sel); return }
  await page.mouse.move(box.x + box.w / 2, box.y + box.h / 2)
  await page.waitForTimeout(1000)
  await page.screenshot({ path: file, clip: { x: box.x - 80, y: box.y - 90, width: box.w + 160, height: box.h + 130 } })
  console.log('SHOT', sel)
}

await shotHover('[data-crl-star]', 'C:/Users/MaxNull/AppData/Local/Temp/ssid-hover-star.png')
await shotHover('[data-crl-fill]', 'C:/Users/MaxNull/AppData/Local/Temp/ssid-hover-plus.png')
await shotHover('button[aria-label="复制"], button[aria-label="Copy"]', 'C:/Users/MaxNull/AppData/Local/Temp/ssid-hover-copy.png')
await browser.close()
