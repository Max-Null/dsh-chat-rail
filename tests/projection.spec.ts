/**
 * Host-half projection tests for @max-null/dsh-chat-rail.
 *
 * The rail is driven by the `chatRail` session projection: a durable
 * enumeration of the session's USER-sent messages. These tests exercise the
 * projection definition through the plugin's `apply` entry, exactly as the
 * host runtime would register it.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apply, Config } from '../src/index.ts'

interface ProjectionDef {
  key: string
  schema: { parse: (v: unknown) => unknown }
  init: () => unknown
  apply: (state: unknown, event: unknown) => unknown
  view: (state: unknown) => unknown
  stateVersion: number
}

function loadProjection(): ProjectionDef {
  let def: ProjectionDef | undefined
  apply({
    inject: (_deps: string[], fn: (c: { sessionProjections: { register: (d: ProjectionDef) => void } }) => void) => {
      fn({ sessionProjections: { register: (d) => { def = d } } })
    },
  })
  if (!def) throw new Error('projection was not registered')
  return def
}

function userMessageEvent(overrides: Record<string, unknown> = {}) {
  return {
    type: 'user/message',
    seq: 12,
    time: 1_752_000_000_000,
    data: {
      source: { kind: 'user' },
      id: 'msg-1',
      content: [{ type: 'text', text: 'hello' }],
      ...overrides,
    },
  }
}

test('registers the chatRail projection', () => {
  const def = loadProjection()
  assert.equal(def.key, 'chatRail')
  assert.deepEqual(def.init(), { messages: [] })
  assert.equal(def.stateVersion, 4)
})

test('appends an anchor for a direct user message', () => {
  const def = loadProjection()
  const state = def.apply(def.init(), userMessageEvent())
  assert.deepEqual(state, {
    messages: [{ seq: 12, time: 1_752_000_000_000, text: 'hello', id: 'msg-1' }],
  })
})

test('caps preview text at 80 characters', () => {
  const def = loadProjection()
  const long = 'x'.repeat(200)
  const state = def.apply(def.init(), userMessageEvent({ content: [{ type: 'text', text: long }] }))
  const messages = (state as { messages: { text: string }[] }).messages
  assert.equal(messages[0].text.length, 80)
})

test('joins multiple text blocks', () => {
  const def = loadProjection()
  const state = def.apply(def.init(), userMessageEvent({
    content: [{ type: 'text', text: 'a' }, { type: 'tool_use', name: 'x' }, { type: 'text', text: 'b' }],
  }))
  const messages = (state as { messages: { text: string }[] }).messages
  assert.equal(messages[0].text, 'ab')
})

test('ignores non-user sources (tool and plugin injected context)', () => {
  const def = loadProjection()
  for (const kind of ['job', 'tool', 'cron', 'agent.inject']) {
    const state = def.apply(def.init(), userMessageEvent({ source: { kind } }))
    assert.deepEqual(state, { messages: [] }, `kind ${kind} must be ignored`)
  }
})

test('ignores user/message events without a durable id', () => {
  const def = loadProjection()
  const state = def.apply(def.init(), userMessageEvent({ id: null }))
  assert.deepEqual(state, { messages: [] })
})

test('ignores non-user/message events', () => {
  const def = loadProjection()
  const state = def.apply(def.init(), { type: 'assistant/message', seq: 13, time: 1, data: {} })
  assert.deepEqual(state, { messages: [] })
})

test('view returns the accumulated state', () => {
  const def = loadProjection()
  const state = def.apply(def.init(), userMessageEvent())
  assert.equal(def.view(state), state)
})

test('config schema accepts an empty value', () => {
  assert.deepEqual(Config['~standard'].validate(undefined), { value: {} })
})
