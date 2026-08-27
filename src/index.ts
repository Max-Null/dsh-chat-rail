/**
 * @max-null/dsh-chat-rail — host half.
 * Registers the `chatRail` session projection unit: a complete, durable
 * enumeration of the session's USER-sent messages (seq / time / preview /
 * durable message id). The client rail only needs user turns; assistant
 * replies are excluded so the rail stays compact.
 *
 * Compaction deliberately does not drop user messages: dsh renders a
 * compaction marker row at the checkpoint position but keeps the transcript
 * above it intact, so every user-sent message stays visible on the rail.
 *
 * Architecture reference: dsh-chat-timeline (MIT) — same projection shape.
 */

import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

export const name = 'chat-rail'
const PROJECTION_KEY = 'chatRail'

/** Cap preview text so projection payloads stay small (80 chars ≈ 1-2 lines). */
const MAX_TEXT_CHARS = 80

/** Join the text blocks of a host-side ContentBlock list. */
function textOf(content: unknown): string {
  if (!Array.isArray(content)) return ''
  let out = ''
  for (const block of content) {
    if (block !== null && typeof block === 'object' && (block as { type?: unknown }).type === 'text'
      && typeof (block as { text?: unknown }).text === 'string') {
      out += (block as { text: string }).text
    }
  }
  return out.trim().slice(0, MAX_TEXT_CHARS)
}

/** Whether a ContentBlock list carries an image block (rc.8 多模态附件）。 */
function hasImageBlock(content: unknown): boolean {
  if (!Array.isArray(content)) return false
  return content.some(block => block !== null && typeof block === 'object'
    && (block as { type?: unknown }).type === 'image')
}

/** Stored-image reference metadata carried on one user message (wire-safe). */
export interface ChatRailImageRef {
  /** Opaque storage id resolved with session.readAttachment. */
  attachmentId: string
  /** Media type verified from the stored bytes. */
  mediaType: string
  /** Intrinsic encoded width in pixels. */
  width: number
  /** Intrinsic encoded height in pixels. */
  height: number
}

/** Collect stored-image references from a ContentBlock list (reference form only:
 *  inline base64 data stays out of the payload — it can be megabytes). */
function imageRefsOf(content: unknown): ChatRailImageRef[] {
  if (!Array.isArray(content)) return []
  const refs: ChatRailImageRef[] = []
  for (const block of content) {
    if (block === null || typeof block !== 'object') continue
    const b = block as { type?: unknown; attachment?: unknown }
    if (b.type !== 'image') continue
    const a = b.attachment
    if (a === null || typeof a !== 'object') continue
    const ref = a as { attachmentId?: unknown; mediaType?: unknown; width?: unknown; height?: unknown }
    if (typeof ref.attachmentId !== 'string' || ref.attachmentId === '') continue
    refs.push({
      attachmentId: ref.attachmentId,
      mediaType: typeof ref.mediaType === 'string' ? ref.mediaType : 'image/png',
      width: typeof ref.width === 'number' ? ref.width : 0,
      height: typeof ref.height === 'number' ? ref.height : 0,
    })
  }
  return refs
}

export interface ChatRailAnchor {
  /** Event seq (ordering). */
  seq: number
  /** Event time. */
  time: number
  /** Preview text (capped). */
  text: string
  /** Whether the user message carries an image block (rc.8 attachments). */
  hasImage: boolean
  /** Stored-image references for the tip thumbnail gallery (empty when inline-only). */
  images: ChatRailImageRef[]
  /** Durable message id used to reconstruct the chat node anchor for jumping. */
  id: string
}

const messageIndexProjectionDefinition = {
  key: PROJECTION_KEY,
  // rc.2 起投影 API 分 host-only 与 client-visible 两类：无 wire 的单元
  // 不进 client 快照（历史事件重放后 client 读不到值）。chatRail 是
  // 导航数据，必须带 wire 才能经 history 基线/推帧到达 useProjection。
  stateSchema: { parse: (val: unknown) => val },
  init: () => ({ messages: [] as ChatRailAnchor[] }),
  apply: (state: { messages: ChatRailAnchor[] }, event: { type: string; seq: number; time: number; data: unknown }): { messages: ChatRailAnchor[] } => {
    // Only DIRECT user-sent messages shape the rail. Plugin- and tool-injected
    // context rides the same `user/message` event type with a different
    // `source.kind` (job completions, tool notices, cron notifications,
    // agent.inject context...) — those are context rows in the conversation,
    // not turns the user sent, so they are excluded exactly as the chat view's
    // node assembler classifies them.
    if (event.type === 'user/message') {
      const data = event.data as { source?: { kind?: string } | null; content?: unknown; id?: unknown } | null
      if (data === null || typeof data !== 'object' || data.source === null
        || typeof data.source !== 'object' || data.source.kind !== 'user') {
        return state
      }
      const text = textOf(data.content)
      const hasImage = hasImageBlock(data.content)
      const id = typeof data.id === 'string' ? data.id : ''
      if (!id) return state
      return {
        messages: [...state.messages, {
          seq: event.seq,
          time: event.time,
          text,
          hasImage,
          images: imageRefsOf(data.content),
          id,
        }],
      }
    }
    return state
  },
  wire: {
    viewSchema: { parse: (val: unknown) => val },
    view: (state: { messages: ChatRailAnchor[] }) => state,
  },
  stateVersion: 6,
}

const Config = {
  '~standard': {
    version: 1,
    vendor: 'chat-rail',
    validate: (value: unknown) => ({ value: value ?? {} }),
  },
}

// ── 收藏 host 侧持久化（2026-08-27）：localStorage 按 origin 隔离，思灵 DSH web
// 端口每次启动随机 → 收藏跨重启丢失。改为 host 文件（profile 级，与端口无关）：
//   GET  /chat-rail/api/favorites → { ok, value: Record<sessionId, messageId[]> }
//   PUT  /chat-rail/api/favorites（body: { favorites: map }）→ 原子写
const FAVORITES_PATH = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'chat-rail-favorites.json')
const FAVORITES_ROUTE_PREFIX = '/chat-rail/api/favorites'
type FavoritesMap = Record<string, string[]>

function readFavoritesFile(): FavoritesMap {
  try {
    const parsed = JSON.parse(readFileSync(FAVORITES_PATH, 'utf8')) as unknown
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as FavoritesMap : {}
  } catch {
    return {}
  }
}

function writeFavoritesFile(map: FavoritesMap): void {
  try {
    mkdirSync(dirname(FAVORITES_PATH), { recursive: true })
    writeFileSync(FAVORITES_PATH, JSON.stringify(map), 'utf8')
  } catch { /* 尽力而为（非致命） */ }
}

function sendJson(res: { writeHead: (n: number, h: Record<string, string>) => void, end: (s: string) => void }, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

const favoritesRouteDefinition = {
  kind: 'exact',
  path: FAVORITES_ROUTE_PREFIX,
  handler: async (req: { method?: string, on: (e: string, cb: (c: string) => void) => void }, res: { writeHead: (n: number, h: Record<string, string>) => void, end: (s: string) => void }) => {
    if (req.method === 'GET') {
      sendJson(res, 200, { ok: true, value: readFavoritesFile() })
      return
    }
    if (req.method === 'PUT') {
      let raw = ''
      req.on('data', (chunk: string) => { raw += chunk })
      await new Promise<void>((resolve) => req.on('end', () => resolve()))
      try {
        const body = JSON.parse(raw) as { favorites?: unknown } | null
        const map = body?.favorites
        if (map === null || typeof map !== 'object' || Array.isArray(map)) {
          sendJson(res, 400, { ok: false, error: 'bad-request' })
          return
        }
        writeFavoritesFile(map as FavoritesMap)
        sendJson(res, 200, { ok: true })
      } catch {
        sendJson(res, 400, { ok: false, error: 'bad-request' })
      }
      return
    }
    sendJson(res, 405, { ok: false, error: 'method-not-allowed' })
  },
}

function apply(ctx: { inject: (deps: string[], fn: (c: never) => void) => void }): void {
  ctx.inject(['sessionProjections'] as never, ((projectionCtx: { sessionProjections: { register: (d: unknown) => void } }) => {
    projectionCtx.sessionProjections.register(messageIndexProjectionDefinition)
  }) as never)
  ctx.inject(['webServer'] as never, ((wsCtx: { webServer: { register: (d: unknown) => void } }) => {
    wsCtx.webServer.register(favoritesRouteDefinition)
  }) as never)
}

export { apply, Config }
