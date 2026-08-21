/**
 * Client-half image handling tests for @max-null/dsh-chat-rail.
 *
 * These cover the pure extraction layers only: projection `images` wiring
 * (normalize) and ContentBlock → ImageSpec conversion. The React thumbnail
 * component itself is exercised by the live GUI, where sessions and the
 * attachment RPC are real.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { imageSpecsOfContent, normalize } from '../src/client/index.tsx'

test('normalize carries projection image references', () => {
  const m = normalize({
    seq: 1,
    time: 1_752_000_000_000,
    text: 'hi',
    hasImage: true,
    images: [
      { attachmentId: 'att-1', mediaType: 'image/png', width: 10, height: 20 },
      { attachmentId: 'att-2', mediaType: 'image/jpeg', width: 30, height: 40 },
    ],
    id: 'msg-1',
  })
  assert.deepEqual(m?.images, [
    { attachmentId: 'att-1', mediaType: 'image/png', width: 10, height: 20 },
    { attachmentId: 'att-2', mediaType: 'image/jpeg', width: 30, height: 40 },
  ])
})

test('normalize tolerates malformed or missing images entries', () => {
  const m = normalize({
    seq: 2, time: 1, text: 'x', hasImage: true,
    images: [null, { attachmentId: '' }, { attachmentId: 'ok' }],
    id: 'msg-2',
  })
  assert.deepEqual(m?.images, [{ attachmentId: 'ok', mediaType: 'image/png', width: 0, height: 0 }])
  const legacy = normalize({ seq: 3, time: 1, text: 'y', hasImage: true, id: 'msg-3' })
  assert.equal(legacy?.images, undefined)
})

test('imageSpecsOfContent maps reference blocks to ref specs', () => {
  const specs = imageSpecsOfContent([
    { type: 'text', text: '看图' },
    { type: 'image', attachment: { attachmentId: 'att-1', mediaType: 'image/webp' } },
  ])
  assert.deepEqual(specs, [{ kind: 'ref', attachmentId: 'att-1', mediaType: 'image/webp' }])
})

test('imageSpecsOfContent maps inline base64 blocks to data URLs', () => {
  const specs = imageSpecsOfContent([
    { type: 'image', mediaType: 'image/png', data: 'aGk=' },
  ])
  assert.deepEqual(specs, [{ kind: 'data', src: 'data:image/png;base64,aGk=' }])
})

test('imageSpecsOfContent ignores blocks without usable payload', () => {
  assert.deepEqual(imageSpecsOfContent([{ type: 'image' }]), [])
  assert.deepEqual(imageSpecsOfContent([{ type: 'image', attachment: {} }]), [])
  assert.deepEqual(imageSpecsOfContent('not-an-array'), [])
})
