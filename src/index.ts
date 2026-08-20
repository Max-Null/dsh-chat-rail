/**
 * @max-null/dsh-chat-rail — host half.
 *
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

export interface ChatRailAnchor {
  /** Event seq (ordering). */
  seq: number
  /** Event time. */
  time: number
  /** Preview text (capped). */
  text: string
  /** Whether the user message carries an image block (rc.8 attachments). */
  hasImage: boolean
  /** Durable message id used to reconstruct the chat node anchor for jumping. */
  id: string
}

const messageIndexProjectionDefinition = {
  key: PROJECTION_KEY,
  schema: { parse: (val: unknown) => val },
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
      return { messages: [...state.messages, { seq: event.seq, time: event.time, text, hasImage, id }] }
    }
    return state
  },
  view: (state: { messages: ChatRailAnchor[] }) => state,
  stateVersion: 5,
}

const Config = {
  '~standard': {
    version: 1,
    vendor: 'chat-rail',
    validate: (value: unknown) => ({ value: value ?? {} }),
  },
}

function apply(ctx: { inject: (deps: string[], fn: (c: { sessionProjections: { register: (d: unknown) => void } }) => void) => void }): void {
  ctx.inject(['sessionProjections'], (projectionCtx) => {
    projectionCtx.sessionProjections.register(messageIndexProjectionDefinition)
  })
}

export { apply, Config }
