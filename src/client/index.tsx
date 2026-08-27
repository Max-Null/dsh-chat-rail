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

import { createElement, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { ISessions } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the ui-conversation SlotMap merge (the input.dock entry).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'

export const inject = ['slots', 'sessions', 'conversation']

// ---- i18n (DSH locale-aware, zh/en) ----
type LocaleId = 'zh' | 'en'
const STRINGS: Record<LocaleId, Record<string, string>> = {
  zh: {
    railLabel: '消息导航',
    roleUser: '用户',
    noText: '（无文本内容）',
    ariaJump: '跳转到消息',
    hasImage: '含图片',
    loading: '加载中…',
    timeJustNow: '刚刚',
    timeMinutes: '{n}分钟前',
    timeHours: '{n}小时前',
    timeDays: '{n}天前',
    fav: '收藏消息',
    unfav: '取消收藏',
    fill: '填充到输入框',
    filled: '已填入输入框',
    favOnly: '只显示收藏',
  },
  en: {
    railLabel: 'Message rail',
    roleUser: 'User',
    noText: '(no text)',
    ariaJump: 'Jump to message',
    hasImage: 'Has image',
    loading: 'Loading…',
    timeJustNow: 'just now',
    timeMinutes: '{n}m ago',
    timeHours: '{n}h ago',
    timeDays: '{n}d ago',
    fav: 'Bookmark message',
    unfav: 'Remove bookmark',
    fill: 'Fill into input',
    filled: 'Filled into input',
    favOnly: 'Bookmarks only',
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
  '.crl_nav{user-select:none;z-index:100;position:fixed;right:calc(var(--dsh-sidebar-width,0px) + 3px);top:calc((100vh - var(--dsh-sidebar-height,0px)) / 2);transform:translateY(-50%);width:36px;max-height:min(60vh,420px,calc(100vh - var(--dsh-sidebar-height,0px) - 40px));display:flex;flex-direction:column;align-items:center;box-sizing:border-box;padding:10px 0;border-radius:18px;overflow-y:hidden;overflow-x:hidden;background:rgba(255,255,255,.55);border:1px solid rgba(0,0,0,.07);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);scrollbar-width:thin;scrollbar-color:rgba(0,0,0,.18) transparent;transition:width .25s cubic-bezier(.4,0,.2,1),right var(--ds-transition-duration-slow,0.3s) var(--ds-ease-in-out,ease-in-out),top var(--ds-transition-duration-slow,0.3s) var(--ds-ease-in-out,ease-in-out),background .2s ease,border-color .2s ease,box-shadow .2s ease}',
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
  // Image badge: hidden in the collapsed state (the rail is a clean 36px
  // capsule of indicator lines; an icon there would crowd and distract) and
  // revealed with the other labels on expand. A quiet stroke glyph in a muted
  // tone that ignores the active-blue text color.
  '.crl_img{display:none;flex-shrink:0;align-items:center;justify-content:center;width:14px;height:14px;margin-left:6px;color:rgba(0,0,0,.38)}',
  '.crl_show .crl_img{display:inline-flex;animation:crl-fade .18s ease}',
  'body[data-ds-dark-theme] .crl_img,[data-theme=\'dark\'] .crl_img,.dark .crl_img{color:rgba(255,255,255,.38)}',
  '.crl_line{background-color:rgba(0,0,0,.45);border-radius:4px;flex-shrink:0;width:10px;height:3px;transition:background-color .2s ease,transform .2s ease}',
  '.crl_item:hover .crl_line{background-color:rgba(0,0,0,.9)}',
  '.crl_item.crl_active .crl_line{background-color:var(--dsw-alias-state-business-primary,#4d6bfe);transform-origin:50%;transform:scale(1.4);box-shadow:0 0 6px var(--dsw-alias-state-business-primary,#4d6bfe)}',
  'body[data-ds-dark-theme] .crl_line,[data-theme=\'dark\'] .crl_line,.dark .crl_line{background-color:rgba(255,255,255,.5)}',
  'body[data-ds-dark-theme] .crl_item:hover .crl_line,[data-theme=\'dark\'] .crl_item:hover .crl_line,.dark .crl_item:hover .crl_line{background-color:rgba(255,255,255,.95)}',
  'body[data-ds-dark-theme] .crl_item.crl_active .crl_line,[data-theme=\'dark\'] .crl_item.crl_active .crl_line,.dark .crl_item.crl_active .crl_line{background-color:var(--dsw-alias-state-business-primary,#4d6bfe)}',
  // Full-content hover panel: floats to the LEFT of the expanded rail list.
  '.crl_tip{position:fixed;z-index:200;max-width:360px;max-height:70vh;overflow-y:auto;padding:10px 12px;font-size:12px;line-height:1.6;color:var(--dsw-alias-label-primary,var(--text-primary,rgba(0,0,0,.85)));background:var(--dsw-alias-surface-raised,var(--bg-elevated,rgba(255,255,255,.97)));border:1px solid var(--dsw-alias-border-l2,var(--border-default,rgba(0,0,0,.12)));border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.16);white-space:pre-wrap;word-break:break-word;pointer-events:none}',
  'body[data-ds-dark-theme] .crl_tip,[data-theme=\'dark\'] .crl_tip,.dark .crl_tip{background:var(--dsw-alias-surface-raised,var(--bg-elevated,rgba(28,28,32,.97)));border-color:var(--dsw-alias-border-l2,var(--border-default,rgba(255,255,255,.14)))}',
  // Tip thumbnail gallery: stacked above the text, one row per image, capped
  // height so a tall screenshot cannot swallow the preview panel. The
  // placeholder pulses while session.readAttachment resolves the bytes; a
  // failed load removes the row entirely rather than showing a broken image.
  '.crl_tipImgs{display:flex;flex-direction:column;gap:6px;margin-bottom:8px}',
  '.crl_tipImgWrap{position:relative;width:fit-content;max-width:100%;max-height:150px}',
  '.crl_tipImg{display:block;max-width:100%;max-height:150px;width:auto;height:auto;object-fit:contain;border-radius:8px;border:1px solid var(--dsw-alias-border-l2,var(--border-default,rgba(0,0,0,.12)))}',
  '.crl_tipImgCount{position:absolute;right:6px;bottom:6px;padding:0 6px;font-size:10px;line-height:16px;border-radius:9px;background:rgba(0,0,0,.55);color:rgba(255,255,255,.95);pointer-events:none}',
  '.crl_tipImgPh{flex-shrink:0;height:56px;border-radius:8px;background:var(--dsw-alias-surface-sunken,var(--bg-muted,rgba(0,0,0,.05)));animation:crl-pulse 1.2s ease-in-out infinite}',
  'body[data-ds-dark-theme] .crl_tipImg,[data-theme=\'dark\'] .crl_tipImg,.dark .crl_tipImg{border-color:var(--dsw-alias-border-l2,var(--border-default,rgba(255,255,255,.14)))}',
  '.crl_tipBadge{display:inline-block;margin-bottom:8px;padding:0 7px;font-size:10px;line-height:16px;border-radius:9px;background:var(--dsw-alias-surface-sunken,var(--bg-muted,rgba(0,0,0,.06)));color:var(--dsw-alias-label-secondary,var(--text-muted,rgba(0,0,0,.45)))}',
  '@keyframes crl-pulse{0%,100%{opacity:.45}50%{opacity:.85}}',
  // Message action buttons injected next to the copy button (DOM row: the
  // user-message IconActions row). The host rows use 28px round icon-action
  // buttons (padding 6, 16px glyphs, DSW token colors, hover fill) — the
  // injected buttons mirror the exact geometry and token surface so the star
  // and plus read as native siblings of copy/branch. The star lights
  // yellowish (#ffd166, milestone-compatible) once favorited.
  '.crl_msgAct{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;margin:0;padding:6px;border:none;border-radius:28px;background:transparent;color:var(--dsw-alias-label-tertiary,rgba(0,0,0,.42));cursor:pointer;transition:background .15s ease,color .15s ease}',
  '.crl_msgAct:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06));color:var(--dsw-alias-label-secondary,rgba(0,0,0,.72))}',
  '.crl_msgAct:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4d6bfe);outline-offset:2px}',
  '.crl_msgAct.crl_fav.crl_on{color:#ffd166}',
  '.crl_msgAct.crl_fav.crl_on svg{fill:currentColor}',
  '.crl_msgAct.crl_fav.crl_on:hover{color:#ffd166}',
  // Rail row favorite badge + yellow indicator line for favorited messages.
  '.crl_favStar{display:none;flex-shrink:0;align-items:center;justify-content:center;width:14px;height:14px;margin-right:6px;color:#ffd166}',
  '.crl_show .crl_favStar{display:inline-flex;animation:crl-fade .18s ease}',
  '.crl_item.crl_favItem .crl_line{background-color:#ffd166}',
  'body[data-ds-dark-theme] .crl_item.crl_favItem .crl_line,[data-theme=\'dark\'] .crl_item.crl_favItem .crl_line,.dark .crl_item.crl_favItem .crl_line{background-color:#ffd166}',
  // Rail-top favorites-only toggle: a star pill above the rows; on state
  // fills the star (yellow) and filters the list to favorited messages.
  '.crl_favToggle{flex-shrink:0;display:flex;align-items:center;justify-content:center;width:26px;height:26px;margin:0 0 6px;padding:0;border:none;border-radius:13px;background:transparent;color:rgba(0,0,0,.4);cursor:pointer;transition:background .15s ease,color .15s ease}',
  '.crl_favToggle:hover{background:rgba(0,0,0,.07);color:rgba(0,0,0,.75)}',
  '.crl_favToggle.crl_on{color:#ffd166;background:rgba(255,209,102,.14)}',
  'body[data-ds-dark-theme] .crl_favToggle,[data-theme=\'dark\'] .crl_favToggle,.dark .crl_favToggle{color:rgba(255,255,255,.4)}',
  'body[data-ds-dark-theme] .crl_favToggle:hover,[data-theme=\'dark\'] .crl_favToggle:hover,.dark .crl_favToggle:hover{background:rgba(255,255,255,.1);color:rgba(255,255,255,.85)}',
  'body[data-ds-dark-theme] .crl_favToggle.crl_on,[data-theme=\'dark\'] .crl_favToggle.crl_on,.dark .crl_favToggle.crl_on{color:#ffd166;background:rgba(255,209,102,.18)}',
  '@media (prefers-reduced-motion:reduce){.crl_nav,.crl_title,.crl_num,.crl_time,.crl_line{transition:none}.crl_tipImgPh{animation:none}}',
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
  img: 'crl_img',
  loading: 'crl_loading',
  loadingLabel: 'crl_loadingLabel',
  tip: 'crl_tip',
  tipImgs: 'crl_tipImgs',
  tipImgWrap: 'crl_tipImgWrap',
  tipImg: 'crl_tipImg',
  tipImgCount: 'crl_tipImgCount',
  tipImgPh: 'crl_tipImgPh',
  tipBadge: 'crl_tipBadge',
  favStar: 'crl_favStar',
  favItem: 'crl_favItem',
  favToggle: 'crl_favToggle',
}

// ---- data helpers ----
const NOOP_STORE = { getSnapshot: () => undefined, subscribe: () => () => {} }

// ---- favorites (persisted per-session bookmark store) ----
// Shape: Record<sessionId, messageId[]>. The durable message id is the same
// identity the host projection emits (`id`) and the DOM anchor encodes
// (`13:input-message<id>`), so DOM-injected buttons and the rail agree on
// the key with no projection hop. localStorage keeps it across reloads;
// the module-level snapshot cache + listener set drive useSyncExternalStore
// (rail) and the injected DOM buttons (refresh on toggle).
const FAVORITES_KEY = '@max-null/dsh-chat-rail:favorites'
type FavoritesMap = Record<string, string[]>

/** Read the persisted favorites map (defensive: malformed JSON → {}). */
export function readFavorites(): FavoritesMap {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(FAVORITES_KEY)
    if (raw === null) return {}
    const value: unknown = JSON.parse(raw)
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as FavoritesMap : {}
  } catch {
    return {}
  }
}

/** Write the favorites map; storage failures are non-fatal (session-only mode). */
function writeFavorites(map: FavoritesMap): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(map))
  } catch {
    // Quota / private mode: the in-memory snapshot keeps working for this page.
  }
}

/** Normalized id list for one session (drops non-string entries). */
export function favoriteIdsOf(map: FavoritesMap, sessionId: string): string[] {
  const list = map[sessionId]
  return Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string') : []
}

/** Toggle one id in a list (stable new array; no in-place mutation). */
export function toggleFavoriteId(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((candidate) => candidate !== id) : [...list, id]
}

/** Whether one message is favorited in one session. */
export function isFavorite(map: FavoritesMap, sessionId: string, messageId: string): boolean {
  return favoriteIdsOf(map, sessionId).includes(messageId)
}

let favoritesCache: FavoritesMap | null = null
const favoritesListeners = new Set<() => void>()

/** Stable snapshot for useSyncExternalStore (loaded once, cached until toggle). */
function favoritesSnapshot(): FavoritesMap {
  if (favoritesCache === null) favoritesCache = readFavorites()
  return favoritesCache
}

/** Subscribe to favorites changes; returns the unsubscribe. */
function subscribeFavorites(listener: () => void): () => void {
  favoritesListeners.add(listener)
  return () => { favoritesListeners.delete(listener) }
}

/** Toggle one message's favorite state: snapshot → new map → persist → notify. */
function toggleFavorite(sessionId: string, messageId: string): void {
  const next = { ...favoritesSnapshot() }
  next[sessionId] = toggleFavoriteId(favoriteIdsOf(favoritesSnapshot(), sessionId), messageId)
  favoritesCache = next
  writeFavorites(next)
  for (const listener of [...favoritesListeners]) listener()
}

/** Remember the messageId read off a DOM anchor key (`13:input-message<id>`). */
export function messageIdOfAnchorKey(key: string): string {
  return key.startsWith('13:input-message') ? key.slice('13:input-message'.length) : key
}

/** The favorite key of one rail message: the durable id when present (host
 *  projection), otherwise the id reconstructed from the node anchor (the
 *  loaded-node fallback path). */
function favoriteIdOfMessage(m: Pick<RailMessage, 'id' | 'key'>): string {
  if (typeof m.id === 'string' && m.id !== '') return m.id
  if (typeof m.key === 'string') return messageIdOfAnchorKey(m.key)
  return ''
}

// ---- message-action injector (DOM) ----
// User-message rows have no official action slot (assistant-actions serves
// assistant turns only), so the star (favorite) and plus (fill-to-input)
// buttons are injected next to the copy button of each user row. The rows
// are located by their anchor key so history paging and re-renders both
// land; the injector is a MutationObserver that re-scans after any DOM
// change and never double-injects (row marker).
//
// Runtime wiring lives in a module-level context the rail component updates
// every render (session id + handlers), so the pure DOM buttons stay tiny:
// they only read data attributes and call context handlers.
const actionCtx: {
  sessionId: string | undefined
  onToggleFavorite: (messageId: string) => void
  onFill: (messageId: string) => void
} = {
  sessionId: undefined,
  onToggleFavorite: () => {},
  onFill: () => {},
}

/** aria-label values of the copy button across shipped locales (button sits
 *  in the user row's IconActions; its parent is the row's action host). */
const COPY_ARIA_LABELS = new Set(['复制', 'Copy', '已复制', 'Copied'])

/** The copy button inside one user message row (null until rendered). */
function copyButtonOf(row: HTMLElement): HTMLButtonElement | null {
  for (const button of row.querySelectorAll<HTMLButtonElement>('button')) {
    const label = button.getAttribute('aria-label')
    if (label !== null && COPY_ARIA_LABELS.has(label)) return button
  }
  return null
}

/** Star SVG path (milestone-compatible glyph, 24-unit viewBox). */
const STAR_PATH = 'm12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z'

/** Build the favorite (star) button for one user message row. */
function favoriteButtonOf(messageId: string, lang: Record<string, string>): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'crl_msgAct crl_fav'
  button.dataset.crlStar = messageId
  button.setAttribute('aria-pressed', String(isFavorite(favoritesSnapshot(), actionCtx.sessionId ?? '', messageId)))
  button.title = isFavorite(favoritesSnapshot(), actionCtx.sessionId ?? '', messageId) ? lang.unfav : lang.fav
  button.setAttribute('aria-label', button.title)
  button.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="${STAR_PATH}"/></svg>`
  button.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    // Read the id off the dataset at click time: the injector may refresh the
    // button for a new session and the closure must stay current.
    const id = button.dataset.crlStar
    if (id !== undefined) {
      actionCtx.onToggleFavorite(id)
      refreshFavoriteButton(button, lang)
    }
  })
  return button
}

/** Build the fill-to-input (plus) button for one user message row. */
function fillButtonOf(messageId: string, lang: Record<string, string>): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'crl_msgAct crl_fill'
  button.dataset.crlFill = messageId
  button.title = lang.fill
  button.setAttribute('aria-label', lang.fill)
  button.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M8 3.5v9M3.5 8h9"/></svg>'
  button.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    const id = button.dataset.crlFill
    if (id !== undefined) actionCtx.onFill(id)
  })
  return button
}

/** Sync one star button to its message's current favorite state. */
function refreshFavoriteButton(button: HTMLButtonElement, lang: Record<string, string>): void {
  const id = button.dataset.crlStar
  if (id === undefined) return
  const starred = isFavorite(favoritesSnapshot(), actionCtx.sessionId ?? '', id)
  button.setAttribute('aria-pressed', String(starred))
  button.dataset.starred = starred ? 'true' : undefined
  button.classList.toggle('crl_on', starred)
  button.title = starred ? lang.unfav : lang.fav
  button.setAttribute('aria-label', button.title)
}

/** Refresh every injected star button (session switch / external toggle). */
function refreshAllFavoriteButtons(lang: Record<string, string>): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-crl-star]')) {
    refreshFavoriteButton(button, lang)
  }
}

/** Inject star + plus buttons into one user message row (idempotent). */
function injectMessageActions(row: HTMLElement, lang: Record<string, string>): void {
  // Already injected and both buttons still present → leave it alone.
  if (row.dataset.crlActions === '1') {
    if (row.querySelector('[data-crl-star]') !== null && row.querySelector('[data-crl-fill]') !== null) return
    // React re-rendered the row and replaced the icons: fall through to re-inject.
  }
  const copy = copyButtonOf(row)
  const messageId = messageIdOfAnchorKey(row.getAttribute('data-chat-anchor-key') ?? '')
  if (copy === null || messageId === '') return
  const star = favoriteButtonOf(messageId, lang)
  star.dataset.starred = isFavorite(favoritesSnapshot(), actionCtx.sessionId ?? '', messageId) ? 'true' : undefined
  star.classList.toggle('crl_on', isFavorite(favoritesSnapshot(), actionCtx.sessionId ?? '', messageId))
  const fill = fillButtonOf(messageId, lang)
  copy.before(star, fill)
  row.dataset.crlActions = '1'
}

/** Start observing new user rows so injected actions follow history paging. */
function startActionInjector(lang: Record<string, string>): () => void {
  const scan = () => {
    for (const row of document.querySelectorAll<HTMLElement>('[data-chat-anchor-key^="13:input-message"]')) {
      injectMessageActions(row, lang)
    }
  }
  const observer = new MutationObserver(scan)
  if (typeof document !== 'undefined' && document.body !== null) {
    observer.observe(document.body, { childList: true, subtree: true })
  }
  scan()
  return () => observer.disconnect()
}

interface RailImage {
  attachmentId: string
  mediaType: string
  width: number
  height: number
}

interface RailMessage {
  seq: number
  time: number
  text: string
  hasImage: boolean
  /** Stored-image references from the host projection (empty when inline-only). */
  images?: RailImage[]
  key?: string
  id?: string
}

/** One displayable tip image: either a durable reference (resolved lazily) or
 *  an inline base64 payload already usable as an <img> src. */
type ImageSpec =
  | { kind: 'ref'; attachmentId: string; mediaType: string }
  | { kind: 'data'; src: string }

/** Extract stored-image references from a ContentBlock list (reference form). */
function nodeImagesOf(content: unknown): RailImage[] {
  if (!Array.isArray(content)) return []
  const out: RailImage[] = []
  for (const block of content) {
    if (block === null || typeof block !== 'object') continue
    const b = block as { type?: unknown; attachment?: unknown }
    if (b.type !== 'image') continue
    const a = b.attachment
    if (a === null || typeof a !== 'object') continue
    const ref = a as { attachmentId?: unknown; mediaType?: unknown; width?: unknown; height?: unknown }
    if (typeof ref.attachmentId !== 'string' || ref.attachmentId === '') continue
    out.push({
      attachmentId: ref.attachmentId,
      mediaType: typeof ref.mediaType === 'string' ? ref.mediaType : 'image/png',
      width: typeof ref.width === 'number' ? ref.width : 0,
      height: typeof ref.height === 'number' ? ref.height : 0,
    })
  }
  return out
}

/** Convert a ContentBlock list to displayable image specs; inline base64
 *  blocks (rare in replayed history) become data URLs on the spot. */
function imageSpecsOfContent(content: unknown): ImageSpec[] {
  const specs: ImageSpec[] = []
  if (!Array.isArray(content)) return specs
  for (const block of content) {
    if (block === null || typeof block !== 'object') continue
    const b = block as { type?: unknown; attachment?: unknown; data?: unknown; mediaType?: unknown }
    if (b.type !== 'image') continue
    const a = b.attachment
    if (a !== null && typeof a === 'object') {
      const ref = a as { attachmentId?: unknown; mediaType?: unknown }
      if (typeof ref.attachmentId === 'string' && ref.attachmentId !== '') {
        specs.push({ kind: 'ref', attachmentId: ref.attachmentId, mediaType: typeof ref.mediaType === 'string' ? ref.mediaType : 'image/png' })
        continue
      }
    }
    if (typeof b.data === 'string' && b.data !== '') {
      specs.push({ kind: 'data', src: `data:${typeof b.mediaType === 'string' ? b.mediaType : 'image/png'};base64,${b.data}` })
    }
  }
  return specs
}

/** Normalize one projection entry to a rail message. */
function normalize(m: unknown): RailMessage | null {
  if (m === null || typeof m !== 'object') return null
  const o = m as Record<string, unknown>
  if (typeof o.seq !== 'number') return null
  // Host projection emits `text`; keep `preview` as a defensive fallback in
  // case an older projection payload is still cached in the browser.
  const text = typeof o.text === 'string' ? o.text : typeof o.preview === 'string' ? o.preview : ''
  const images = Array.isArray(o.images)
    ? o.images.map(nodeImagesOfEntry).filter((i): i is RailImage => i !== null)
    : undefined
  return {
    seq: o.seq,
    time: typeof o.time === 'number' ? o.time : 0,
    text,
    // Older projections lack hasImage; defensive default false.
    hasImage: o.hasImage === true,
    ...(images !== undefined && images.length > 0 ? { images } : {}),
    ...(typeof o.key === 'string' ? { key: o.key } : {}),
    ...(typeof o.id === 'string' ? { id: o.id } : {}),
  }
}

/** Normalize one projection entry of the `images` array (wire form). */
function nodeImagesOfEntry(v: unknown): RailImage | null {
  if (v === null || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  if (typeof o.attachmentId !== 'string' || o.attachmentId === '') return null
  return {
    attachmentId: o.attachmentId,
    mediaType: typeof o.mediaType === 'string' ? o.mediaType : 'image/png',
    width: typeof o.width === 'number' ? o.width : 0,
    height: typeof o.height === 'number' ? o.height : 0,
  }
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

/** Whether a ContentBlock list carries an image block (rc.8 attachments). */
function userHasImage(content: unknown): boolean {
  if (!Array.isArray(content)) return false
  return content.some(block => block !== null && typeof block === 'object'
    && (block as { type?: unknown }).type === 'image')
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
    const images = nodeImagesOf(data.content)
    out.push({
      seq: typeof n.anchorSeq === 'number' ? n.anchorSeq : 0,
      time: data.time,
      text: userTextOf(data.content),
      hasImage: userHasImage(data.content),
      ...(images.length > 0 ? { images } : {}),
      key,
    })
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

/** Full text of a rail message from the loaded chat nodes (uncapped),
 *  falling back to the projection preview when the node is not mounted. */
function fullTextOf(m: RailMessage, nodeSnapshot: unknown): string {
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

/** Displayable tip images for one rail message: host projection references
 *  first (works even before the node window covers the message), then the
 *  loaded chat node's content blocks. */
function tipImagesOf(m: RailMessage, nodeSnapshot: unknown): ImageSpec[] {
  if (Array.isArray(m.images) && m.images.length > 0) {
    return m.images.map(img => ({ kind: 'ref', attachmentId: img.attachmentId, mediaType: img.mediaType }))
  }
  const key = anchorKeyOf(m)
  const nodes = (nodeSnapshot as { chat?: { nodes?: Map<string, { data?: { content?: unknown } }> } } | undefined)?.chat?.nodes
  const node = key === undefined ? undefined : nodes?.get(key)
  return imageSpecsOfContent(node?.data?.content)
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
  signal?: AbortSignal,
): Promise<boolean> {
  const session = sessionsService.binding(sessionId)?.session
  if (session === undefined) return false
  let pages = 0
  let guard = 0
  let loaded = false
  while (guard++ < 120) {
    if (signal?.aborted) return false
    const snapshot = session.getSnapshot() as { chat?: { nodes?: Map<string, unknown> }; hasMore?: boolean; loadingOlder?: boolean } | undefined
    if (snapshot?.chat?.nodes?.get(key) !== undefined) {
      loaded = true
      break
    }
    if (snapshot?.hasMore !== true) break
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
  // Page guard exhausted (or hasMore ran out) without the node materializing:
  // fail fast with context instead of burning the DOM poll below.
  if (!loaded) {
    console.warn(`[chat-rail] jumpToMessage: node "${key}" not loaded after ${pages} page(s)`)
    return false
  }
  const scrollport = typeof document !== 'undefined' ? document.querySelector('[data-conversation-scroll]') : null
  if (scrollport === null) return false
  // The snapshot is authoritative for "loaded", but the row's DOM node only
  // appears once React renders the prepended page. Poll for it (up to ~5s) so a
  // freshly paged-in jump scrolls on the same click.
  let row: Element | null = null
  let waited = 0
  while (waited++ < 100) {
    if (signal?.aborted) return false
    row = scrollport.querySelector(`[data-chat-anchor-key="${CSS.escape(key)}"]`)
    if (row !== null) break
    await delay(50)
  }
  if (row === null) return false
  const reducedMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  row.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' })
  return true
}

// ---- tip image thumbnails ----

/** Session-scoped browser URL cache for resolved attachment bytes (one entry
 *  per session:attachment; a failed load evicts itself so the next hover
 *  retries instead of showing a permanently broken thumbnail). */
const thumbUrls = new Map<string, Promise<string>>()

/** Minimal RpcResult shape of session.readAttachment (contract level). */
interface ReadAttachmentResult {
  ok: boolean
  value?: { attachment?: { mediaType?: string }; data?: Uint8Array }
  error?: { code?: string; message?: string }
}

type ReadAttachmentFn = (attachmentId: string) => Promise<ReadAttachmentResult>

/** Fallback data URL when the browser cannot mint object URLs. */
function bytesToDataUrl(data: Uint8Array, mediaType: string): string {
  let binary = ''
  const chunk = 0x8000
  for (let offset = 0; offset < data.length; offset += chunk) {
    binary += String.fromCharCode(...data.subarray(offset, offset + chunk))
  }
  return `data:${mediaType};base64,${btoa(binary)}`
}

/** Resolve (and cache) one stored image to a displayable URL. */
function resolveThumb(sessionId: string, read: ReadAttachmentFn, image: Pick<RailImage, 'attachmentId' | 'mediaType'>): Promise<string> {
  const key = `${sessionId}:${image.attachmentId}`
  let pending = thumbUrls.get(key)
  if (pending === undefined) {
    pending = read(image.attachmentId).then((result): string => {
      if (!result.ok || result.value === undefined) {
        throw new Error(result.error?.message ?? result.error?.code ?? 'readAttachment failed')
      }
      const data = result.value.data
      if (data === undefined) throw new Error('readAttachment resolved no bytes')
      const mediaType = result.value.attachment?.mediaType ?? image.mediaType
      if (typeof URL.createObjectURL === 'function') {
        return URL.createObjectURL(new Blob([data as BlobPart], { type: mediaType }))
      }
      return bytesToDataUrl(data, mediaType)
    })
    void pending.catch(() => { thumbUrls.delete(key) })
    thumbUrls.set(key, pending)
  }
  return pending
}

/** One tip thumbnail: resolves its attachment lazily, shows a pulsing
 *  placeholder while loading, and removes itself on failure. */
function TipThumb({ spec, sessionId, read }: {
  spec: ImageSpec
  sessionId: string
  read: ReadAttachmentFn
}): ReactNode {
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const specKey = spec.kind === 'ref' ? `ref:${spec.attachmentId}` : 'data'
  useEffect(() => {
    let alive = true
    setSrc(null)
    setFailed(false)
    if (spec.kind === 'data') {
      setSrc(spec.src)
      return () => { alive = false }
    }
    resolveThumb(sessionId, read, spec)
      .then((url) => { if (alive) setSrc(url) })
      .catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
    // spec is a fresh object each render; the string key is the stable identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specKey, sessionId, read])
  if (failed) return null
  if (src === null) return createElement('div', { className: S.tipImgPh, 'aria-hidden': true })
  return createElement('img', { className: S.tipImg, src, alt: '', draggable: false })
}

// ---- component ----
interface TimelineRailProps {
  useProjection: (key: string) => { messages?: unknown[] } | undefined
  sessionId?: SessionId
  sessionsService: ISessions
  /** Draft write + attachment-add face (session-scope framework injection). */
  inputActions?: {
    setDraft(text: string): void
    addImages(ids: readonly string[]): boolean
  } | undefined
  /** Runtime draft-image registry (hosted by ui-conversation). */
  conversation?: {
    createDraftImages(files: readonly File[]): readonly { id: string }[]
  } | undefined
}

/** Resolve copy for the current UI language (document lang, DSH sets zh/en). */
function langStrings(): Record<string, string> {
  const lang = typeof document !== 'undefined' ? (document.documentElement.lang || 'zh').toLowerCase() : 'zh'
  return STRINGS[lang.startsWith('zh') ? 'zh' : 'en']
}

function TimelineRail({ useProjection, sessionId, sessionsService, inputActions, conversation }: TimelineRailProps): ReactNode {
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

  // Favorites: per-session persisted set + a "bookmarks only" filter that
  // narrows the rail to favorited messages (mirrors dsh-milestone's
  // bookmarksOnly toggle; the DOM-injected buttons share the same store).
  const favorites = useSyncExternalStore(subscribeFavorites, favoritesSnapshot)
  const [favOnly, setFavOnly] = useState(false)
  const effectiveMessages = favOnly
    ? messages.filter((m) => sessionId !== undefined && isFavorite(favorites, sessionId, favoriteIdOfMessage(m)))
    : messages

  const [activeIndex, setActiveIndex] = useState(-1)
  const [show, setShow] = useState(false)
  const [jumping, setJumping] = useState(false)
  // Hover full-content panel: index of the hovered item + fixed position.
  // The tip only triggers after the expand animation settles — in the
  // collapsed state the item rect is only 36px wide, so a tip positioned
  // there would be wrong once the rail expands.
  const [tip, setTip] = useState<{ index: number; x: number; y: number } | null>(null)
  const navRef = useRef<HTMLDivElement | null>(null)  // True only after the expand animation has fully settled; the width
  // transition takes ~250ms after `show` flips, and item rects are only
  // stable once it finishes. Tip positioning must wait for this.
  const expandedRef = useRef(false)
  // Last observed pointer position over the rail. A mouseenter that arrives
  // before the width transition cannot show the tip (rects unstable), yet the
  // enter event is already gone by the time the animation ends — the settle
  // handler re-hit-tests the cursor against this position to show the tip for
  // the node still under the pointer.
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null)
  // Aborts an in-flight jump (component unmount or a newer click superseding
  // an older one), so the loadOlder/DOM-poll loops stop promptly.
  const jumpAbortRef = useRef<AbortController | null>(null)
  useEffect(() => () => jumpAbortRef.current?.abort(), [])

  // Track the cursor over the rail for the expand-settled tip re-hit-test
  // (the `show` effect's settle handler reads lastPointerRef). Native
  // listener: plain DOM events keep the callback typed without React
  // synthetic-event generics in the hand-written createElement props.
  useEffect(() => {
    const el = navRef.current
    if (el === null) return
    const onMove = (e: PointerEvent) => { lastPointerRef.current = { x: e.clientX, y: e.clientY } }
    el.addEventListener('pointermove', onMove, { passive: true })
    return () => el.removeEventListener('pointermove', onMove)
  }, [])

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
    let settled = false
    const settle = () => {
      if (settled) return
      settled = true
      expandedRef.current = true
      el.removeEventListener('transitionend', onTransitionEnd)
      clearTimeout(timer)
      // Re-hit-test the cursor: a mouseenter that fired before the width
      // transition could not show the tip (rects were still unstable), and
      // the enter event is long gone once the animation ends. If the pointer
      // still sits on a rail item, position that item's tip now.
      const p = lastPointerRef.current
      if (p !== null) {
        const hit = document.elementFromPoint(p.x, p.y)
        const item = hit === null ? null : hit.closest('[data-crl-index]')
        const idx = item === null ? -1 : Number(item.getAttribute('data-crl-index'))
        if (Number.isInteger(idx) && idx >= 0) positionTip(idx)
      }
    }
    const onTransitionEnd = (e: TransitionEvent) => {
      if (e.propertyName !== 'width') return
      settle()
    }
    el.addEventListener('transitionend', onTransitionEnd)
    // Fallback for `prefers-reduced-motion: reduce` (the stylesheet disables
    // the width transition, so `transitionend` never fires) and for any lost
    // event: settle after the transition duration regardless.
    const timer = setTimeout(settle, 300)
    return () => {
      el.removeEventListener('transitionend', onTransitionEnd)
      clearTimeout(timer)
    }
  }, [show])

  // Session-scoped attachment reader for tip thumbnails (stable identity so
  // TipThumb effects do not re-run every render; resolveThumb caches anyway).
  const readThumb = useMemo<ReadAttachmentFn | undefined>(() => {
    if (sessionId === undefined) return undefined
    const s = (sessionsService.binding(sessionId) as unknown as
      { session?: { readAttachment?: ReadAttachmentFn } } | undefined)?.session
    return s?.readAttachment === undefined
      ? undefined
      : (id: string) => s.readAttachment!(id)
  }, [sessionId, sessionsService])

  // Fill-to-input (plus button): put the message's full text into the draft
  // and re-attach its stored images through the official draft-image path
  // (readAttachment → File → createDraftImages → addImages). Degrades to
  // text-only when the conversation service or storage read is unavailable.
  const fillToInput = useCallback((messageId: string) => {
    const m = messages.find((candidate) => favoriteIdOfMessage(candidate) === messageId)
    if (m === undefined || inputActions === undefined || sessionId === undefined) return
    const text = fullTextOf(m, nodeSnapshot) || m.text
    if (inputActions.setDraft !== undefined) inputActions.setDraft(text)
    const specs = tipImagesOf(m, nodeSnapshot).filter((spec): spec is ImageSpec & { kind: 'ref' } => spec.kind === 'ref')
    if (specs.length === 0 || conversation === undefined || readThumb === undefined) return
    void (async () => {
      const files: File[] = []
      for (const spec of specs) {
        try {
          const result = await readThumb(spec.attachmentId) as unknown as { ok?: boolean; value?: { attachment?: { mediaType?: string }; data?: Uint8Array } }
          if (result?.ok !== true || result.value?.data === undefined) continue
          const mediaType = result.value.attachment?.mediaType ?? spec.mediaType
          files.push(new File([result.value.data as BlobPart], `attachment-${spec.attachmentId}${mediaType.includes('jpeg') ? '.jpg' : '.png'}`, { type: mediaType }))
        } catch {
          // One failed attachment must not block the others.
        }
      }
      if (files.length === 0) return
      const drafts = conversation.createDraftImages(files)
      const ids = drafts.map((draft) => draft.id).filter((id): id is string => id !== undefined)
      if (ids.length > 0) {
        try { inputActions.addImages?.(ids) } catch { /* draft-image registry may reject; text fill already landed */ }
      }
    })()
  }, [conversation, inputActions, messages, nodeSnapshot, readThumb, sessionId])

  // Bridge the DOM-injected buttons (module-level actionCtx) to this
  // component's live closures + session id; refresh star states on every
  // favorites change and on session switch.
  useEffect(() => {
    actionCtx.sessionId = sessionId
    actionCtx.onToggleFavorite = (messageId) => {
      if (sessionId !== undefined) toggleFavorite(sessionId, messageId)
    }
    actionCtx.onFill = fillToInput
    refreshAllFavoriteButtons(t)
    return () => {
      // Only clear what this render set: a newer session may already own the ctx.
      if (actionCtx.sessionId === sessionId) actionCtx.sessionId = undefined
    }
  }, [sessionId, fillToInput, t])

  // Keep the injected DOM buttons in sync with external favorite toggles
  // (rail star / another session's store write).
  useEffect(() => {
    refreshAllFavoriteButtons(t)
  }, [favorites, t])

  // Inject star + plus buttons into every user message row; observe DOM
  // changes so history paging and re-renders keep them present.
  useEffect(() => {
    if (typeof document === 'undefined' || document.body === null) return
    return startActionInjector(t)
  }, [t])

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
    if (effectiveMessages.length === 0) return
    const indexByKey = new Map<string, number>()
    for (let i = 0; i < effectiveMessages.length; i++) {
      const key = anchorKeyOf(effectiveMessages[i])
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
  }, [sessionId, effectiveMessages.length])

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

  // The rail hides on tiny sessions (fewer than 2 user messages) — but the
  // count is the UNFILTERED list: the favorites-only filter may legitimately
  // narrow to a single row, and hiding the rail then would strand the user
  // with no way to switch the filter back off.
  if (sessionId === undefined || messages.length < 2) return null

  // Fav-only filter remaps the tip index into the FULL list (tip content and
  // hover data always come from the unfiltered messages array).
  const tipIndex = tip === null
    ? -1
    : favOnly
      ? messages.findIndex((m) => effectiveMessages[tip.index] !== undefined
        && favoriteIdOfMessage(m) === favoriteIdOfMessage(effectiveMessages[tip.index]))
      : tip.index

  const items = effectiveMessages.map((m, i) => {
    const key = anchorKeyOf(m)
    const starred = favoriteIdOfMessage(m) !== '' && isFavorite(favorites, sessionId, favoriteIdOfMessage(m))
    return createElement('button', {
      type: 'button',
      key: m.seq,
      'data-crl-index': String(i),
      className: S.item + (activeIndex === i ? ` ${S.itemActive}` : '') + (starred ? ` ${S.favItem}` : ''),
      'aria-label': `${t.roleUser}: ${m.text.slice(0, 60) || t.noText} (${t.ariaJump})`,
      'aria-current': activeIndex === i ? 'location' : undefined,
      disabled: jumping,
      onClick: () => {
        if (key === undefined || jumping) return
        jumpAbortRef.current?.abort()
        const controller = new AbortController()
        jumpAbortRef.current = controller
        setJumping(true)
        void jumpToMessage(sessionsService as never, sessionId as string, key, undefined, controller.signal)
          .finally(() => setJumping(false))
      },
      onMouseEnter: () => handleItemEnter(i),
      onMouseLeave: () => handleItemLeave(i),
      children: [
        createElement('span', { className: S.num }, `#${i + 1}`),
        starred
          ? createElement('span', { className: S.favStar, role: 'img', 'aria-label': t.fav, 'aria-hidden': undefined },
            createElement('svg', {
              viewBox: '0 0 24 24',
              width: 13,
              height: 13,
              fill: 'currentColor',
              stroke: 'none',
              'aria-hidden': true,
            },
            createElement('path', { d: STAR_PATH, 'aria-hidden': true })))
          : null,
        createElement('span', { className: S.title }, m.text === '' ? t.noText : m.text),
        m.hasImage
          ? createElement('span', { className: S.img, role: 'img', 'aria-label': t.hasImage },
            createElement('svg', {
              viewBox: '0 0 16 16',
              width: 12,
              height: 12,
              fill: 'none',
              stroke: 'currentColor',
              strokeWidth: 1.4,
              strokeLinecap: 'round',
              strokeLinejoin: 'round',
              'aria-hidden': true,
            },
            createElement('rect', { x: 1.7, y: 2.7, width: 12.6, height: 10.6, rx: 2.2 }),
            createElement('circle', { cx: 5.6, cy: 6.4, r: 1.15, fill: 'currentColor', stroke: 'none' }),
            createElement('path', { d: 'M2.5 11.6l3.6-3.1 2.6 2.2 2.1-1.9 3.3 2.8' })))
          : null,
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
        // Favorites-only filter: a star pill above the rows. On state fills
        // the star (yellow) and narrows the rail to favorited messages.
        createElement('button', {
          type: 'button',
          key: 'favToggle',
          className: S.favToggle + (favOnly ? ' crl_on' : ''),
          'aria-pressed': favOnly,
          'aria-label': t.favOnly,
          title: t.favOnly,
          onMouseEnter: (e: MouseEvent) => e.stopPropagation(),
          onClick: () => setFavOnly((v) => !v),
          children: createElement('svg', {
            viewBox: '0 0 24 24',
            width: 14,
            height: 14,
            fill: favOnly ? 'currentColor' : 'none',
            stroke: 'currentColor',
            strokeWidth: 2,
            strokeLinejoin: 'round',
            'aria-hidden': true,
          }, createElement('path', { d: STAR_PATH })),
        }),
        jumping ? createElement('div', { className: S.loading, key: 'loading' },
          createElement('span', { className: S.loadingLabel }, t.loading)) : null,
        ...items,
      ],
    }),
    // Full-content panel: anchored to the left of the hovered item. Images
    // stack above the text; a message whose image cannot be resolved (no
    // projection refs and unloaded node) shows a quiet "has image" badge.
    tip !== null && tipIndex >= 0 && tipIndex < messages.length
      ? createElement('div', {
          className: S.tip,
          style: { left: `${tip.x}px`, top: `${tip.y}px`, transform: 'translateX(-100%)' },
        }, (() => {
          const m = messages[tipIndex]
          const specs = tipImagesOf(m, nodeSnapshot)
          const children: ReactNode[] = []
          if (specs.length > 0 && readThumb !== undefined) {
            // Only the first image renders; the rest collapse into a "+N"
            // badge so a many-image message cannot push the tip past its
            // viewport cap (the stacked thumbnails did).
            children.push(createElement('div', { className: S.tipImgs, key: 'imgs' },
              createElement('div', { className: S.tipImgWrap, key: 'img' },
                createElement(TipThumb, { spec: specs[0], sessionId: sessionId as string, read: readThumb }),
                specs.length > 1
                  ? createElement('span', { className: S.tipImgCount, 'aria-hidden': true }, `+${specs.length - 1}`)
                  : null)))
          } else if (m.hasImage) {
            children.push(createElement('span', { className: S.tipBadge, key: 'badge' }, t.hasImage))
          }
          children.push(createElement('span', { key: 'text' }, fullTextOf(m, nodeSnapshot) || t.noText))
          return children
        })())
      : null],
    document.body,
  )
}

function apply(ctx: ClientContext): void {
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'chat-rail',
    order: 40,
    inject: () => ({
      sessionsService: ctx.sessions,
      // createDraftImages lives on the concrete ConversationController, not
      // the outward IConversation face; the runtime service is always the
      // controller, so the cast is structural, never a feature guess.
      conversation: ctx.conversation as unknown as { createDraftImages(files: readonly File[]): readonly { id: string }[] },
    }),
  }, TimelineRail))
}

export { apply, TimelineRail, imageSpecsOfContent, normalize }
