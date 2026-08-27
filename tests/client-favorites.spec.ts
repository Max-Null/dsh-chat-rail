/**
 * Favorites pure-logic tests for @max-null/dsh-chat-rail.
 *
 * The favorites store is a thin localStorage-backed map (sessionId ->
 * messageId[]); these cover the pure list/toggle/filter helpers and the DOM
 * anchor-key id extraction. The React wiring and DOM injector are exercised
 * by the live GUI (same policy as client-images.spec.ts).
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  favoriteIdsOf,
  isFavorite,
  messageIdOfAnchorKey,
  readFavorites,
  toggleFavoriteId,
} from '../src/client/index.tsx'

test('toggleFavoriteId adds then removes an id', () => {
  let list: string[] = []
  list = toggleFavoriteId(list, 'msg-a')
  assert.deepEqual(list, ['msg-a'])
  list = toggleFavoriteId(list, 'msg-b')
  assert.deepEqual(list, ['msg-a', 'msg-b'])
  list = toggleFavoriteId(list, 'msg-a')
  assert.deepEqual(list, ['msg-b'])
})

test('toggleFavoriteId never mutates the input list', () => {
  const input = ['a']
  const out = toggleFavoriteId(input, 'b')
  assert.deepEqual(input, ['a'])
  assert.deepEqual(out, ['a', 'b'])
})

test('favoriteIdsOf normalizes a session list and tolerates garbage', () => {
  assert.deepEqual(favoriteIdsOf({ s1: ['a', 1, null, 'b'] }, 's1'), ['a', 'b'])
  assert.deepEqual(favoriteIdsOf({ s1: 'not-an-array' }, 's1'), [])
  assert.deepEqual(favoriteIdsOf({}, 'missing'), [])
})

test('isFavorite reads the per-session membership', () => {
  const map = { s1: ['a'], s2: ['b'] }
  assert.equal(isFavorite(map, 's1', 'a'), true)
  assert.equal(isFavorite(map, 's2', 'a'), false)
  assert.equal(isFavorite(map, 's3', 'a'), false)
})

test('readFavorites survives malformed storage payloads', () => {
  // localStorage is undefined in the node test runtime → {}
  assert.deepEqual(readFavorites(), {})
})

test('messageIdOfAnchorKey extracts the durable id from the DOM anchor', () => {
  assert.equal(messageIdOfAnchorKey('13:input-messagemsg-123'), 'msg-123')
  assert.equal(messageIdOfAnchorKey('13:input-message'), '')
  // Non-anchor keys pass through unchanged (defensive).
  assert.equal(messageIdOfAnchorKey('call:42'), 'call:42')
})
