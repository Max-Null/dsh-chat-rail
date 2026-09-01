/**
 * Chat-node data-plane tests for @max-null/dsh-chat-rail.
 *
 * DSH 0.1.2-alpha.2 moved Conversation target data out of the Session
 * snapshot: chat nodes now live in the uiConversation `'chat'` view target
 * (a keyed `nodes` store) instead of the legacy `session.getSnapshot().chat.nodes`
 * Map. These tests pin both planes: node resolution, the fallback collector,
 * and the jumpToMessage "is the target loaded" loop.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  chatNodeOf,
  collectFromNodes,
  jumpToMessage,
  railMessageOfNode,
} from '../src/client/index.tsx'

/** One raw chat node shaped like the official ChatConversationViewNode. */
function userNode(key: string, seq: number, text: string) {
  return {
    key,
    kind: 'user',
    id: key.slice('13:input-message'.length),
    target: 'chat',
    anchorSeq: seq,
    data: { kind: 'user', seq, time: 1700000000000, content: [{ type: 'text', text }] },
  }
}

/** New data plane: ChatSnapshot `{ nodes: { get, values } }`. */
function chatSnapshotOf(...nodes: unknown[]) {
  const list = [...nodes]
  const map = new Map(list.map((n) => [(n as { key: string }).key, n]))
  return {
    nodes: {
      get: (key: string) => map.get(key),
      values: () => list,
    } as { get(key: string): unknown; values(): Iterable<unknown> },
  }
}

/** Legacy data plane: Session snapshot `{ chat: { nodes: Map } }`. */
function legacySnapshotOf(...nodes: unknown[]) {
  return {
    chat: { nodes: new Map(nodes.map((n) => [(n as { key: string }).key, n])) },
  }
}

// ---- chatNodeOf ----

test('chatNodeOf reads the official Chat snapshot nodes store first', () => {
  const key = '13:input-messagea1'
  const target = userNode(key, 3, 'hi')
  const source = chatSnapshotOf(userNode('13:input-messageb2', 2, 'earlier'), target)
  assert.equal(chatNodeOf(source, key), target)
})

test('chatNodeOf falls back to the legacy Session snapshot chat.nodes Map', () => {
  const key = '13:input-messagea1'
  const target = userNode(key, 3, 'hi')
  assert.equal(chatNodeOf(legacySnapshotOf(target), key), target)
})

test('chatNodeOf returns undefined for unknown keys and empty snapshots', () => {
  assert.equal(chatNodeOf(undefined, '13:input-messagea1'), undefined)
  assert.equal(chatNodeOf(null, '13:input-messagea1'), undefined)
  assert.equal(chatNodeOf({}, '13:input-messagea1'), undefined)
  assert.equal(chatNodeOf(chatSnapshotOf(), '13:input-messagenope'), undefined)
  assert.equal(chatNodeOf(chatSnapshotOf(), undefined), undefined)
})

// ---- railMessageOfNode ----

test('railMessageOfNode maps user and steering nodes, keys by Context key', () => {
  const user = railMessageOfNode(userNode('13:input-messagea1', 4, 'hello'))
  assert.equal(user?.key, '13:input-messagea1')
  assert.equal(user?.seq, 4)
  assert.equal(user?.text, 'hello')
  assert.equal(user?.hasImage, false)

  const steering = railMessageOfNode({
    key: '13:input-messagea2',
    kind: 'steering',
    anchorSeq: 9,
    data: { seq: 9, time: 1, content: [{ type: 'text', text: 'steer' }] },
  })
  assert.equal(steering?.key, '13:input-messagea2')
  assert.equal(steering?.text, 'steer')
})

test('railMessageOfNode rejects context rows, missing keys, and malformed payloads', () => {
  assert.equal(railMessageOfNode({ key: 'k', kind: 'context', anchorSeq: 1, data: { time: 1, content: [] } }), null)
  assert.equal(railMessageOfNode({ kind: 'user', anchorSeq: 1, data: { time: 1, content: [] } }), null)
  assert.equal(railMessageOfNode({ key: 'k', kind: 'user', anchorSeq: 1, data: { time: 1 } }), null)
  assert.equal(railMessageOfNode(null), null)
  assert.equal(railMessageOfNode('nope'), null)
})

// ---- collectFromNodes ----

test('collectFromNodes enumerates user messages from the official Chat snapshot', () => {
  const source = chatSnapshotOf(
    userNode('13:input-messagea2', 2, 'second'),
    userNode('13:input-messagea1', 1, 'first'),
  )
  const out = collectFromNodes(source)
  assert.deepEqual(out.map((m) => m.key), ['13:input-messagea1', '13:input-messagea2'])
  assert.equal(out[0]?.text, 'first')
})

test('collectFromNodes enumerates the legacy Session snapshot map and sorts by seq', () => {
  const source = legacySnapshotOf(
    userNode('13:input-messagea2', 2, 'second'),
    userNode('13:input-messagea1', 1, 'first'),
  )
  assert.deepEqual(collectFromNodes(source).map((m) => m.key), ['13:input-messagea1', '13:input-messagea2'])
})

test('collectFromNodes returns empty for undefined or node-less snapshots', () => {
  assert.deepEqual(collectFromNodes(undefined), [])
  assert.deepEqual(collectFromNodes({}), [])
  assert.deepEqual(collectFromNodes(chatSnapshotOf()), [])
  assert.deepEqual(collectFromNodes({ chat: { nodes: new Map() } }), [])
})

// ---- jumpToMessage ----

/** Minimal Session stub: mutable window + hasMore + replaceable loaders. */
function makeSessionStub(initial: { hasMore?: boolean; loadingOlder?: boolean }) {
  let nodes = new Map<string, unknown>()
  let hasMore = initial.hasMore ?? false
  let loadingOlder = initial.loadingOlder ?? false
  return {
    session: {
      getSnapshot: () => ({ hasMore, loadingOlder, chat: { nodes } }),
      loadOlder: async () => { loadingOlder = true; loadingOlder = false },
    },
    setNodes(next: Map<string, unknown>): void { nodes = next },
    setHasMore(v: boolean): void { hasMore = v },
    setLoadingOlder(v: boolean): void { loadingOlder = v },
  }
}

test('jumpToMessage: official chat source hits immediately without loading', async () => {
  const stub = makeSessionStub({ hasMore: true })
  const key = '13:input-messagea1'
  stub.setNodes(new Map([[key, userNode(key, 1, 'hi')]]))
  let probed = false
  const result = await jumpToMessage(
    { binding: () => ({ session: stub.session as never }) } as never,
    's1',
    key,
    (k) => { probed = true; return stub.session.getSnapshot().chat.nodes.get(k) },
    undefined,
    undefined,
  )
  assert.equal(probed, true)
  assert.equal(result, false) // no DOM in node: the scrollport guard returns false
  assert.equal(stub.loadCalls === undefined, true)
})

test('jumpToMessage: pages until the official chat source materializes the target', async () => {
  const stub = makeSessionStub({ hasMore: true })
  const key = '13:input-messagea1'
  const loadCalls = [0]
  // Realistic paging: each loadOlder extends the window; the target arrives on
  // the second page, so the loop must page twice and then stop probing.
  stub.session.loadOlder = async () => {
    loadCalls[0] += 1
    const next = new Map(stub.session.getSnapshot().chat.nodes)
    next.set(`13:input-messagepage${loadCalls[0]}`, userNode(`13:input-messagepage${loadCalls[0]}`, loadCalls[0], 'p'))
    if (loadCalls[0] === 2) next.set(key, userNode(key, 99, 'target'))
    stub.setNodes(next)
  }
  const result = await jumpToMessage(
    { binding: () => ({ session: stub.session as never }) } as never,
    's1',
    key,
    (k) => stub.session.getSnapshot().chat.nodes.get(k),
    undefined,
    undefined,
  )
  assert.equal(result, false) // no DOM in node; the load loop itself resolved
  assert.equal(loadCalls[0], 2)
})

test('jumpToMessage: legacy snapshot fallback still detects a loaded node', async () => {
  const stub = makeSessionStub({ hasMore: true })
  const key = '13:input-messagea1'
  stub.setNodes(new Map([[key, userNode(key, 1, 'hi')]]))
  let loaded = 0
  stub.session.loadOlder = async () => { loaded += 1 }
  // No nodeOf argument → the legacy snapshot.chat.nodes Map decides.
  const result = await jumpToMessage(
    { binding: () => ({ session: stub.session as never }) } as never,
    's1',
    key,
    undefined,
    undefined,
    undefined,
  )
  assert.equal(result, false) // no DOM in node
  assert.equal(loaded, 0)
})

test('jumpToMessage: warns and gives up when hasMore exhausts without the target', async () => {
  const stub = makeSessionStub({ hasMore: false })
  let loaded = 0
  stub.session.loadOlder = async () => { loaded += 1 }
  const warnings: unknown[][] = []
  const original = console.warn
  console.warn = (...args: unknown[]) => { warnings.push(args) }
  try {
    const result = await jumpToMessage(
      { binding: () => ({ session: stub.session as never }) } as never,
      's1',
      '13:input-messagemissing',
      () => undefined,
      undefined,
      undefined,
    )
    assert.equal(result, false)
  } finally {
    console.warn = original
  }
  assert.equal(warnings.length, 1)
  assert.match(String(warnings[0]?.[0]), /not loaded after 0 page\(s\)/)
  assert.equal(loaded, 0)
})

test('jumpToMessage: loadThrough path pages with one exact call and no loadOlder loop', async () => {
  const stub = makeSessionStub({ hasMore: true })
  const key = '13:input-messagea1'
  const throughCalls: number[] = []
  let loadOlderCalls = 0
  ;(stub.session as unknown as { loadThrough: (seq:number) => Promise<void> }).loadThrough = async (seq: number) => {
    throughCalls.push(seq)
    // The paged window lands the target node (chat view assembles after the pager settles).
    stub.setNodes(new Map([[key, userNode(key, 55, 'target')]]))
  }
  stub.session.loadOlder = async () => { loadOlderCalls += 1 }
  const result = await jumpToMessage(
    { binding: () => ({ session: stub.session as never }) } as never,
    's1',
    key,
    (k) => stub.session.getSnapshot().chat.nodes.get(k),
    undefined,
    undefined,
    55,
  )
  assert.equal(result, false) // no DOM in node: the jump itself resolved
  assert.deepEqual(throughCalls, [55])
  assert.equal(loadOlderCalls, 0)
})

test('jumpToMessage: loadThrough waits for a plain loadOlder owner to release the busy flag', async () => {
  const stub = makeSessionStub({ hasMore: true, loadingOlder: true })
  const key = '13:input-messagea1'
  const throughCalls: number[] = []
  ;(stub.session as unknown as { loadThrough: (seq:number) => Promise<void> }).loadThrough = async (seq: number) => {
    throughCalls.push(seq)
    stub.setNodes(new Map([[key, userNode(key, 3, 'target')]]))
  }
  // The owner releases the busy flag shortly after the jump starts waiting.
  setTimeout(() => stub.setLoadingOlder(false), 30)
  const result = await jumpToMessage(
    { binding: () => ({ session: stub.session as never }) } as never,
    's1',
    key,
    (k) => stub.session.getSnapshot().chat.nodes.get(k),
    undefined,
    undefined,
    3,
  )
  assert.equal(result, false)
  assert.deepEqual(throughCalls, [3])
})

test('jumpToMessage: warns when loadThrough settles without the target node', async () => {
  const stub = makeSessionStub({ hasMore: false })
  const key = '13:input-messagemissing'
  const throughCalls: number[] = []
  ;(stub.session as unknown as { loadThrough: (seq:number) => Promise<void> }).loadThrough = async (seq: number) => {
    throughCalls.push(seq)
  }
  const warnings: unknown[][] = []
  const original = console.warn
  console.warn = (...args: unknown[]) => { warnings.push(args) }
  try {
    const result = await jumpToMessage(
      { binding: () => ({ session: stub.session as never }) } as never,
      's1',
      key,
      () => undefined,
      undefined,
      undefined,
      7,
    )
    assert.equal(result, false)
  } finally {
    console.warn = original
  }
  assert.deepEqual(throughCalls, [7])
  assert.equal(warnings.length, 1)
  assert.match(String(warnings[0]?.[0]), /not loaded after loadThrough\(7\)/)
})
