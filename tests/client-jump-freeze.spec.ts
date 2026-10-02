/**
 * Jump-freeze state-machine tests for @max-null/dsh-chat-rail.
 *
 * A click on a rail row highlights it immediately and freezes the scroll-spy
 * until that jump has settled. The freeze is needed because the landing centres
 * the target row (50% of the scrollport) while the scroll-spy elects the row
 * nearest the **40%** line: measured in a real browser, rows whose centre
 * spacing is under 20% of the viewport (40/60/80/100px-tall rows in a 600px
 * scrollport) all elect the row ABOVE the clicked one; 120px-and-taller rows
 * match. Without the freeze that re-election runs 60ms after the landing's own
 * scroll event and overrides the click's highlight.
 *
 * The ownership rules below are the part that keeps overlapped jumps honest: a
 * superseded jump must not release the freeze (or clear the busy flag) of the
 * jump that replaced it.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createJumpFreeze, JUMP_FREEZE_RELEASE_MS } from '../src/client/index.tsx'
import type { JumpFreezeClock } from '../src/client/index.tsx'

/** Deterministic clock: timers fire only once `advance()` passes their deadline. */
class FakeClock implements JumpFreezeClock {
  private seq = 1
  private now = 0
  private readonly timers = new Map<number, { fn: () => void; at: number }>()
  setTimeout(fn: () => void, ms: number): number {
    const id = this.seq++
    this.timers.set(id, { fn, at: this.now + ms })
    return id
  }
  clearTimeout(id: number): void { this.timers.delete(id) }
  advance(ms: number): void {
    this.now += ms
    for (const [id, timer] of [...this.timers]) {
      if (timer.at <= this.now) { this.timers.delete(id); timer.fn() }
    }
  }
  pending(): number { return this.timers.size }
}

test('a fresh freeze holds nothing', () => {
  const freeze = createJumpFreeze(new FakeClock())
  assert.equal(freeze.frozen(), false)
})

test('begin freezes; settle releases only after the debounce window', () => {
  const clock = new FakeClock()
  const freeze = createJumpFreeze(clock)
  const token = freeze.begin()
  assert.equal(freeze.frozen(), true)
  freeze.settle(token)
  // 落位派发的 scroll 事件要等下一帧、再经 60ms 去抖才重算 —— 窗口内必须仍冻结。
  assert.equal(freeze.frozen(), true)
  clock.advance(JUMP_FREEZE_RELEASE_MS - 1)
  assert.equal(freeze.frozen(), true)
  clock.advance(1)
  assert.equal(freeze.frozen(), false)
})

test('a newer click supersedes the in-flight one: the pending release is dropped', () => {
  const clock = new FakeClock()
  const freeze = createJumpFreeze(clock)
  const first = freeze.begin()
  freeze.settle(first)          // 第一次跳转落位，释放已排期
  const second = freeze.begin() // 用户紧接着点了第二条（两次点击重叠）
  assert.equal(clock.pending(), 0, 'begin 必须作废旧 token 的释放定时器')
  clock.advance(JUMP_FREEZE_RELEASE_MS * 4)
  // 第二次尚未 settle，冻结必须还在。
  assert.equal(freeze.frozen(), true)
  assert.equal(freeze.owns(first), false)
  assert.equal(freeze.owns(second), true)
  freeze.settle(second)
  clock.advance(JUMP_FREEZE_RELEASE_MS)
  assert.equal(freeze.frozen(), false)
})

test('a superseded token cannot settle: its late finally must not release the new freeze', () => {
  const clock = new FakeClock()
  const freeze = createJumpFreeze(clock)
  const first = freeze.begin()
  const second = freeze.begin()
  // 旧跳转在新跳转开始之后才跑完 finally —— 它必须完全无效。
  freeze.settle(first)
  assert.equal(clock.pending(), 0)
  clock.advance(JUMP_FREEZE_RELEASE_MS * 10)
  assert.equal(freeze.frozen(), true, '被取代的 token 不得解除新跳转的冻结')
  freeze.settle(second)
  clock.advance(JUMP_FREEZE_RELEASE_MS)
  assert.equal(freeze.frozen(), false)
})

test('re-settling the current token restarts the window instead of leaking a timer', () => {
  const clock = new FakeClock()
  const freeze = createJumpFreeze(clock)
  const token = freeze.begin()
  freeze.settle(token)
  clock.advance(JUMP_FREEZE_RELEASE_MS - 10)
  freeze.settle(token)
  assert.equal(clock.pending(), 1, '重复 settle 只排期一次')
  clock.advance(10)
  assert.equal(freeze.frozen(), true, '窗口被重置')
  clock.advance(JUMP_FREEZE_RELEASE_MS)
  assert.equal(freeze.frozen(), false)
})

test('the freeze is reusable across jumps', () => {
  const clock = new FakeClock()
  const freeze = createJumpFreeze(clock)
  freeze.settle(freeze.begin())
  clock.advance(JUMP_FREEZE_RELEASE_MS)
  assert.equal(freeze.frozen(), false)
  const token = freeze.begin()
  assert.equal(freeze.frozen(), true)
  assert.equal(freeze.owns(token), true)
  freeze.settle(token)
  clock.advance(JUMP_FREEZE_RELEASE_MS)
  assert.equal(freeze.frozen(), false)
})

test('dispose drops the pending release and leaves no timer behind', () => {
  const clock = new FakeClock()
  const freeze = createJumpFreeze(clock)
  freeze.settle(freeze.begin())
  assert.equal(clock.pending(), 1)
  freeze.dispose()
  assert.equal(clock.pending(), 0)
  clock.advance(JUMP_FREEZE_RELEASE_MS * 4)
  assert.equal(freeze.frozen(), false)
})
