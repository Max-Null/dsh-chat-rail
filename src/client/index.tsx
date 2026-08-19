/**
 * @max-null/dsh-chat-rail — web client half.
 *
 * Right-edge conversation navigation rail: one indicator per user message,
 * scroll-spy highlight of the reading position, hover preview, click to jump.
 *
 * Two deliberate fixes over the dsh-chat-timeline reference:
 *
 * 1. ANIMATION SYNC with dsh-better-sidebar. better-sidebar drives its layout
 *    push through the `--dsh-sidebar-width` CSS variable on `:root` (the
 *    `#root` margin-right transition reads the same variable). The rail's
 *    `right` is `calc(var(--dsh-sidebar-width, 0px) + 12px)` with the same
 *    transition timing, so rail and scrollport move together while the panel
 *    expands — no "panel first, scrollbar later" lag.
 *
 * 2. VISIBILITY. The reference rail is 34px wide with 8×2px rgba(0,0,0,.16)
 *    lines — nearly invisible on a light background. Here the rail keeps a
 *    constant translucent capsule, thicker/darker indicator lines, and an
 *    always-visible collapsed state (no "reveal on pointer proximity").
 *
 * Data: host `chatRail` projection first, loaded chat nodes fallback, then a
 * background loadOlder loop (stopped as soon as the projection delivers).
 * Mounted in conversation.input.dock, portal-rendered to body.
 */

import { createElement, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { ISessions } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the ui-conversation SlotMap merge (the input.dock entry).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'

export const inject = ['slots', 'sessions']

// ---- i18n (DSH locale-aware, zh/en) ----
type LocaleId = 'zh' | 'en'
const STRINGS: Record<LocaleId, Record<string, string>> = {
  zh: {
    railLabel: '消息导航',
    roleUser: '用户',
    noText: '（无文本内容）',
    ariaJump: '跳转到消息',
    loading: '加载中…',
    timeJustNow: '刚刚',
    timeMinutes: '{n}分钟前',
    timeHours: '{n}小时前',
    timeDays: '{n}天前',
  },
  en: {
    railLabel: 'Message rail',
    roleUser: 'User',
    noText: '(no text)',
    ariaJump: 'Jump to message',
    loading: 'Loading…',
    timeJustNow: 'just now',
    timeMinutes: '{n}m ago',
    timeHours: '{n}h ago',
    timeDays: '{n}d ago',
  },
}

/** Compact relative time for a message timestamp (zh/en via template). */
function relativeTime(ts: number, s: Record<string, string>): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return s.timeJustNow
  if (diff < 3_600_000) return s.timeMinutes.replace('{n}', String(Math.floor(diff / 60_000)))
  if (diff < 86_400_000) return s.timeHours.replace('{n}', String(Math.floor(diff / 3_600_000)))
  if (diff < 7 * 86_400_000) return s.timeDays.replace('{n}', String(Math.floor(diff / 86_400_000)))
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

// ---- styles ----
// 画卷式导航：单个容器，折叠态 36px 竖条；hover 时宽度从右往左展开到 280px
// （打开画卷效果）。容器垂直方向在「去掉底栏后的可用区域」内居中：
// top = (100vh - 底栏高)/2 + translateY(-50%)，底栏收起时正中、展开时上移避让。
// right 跟随 --dsh-sidebar-width、top 跟随 --dsh-sidebar-height，与 better-sidebar
// 面板共享同一 CSS 变量 + transition，动画同步。
const css = [
  '.crl_nav{user-select:none;z-index:100;position:fixed;right:calc(var(--dsh-sidebar-width,0px) + 12px);top:calc((100vh - var(--dsh-sidebar-height,0px)) / 2);transform:translateY(-50%);width:36px;max-height:min(60vh,420px,calc(100vh - var(--dsh-sidebar-height,0px) - 40px));display:flex;flex-direction:column;align-items:center;box-sizing:border-box;padding:10px 0;border-radius:18px;overflow-y:hidden;overflow-x:hidden;background:rgba(255,255,255,.55);border:1px solid rgba(0,0,0,.07);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);scrollbar-width:thin;scrollbar-color:rgba(0,0,0,.18) transparent;transition:width .25s cubic-bezier(.4,0,.2,1),right var(--ds-transition-duration-slow,0.3s) var(--ds-ease-in-out,ease-in-out),top var(--ds-transition-duration-slow,0.3s) var(--ds-ease-in-out,ease-in-out),background .2s ease,border-color .2s ease,box-shadow .2s ease}',
  'body[data-ds-dark-theme] .crl_nav,[data-theme=\'dark\'] .crl_nav,.dark .crl_nav{background:rgba(28,28,32,.6);border-color:rgba(255,255,255,.09);scrollbar-color:rgba(255,255,255,.25) transparent}',
  '.crl_nav.crl_show{width:280px;overflow-y:auto;align-items:stretch;background:rgba(255,255,255,.94);border-color:rgba(0,0,0,.08);box-shadow:0 10px 30px rgba(0,0,0,.10),0 2px 8px rgba(0,0,0,.05)}',
  'body[data-ds-dark-theme] .crl_nav.crl_show,[data-theme=\'dark\'] .crl_nav.crl_show,.dark .crl_nav.crl_show{background:rgba(28,28,32,.96);border-color:rgba(255,255,255,.09);box-shadow:0 10px 30px rgba(0,0,0,.5),0 2px 8px rgba(0,0,0,.28)}',
  '.crl_nav::-webkit-scrollbar{width:4px}',
  '.crl_nav::-webkit-scrollbar-thumb{background:rgba(0,0,0,.18);border-radius:4px}',
  // Jump-in-progress indicator: sticky row pinned at the rail top. The spinner
  // icon is always visible; the "Loading…" label only appears once expanded
  // (in the collapsed 36px rail the text would overflow the capsule).
  '.crl_loading{position:sticky;top:0;z-index:2;flex-shrink:0;width:100%;padding:4px 0;font-size:10px;line-height:1;text-align:center;color:var(--dsw-alias-label-secondary,var(--text-muted,rgba(0,0,0,.5)));background:inherit;pointer-events:none}',
  '.crl_loading::before{content:"";display:inline-block;width:8px;height:8px;margin-right:4px;border:1.5px solid var(--dsw-alias-state-business-primary,#4d6bfe);border-top-color:transparent;border-radius:50%;vertical-align:-1px;animation:crl-spin .8s linear infinite}',
  '.crl_loading .crl_loadingLabel{display:none}',
  '.crl_show .crl_loading .crl_loadingLabel{display:inline}',
  '@keyframes crl-spin{to{transform:rotate(360deg)}}',
  // Item row: always flex-end (the indicator rides the right edge through the
  // width animation, never jumping). The collapsed padding (0 9px) centers the
  // 18px indicator in the 36px capsule; the expanded padding (0 14px) clears
  // the text. Padding transitions with the same timing as the width, so the
  // indicator glides smoothly instead of snapping when text hides/shows.
  '.crl_item{cursor:pointer;flex-shrink:0;height:32px;min-height:32px;display:flex;justify-content:flex-end;align-items:center;width:100%;box-sizing:border-box;padding:0 9px;line-height:20px;background:none;border:none;font:inherit;text-align:left;color:rgba(0,0,0,.68);transition:padding .25s cubic-bezier(.4,0,.2,1),color .15s ease}',
  '.crl_show .crl_item{padding:0 14px}',
  '.crl_item:hover{color:rgba(0,0,0,.95)}',
  '.crl_item.crl_active{color:var(--dsw-alias-state-business-primary,#4d6bfe)}',
  'body[data-ds-dark-theme] .crl_item,[data-theme=\'dark\'] .crl_item,.dark .crl_item{color:rgba(255,255,255,.68)}',
  'body[data-ds-dark-theme] .crl_item:hover,[data-theme=\'dark\'] .crl_item:hover,.dark .crl_item:hover{color:rgba(255,255,255,.95)}',
  // Title / ordinal / time: display:none in collapsed state (so they take no
  // flex space and the indicator line stays centered), revealed on expand.
  // The ordinal has a fixed width (right-aligned) so message text starts at
  // the same x across items; time sits AFTER the title (no fixed width, so it
  // never shrinks the text area).
  '.crl_title{display:none;font-size:13px;line-height:20px;text-overflow:ellipsis;white-space:nowrap;margin-right:8px;flex:1;min-width:0;text-align:left;overflow:hidden;color:inherit}',
  '.crl_show .crl_title{display:block;animation:crl-fade .18s ease}',
  '.crl_item.crl_active .crl_title{color:var(--dsw-alias-state-business-primary,#4d6bfe);font-weight:500}',
  '.crl_num{display:none;flex-shrink:0;width:28px;font-size:10px;line-height:20px;color:rgba(0,0,0,.35);margin-right:8px;text-align:right;user-select:none}',
  '.crl_show .crl_num{display:block;animation:crl-fade .18s ease}',
  'body[data-ds-dark-theme] .crl_num,[data-theme=\'dark\'] .crl_num,.dark .crl_num{color:rgba(255,255,255,.35)}',
  '.crl_time{display:none;flex-shrink:0;font-size:10px;line-height:20px;color:rgba(0,0,0,.28);margin-right:10px;user-select:none;white-space:nowrap}',
  '.crl_show .crl_time{display:block;animation:crl-fade .18s ease}',
  'body[data-ds-dark-theme] .crl_time,[data-theme=\'dark\'] .crl_time,.dark .crl_time{color:rgba(255,255,255,.28)}',
  '@keyframes crl-fade{from{opacity:0}to{opacity:1}}',
  // Indicator line: 10×3px, clearly visible in both themes.
  '.crl_ind{flex-shrink:0;display:flex;justify-content:center;align-items:center;width:18px;height:20px}',
  '.crl_show .crl_ind{margin-left:8px}',
  '.crl_line{background-color:rgba(0,0,0,.45);border-radius:4px;flex-shrink:0;width:10px;height:3px;transition:background-color .2s ease,transform .2s ease}',
  '.crl_item:hover .crl_line{background-color:rgba(0,0,0,.9)}',
  '.crl_item.crl_active .crl_line{background-color:var(--dsw-alias-state-business-primary,#4d6bfe);transform-origin:50%;transform:scale(1.4);box-shadow:0 0 6px var(--dsw-alias-state-business-primary,#4d6bfe)}',
  'body[data-ds-dark-theme] .crl_line,[data-theme=\'dark\'] .crl_line,.dark .crl_line{background-color:rgba(255,255,255,.5)}',
  'body[data-ds-dark-theme] .crl_item:hover .crl_line,[data-theme=\'dark\'] .crl_item:hover .crl_line,.dark .crl_item:hover .crl_line{background-color:rgba(255,255,255,.95)}',
  'body[data-ds-dark-theme] .crl_item.crl_active .crl_line,[data-theme=\'dark\'] .crl_item.crl_active .crl_line,.dark .crl_item.crl_active .crl_line{background-color:var(--dsw-alias-state-business-primary,#4d6bfe)}',
  // Full-content hover panel: floats to the LEFT of the expanded rail list.
  '.crl_tip{position:fixed;z-index:200;max-width:360px;max-height:70vh;overflow-y:auto;padding:10px 12px;font-size:12px;line-height:1.6;color:var(--dsw-alias-label-primary,var(--text-primary,rgba(0,0,0,.85)));background:var(--dsw-alias-surface-raised,var(--bg-elevated,rgba(255,255,255,.97)));border:1px solid var(--dsw-alias-border-l2,var(--border-default,rgba(0,0,0,.12)));border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.16);white-space:pre-wrap;word-break:break-word;pointer-events:none}',
  'body[data-ds-dark-theme] .crl_tip,[data-theme=\'dark\'] .crl_tip,.dark .crl_tip{background:var(--dsw-alias-surface-raised,var(--bg-elevated,rgba(28,28,32,.97)));border-color:var(--dsw-alias-border-l2,var(--border-default,rgba(255,255,255,.14)))}',
  '@media (prefers-reduced-motion:reduce){.crl_nav,.crl_title,.crl_num,.crl_time,.crl_line{transition:none}}',
].join('')

const STYLE_ID = '@max-null/dsh-chat-rail/styles.module.css'
if (typeof document !== 'undefined' && document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`) === null) {
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-chat-rail'
  tag.dataset.pluginCss = STYLE_ID
  tag.textContent = css
  document.head.appendChild(tag)
}

const S = {
  nav: 'crl_nav',
  navShow: 'crl_show',
  item: 'crl_item',
  itemActive: 'crl_active',
  title: 'crl_title',
  num: 'crl_num',
  time: 'crl_time',
  ind: 'crl_ind',
  line: 'crl_line',
  loading: 'crl_loading',
  loadingLabel: 'crl_loadingLabel',
  tip: 'crl_tip',
}

// ---- data helpers ----
const NOOP_STORE = { getSnapshot: () => undefined, subscribe: () => () => {} }

interface RailMessage {
  seq: number
  time: number
  text: string
  key?: string
  id?: string
}

/** Extract preview text from a user message's ContentBlock list. */
function userTextOf(content: unknown): string {
  if (!Array.isArray(content)) return ''
  let out = ''
  for (const block of content) {
    if (block !== null && typeof block === 'object' && (block as { type?: unknown }).type === 'text'
      && typeof (block as { text?: unknown }).text === 'string') {
      out += (block as { text: string }).text
    }
  }
  return out.trim().slice(0, 80)
}

/** Normalize one projection entry to a rail message. */
function normalize(m: unknown): RailMessage | null {
  if (m === null || typeof m !== 'object') return null
  const o = m as Record<string, unknown>
  if (typeof o.seq !== 'number') return null
  // Host projection emits `text`; keep `preview` as a defensive fallback in
  // case an older projection payload is still cached in the browser.
  const text = typeof o.text === 'string' ? o.text : typeof o.preview === 'string' ? o.preview : ''
  return {
    seq: o.seq,
    time: typeof o.time === 'number' ? o.time : 0,
    text,
    ...(typeof o.key === 'string' ? { key: o.key } : {}),
    ...(typeof o.id === 'string' ? { id: o.id } : {}),
  }
}

/** Fallback collector: enumerate user messages from the loaded chat nodes. */
function collectFromNodes(snapshot: unknown): RailMessage[] {
  const out: RailMessage[] = []
  if (snapshot === undefined || (snapshot as { chat?: unknown }).chat === undefined) return out
  const chat = (snapshot as { chat: { nodes?: Map<unknown, unknown> } }).chat
  if (!chat.nodes) return out
  for (const node of chat.nodes.values()) {
    if (node === null || typeof node !== 'object') continue
    const n = node as { kind?: unknown; key?: unknown; anchorSeq?: unknown; data?: unknown }
    if (n.kind !== 'user') continue
    const data = n.data as { time?: unknown; content?: unknown } | null
    if (data === null || typeof data !== 'object') continue
    if (typeof data.time !== 'number' || !Array.isArray(data.content)) continue
    const key = typeof n.key === 'string' ? n.key : undefined
    if (key === undefined) continue
    out.push({ seq: typeof n.anchorSeq === 'number' ? n.anchorSeq : 0, time: data.time, text: userTextOf(data.content), key })
  }
  out.sort((a, b) => a.seq - b.seq)
  return out
}

/** Resolve the chat node's data-chat-anchor-key (direct key or id-reconstructed). */
function anchorKeyOf(m: RailMessage): string | undefined {
  if (typeof m.key === 'string' && m.key !== '') return m.key
  if (typeof m.id === 'string' && m.id !== '') return '13:input-message' + m.id
  return undefined
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Ensure the message node is loaded into the visible window, then scroll to it.
 * loadOlder pages 50 messages at a time (DSH PAGE_MESSAGES), so a jump far back
 * in a long session needs many pages. Report page count through onProgress so
 * the UI can show a loading state instead of appearing frozen.
 *
 * The paged-in data lands in the session snapshot synchronously with
 * loadOlder's resolution, but the chat rows render through React — the DOM row
 * for the target key appears a beat later. We therefore poll for the row (with
 * a timeout) instead of querying once and giving up; otherwise a multi-page
 * jump would "finish loading" without scrolling and need a second click.
 */
async function jumpToMessage(
  sessionsService: { binding: (id: string) => { session?: { getSnapshot(): unknown; loadOlder(): Promise<unknown>; hasMore?: boolean; loadingOlder?: boolean } } | undefined },
  sessionId: string,
  key: string,
  onProgress?: (pages: number) => void,
): Promise<boolean> {
  const session = sessionsService.binding(sessionId)?.session
  if (session === undefined) return false
  let pages = 0
  let guard = 0
  while (guard++ < 120) {
    const snapshot = session.getSnapshot() as { chat?: { nodes?: Map<string, unknown> }; hasMore?: boolean; loadingOlder?: boolean } | undefined
    if (snapshot?.chat?.nodes?.get(key) !== undefined) break
    if (snapshot?.hasMore !== true) return false
    if (snapshot.loadingOlder === true) {
      // Another loader owns the current page; wait for it without busy-spinning.
      await delay(50)
      continue
    }
    await session.loadOlder()
    pages++
    // Report progress only on page boundaries, not every loop iteration.
    onProgress?.(pages)
  }
  const scrollport = typeof document !== 'undefined' ? document.querySelector('[data-conversation-scroll]') : null
  if (scrollport === null) return false
  // The snapshot is authoritative for "loaded", but the row's DOM node only
  // appears once React renders the prepended page. Poll for it (up to ~5s) so a
  // freshly paged-in jump scrolls on the same click.
  let row: Element | null = null
  let waited = 0
  while (waited++ < 100) {
    row = scrollport.querySelector(`[data-chat-anchor-key="${CSS.escape(key)}"]`)
    if (row !== null) break
    await delay(50)
  }
  if (row === null) return false
  const reducedMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  row.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' })
  return true
}

// ---- component ----
interface TimelineRailProps {
  useProjection: (key: string) => { messages?: unknown[] } | undefined
  sessionId?: SessionId
  sessionsService: ISessions
}

/** Resolve copy for the current UI language (document lang, DSH sets zh/en). */
function langStrings(): Record<string, string> {
  const lang = typeof document !== 'undefined' ? (document.documentElement.lang || 'zh').toLowerCase() : 'zh'
  return STRINGS[lang.startsWith('zh') ? 'zh' : 'en']
}

function TimelineRail({ useProjection, sessionId, sessionsService }: TimelineRailProps): ReactNode {
  const t = langStrings()
  const projected = useProjection('chatRail')
  const session = sessionId === undefined ? undefined : (sessionsService.binding(sessionId) as { session?: { subscribe(cb: () => void): () => void; getSnapshot(): unknown } } | undefined)?.session
  const fallbackStore = session === undefined ? NOOP_STORE : session
  const nodeSnapshot = useSyncExternalStore(
    (cb) => fallbackStore.subscribe(cb),
    () => fallbackStore.getSnapshot(),
  )

  let messages: RailMessage[] = []
  if (Array.isArray(projected?.messages) && projected.messages.length > 0) {
    messages = projected.messages.map(normalize).filter((m): m is RailMessage => m !== null)
  }
  if (messages.length === 0) {
    messages = collectFromNodes(nodeSnapshot)
  }

  const [activeIndex, setActiveIndex] = useState(-1)
  const [show, setShow] = useState(false)
  const [jumping, setJumping] = useState(false)
  // Hover full-content panel: index of the hovered item + fixed position.
  // The tip only triggers after the expand animation settles — in the
  // collapsed state the item rect is only 36px wide, so a tip positioned
  // there would be wrong once the rail expands.
  const [tip, setTip] = useState<{ index: number; x: number; y: number } | null>(null)
  const navRef = useRef<HTMLDivElement | null>(null)
  // True only after the expand animation has fully settled; the width
  // transition takes ~250ms after `show` flips, and item rects are only
  // stable once it finishes. Tip positioning must wait for this.
  const expandedRef = useRef(false)

  /** Position the tip against the item's CURRENT (post-expand) rect. */
  const positionTip = (index: number) => {
    if (index < 0) return
    const el = navRef.current?.querySelector<HTMLElement>(`[data-crl-index="${index}"]`)
    if (el === null || el === undefined) return
    const rect = el.getBoundingClientRect()
    setTip({ index, x: rect.left - 12, y: rect.top })
  }

  /** Handle item hover: the collapsed state only expands the rail; the tip
   *  only triggers once the expand animation has settled (item rects are then
   *  stable, so the tip is positioned correctly). */
  const handleItemEnter = (index: number) => {
    if (!expandedRef.current) {
      setShow(true)
      return
    }
    positionTip(index)
  }

  const handleItemLeave = (index: number) => {
    setTip((prev) => (prev?.index === index ? null : prev))
  }

  // Track the settled expand state: when `show` flips true, wait for the width
  // transition to end before allowing tip triggers; when it flips false, the
  // rail is collapsing — treat as unexpanded immediately.
  useEffect(() => {
    if (!show) {
      expandedRef.current = false
      return
    }
    const el = navRef.current
    if (el === null) return
    const onTransitionEnd = (e: TransitionEvent) => {
      if (e.propertyName !== 'width') return
      expandedRef.current = true
      el.removeEventListener('transitionend', onTransitionEnd)
    }
    el.addEventListener('transitionend', onTransitionEnd)
    return () => el.removeEventListener('transitionend', onTransitionEnd)
  }, [show])

  /** Full text of a rail message from the loaded chat nodes (uncapped),
   *  falling back to the projection preview when the node is not mounted. */
  const fullTextOf = (m: RailMessage): string => {
    const key = anchorKeyOf(m)
    const nodes = (nodeSnapshot as { chat?: { nodes?: Map<string, { data?: { content?: unknown } }> } } | undefined)?.chat?.nodes
    const node = key === undefined ? undefined : nodes?.get(key)
    const content = node?.data?.content
    if (Array.isArray(content)) {
      let out = ''
      for (const block of content) {
        if (block !== null && typeof block === 'object' && (block as { type?: unknown }).type === 'text'
          && typeof (block as { text?: unknown }).text === 'string') {
          out += (block as { text: string }).text
        }
      }
      const full = out.trim()
      if (full !== '') return full
    }
    return m.text
  }

  // Background full-history load: follow the runtime's authoritative hasMore
  // flag, but STOP as soon as the projection delivers.
  useEffect(() => {
    if (session === undefined) return
    if (Array.isArray(projected?.messages) && projected.messages.length > 0) return
    let cancelled = false
    const run = async () => {
      let guard = 0
      while (!cancelled && guard++ < 120) {
        if (Array.isArray(projected?.messages) && projected.messages.length > 0) return
        const snap = session.getSnapshot() as { hasMore?: boolean; loadingOlder?: boolean }
        if (snap?.hasMore !== true) return
        if (snap.loadingOlder === true) { await delay(50); continue }
        await (session as unknown as { loadOlder(): Promise<unknown> }).loadOlder()
      }
    }
    run().catch(() => {})
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, session === undefined ? 'none' : 'ready', Array.isArray(projected?.messages) && projected.messages.length > 0 ? 'have' : 'none'])

  // Track the reading position (active item): nearest row to the 40% viewport line.
  useEffect(() => {
    if (messages.length === 0) return
    const indexByKey = new Map<string, number>()
    for (let i = 0; i < messages.length; i++) {
      const key = anchorKeyOf(messages[i])
      if (key !== undefined) indexByKey.set(key, i)
    }
    const updateActive = () => {
      const sp = document.querySelector('[data-conversation-scroll]')
      if (sp === null) return
      const rect = sp.getBoundingClientRect()
      if (rect.height === 0) return
      const line = rect.top + rect.height * 0.4
      const rows = sp.querySelectorAll('[data-chat-anchor-key^="13:input-message"]')
      let best = -1
      let bestDist = Infinity
      for (const row of rows) {
        const key = row.getAttribute('data-chat-anchor-key')
        if (key === null) continue
        const idx = indexByKey.get(key) ?? -1
        if (idx === -1) continue
        const r = row.getBoundingClientRect()
        const dist = Math.abs(r.top + r.height / 2 - line)
        if (dist < bestDist) { bestDist = dist; best = idx }
      }
      setActiveIndex(best)
    }
    updateActive()
    const el = document.querySelector('[data-conversation-scroll]')
    let scrollTimer: ReturnType<typeof setTimeout> | null = null
    const onScroll = () => {
      if (scrollTimer !== null) return
      scrollTimer = setTimeout(() => { scrollTimer = null; updateActive() }, 60)
    }
    el?.addEventListener('scroll', onScroll, { passive: true })
    const timer = window.setInterval(updateActive, 2000)
    return () => {
      el?.removeEventListener('scroll', onScroll)
      window.clearInterval(timer)
      if (scrollTimer !== null) clearTimeout(scrollTimer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, messages.length])

  // Scroll the rail so the active item stays centered in its visible area:
  // follows the conversation's reading position (and re-centers after a
  // session switch, where activeIndex is recomputed for the new session).
  useEffect(() => {
    if (activeIndex < 0) return
    const el = navRef.current
    if (el === null) return
    const item = el.querySelector<HTMLElement>(`[data-crl-index="${activeIndex}"]`)
    if (item === null) return
    const target = item.offsetTop - el.clientHeight / 2 + item.clientHeight / 2
    el.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
  }, [activeIndex])

  if (sessionId === undefined || messages.length < 2) return null

  const items = messages.map((m, i) => {
    const key = anchorKeyOf(m)
    return createElement('button', {
      type: 'button',
      key: m.seq,
      'data-crl-index': String(i),
      className: S.item + (activeIndex === i ? ` ${S.itemActive}` : ''),
      'aria-label': `${t.roleUser}: ${m.text.slice(0, 60) || t.noText} (${t.ariaJump})`,
      'aria-current': activeIndex === i ? 'location' : undefined,
      disabled: jumping,
      onClick: () => {
        if (key === undefined || jumping) return
        setJumping(true)
        void jumpToMessage(sessionsService as never, sessionId as string, key).finally(() => setJumping(false))
      },
      onMouseEnter: () => handleItemEnter(i),
      onMouseLeave: () => handleItemLeave(i),
      children: [
        createElement('span', { className: S.num }, `#${i + 1}`),
        createElement('span', { className: S.title }, m.text === '' ? t.noText : m.text),
        createElement('span', { className: S.time }, relativeTime(m.time, t)),
        createElement('span', { className: S.ind, 'aria-hidden': true },
          createElement('span', { className: S.line })),
      ],
    })
  })

  return createPortal(
    // Fragment: the nav (transformed) and the tip must be siblings — a fixed
    // child inside a transformed ancestor is positioned relative to that
    // ancestor, breaking the viewport coordinates the tip uses.
    [createElement('div', {
      ref: navRef,
      className: S.nav + (show ? ` ${S.navShow}` : ''),
      role: 'navigation',
      'aria-label': t.railLabel,
      onMouseEnter: () => setShow(true),
      onMouseLeave: () => setShow(false),
      children: [
        jumping ? createElement('div', { className: S.loading, key: 'loading' },
          createElement('span', { className: S.loadingLabel }, t.loading)) : null,
        ...items,
      ],
    }),
    // Full-content panel: anchored to the left of the hovered item.
    tip !== null && tip.index >= 0 && tip.index < messages.length
      ? createElement('div', {
          className: S.tip,
          style: { left: `${tip.x}px`, top: `${tip.y}px`, transform: 'translateX(-100%)' },
        }, fullTextOf(messages[tip.index]) || t.noText)
      : null],
    document.body,
  )
}

function apply(ctx: ClientContext): void {
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'chat-rail',
    order: 40,
    inject: () => ({ sessionsService: ctx.sessions }),
  }, TimelineRail))
}

export { apply, TimelineRail }
