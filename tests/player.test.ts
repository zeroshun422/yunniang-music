// ---------------------------------------------------------------------------
// 播放器队列与进度逻辑单元测试
//
// 这里测试的是从 src/store/player.ts 抽出的纯逻辑（队列增删、索引修正、
// 进度夹紧、播放历史）。不依赖浏览器 Audio / zustand。
// ---------------------------------------------------------------------------

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

// --- 被测逻辑：与 player.ts 内保持一致 ---

/** 删除队列项并修正索引；返回新队列与索引 */
function removeFromQueue<T>(queue: T[], currentIndex: number, index: number) {
  if (index < 0 || index >= queue.length) return { queue, currentIndex, removedCurrent: false }
  const q = queue.filter((_, i) => i !== index)
  if (index !== currentIndex) {
    return {
      queue: q,
      currentIndex: index < currentIndex ? currentIndex - 1 : currentIndex,
      removedCurrent: false,
    }
  }
  if (!q.length) return { queue: q, currentIndex: -1, removedCurrent: true }
  return { queue: q, currentIndex: Math.min(currentIndex, q.length - 1), removedCurrent: true }
}

/** 拖拽队列项并修正索引 */
function moveInQueue<T>(queue: T[], currentIndex: number, from: number, to: number) {
  if (from === to) return { queue, currentIndex }
  const q = [...queue]
  const [item] = q.splice(from, 1)
  q.splice(to, 0, item)
  let ci = currentIndex
  if (from === currentIndex) ci = to
  else if (from < currentIndex && to >= currentIndex) ci--
  else if (from > currentIndex && to <= currentIndex) ci++
  return { queue: q, currentIndex: ci }
}

/** 进度夹紧（与 seek 实现一致） */
function clampSeek(t: number, duration: number) {
  return Math.max(0, duration > 0 ? Math.min(t, duration) : t)
}

/** 播放历史 */
function makeHistory() {
  const h: number[] = []
  return {
    push(i: number) {
      if (i < 0) return
      if (h[h.length - 1] === i) return
      h.push(i)
    },
    pop(): number | null {
      h.pop()
      return typeof h[h.length - 1] === 'number' ? h[h.length - 1] : null
    },
    reset() { h.length = 0 },
    get size() { return h.length },
  }
}

const Q = ['A', 'B', 'C', 'D']

describe('removeFromQueue — 删除曲目', () => {
  test('删除当前曲目应标记 removedCurrent（调用方需真正切歌）', () => {
    const r = removeFromQueue(Q, 1, 1)
    assert.equal(r.removedCurrent, true)
    assert.deepEqual(r.queue, ['A', 'C', 'D'])
    // 索引 1 现在指向 C —— 但音频仍是 B，调用方必须重新加载
    assert.equal(r.currentIndex, 1)
    assert.equal(r.queue[r.currentIndex], 'C')
  })

  test('删除当前曲目后，索引不会越界', () => {
    const r = removeFromQueue(Q, 3, 3)
    assert.equal(r.removedCurrent, true)
    assert.ok(r.currentIndex < r.queue.length)
    assert.equal(r.queue[r.currentIndex], 'C')
  })

  test('删除当前曲目且队列清空时索引应为 -1', () => {
    const r = removeFromQueue(['A'], 0, 0)
    assert.equal(r.currentIndex, -1)
    assert.equal(r.queue.length, 0)
  })

  test('删除当前曲目之前的项：索引前移一位，不需切歌', () => {
    const r = removeFromQueue(Q, 2, 0)
    assert.equal(r.removedCurrent, false)
    assert.equal(r.currentIndex, 1)
    assert.equal(r.queue[r.currentIndex], 'C', '仍应指向原来那首歌')
  })

  test('删除当前曲目之后的项：索引不变，不需切歌', () => {
    const r = removeFromQueue(Q, 1, 3)
    assert.equal(r.removedCurrent, false)
    assert.equal(r.currentIndex, 1)
    assert.equal(r.queue[r.currentIndex], 'B')
  })

  test('索引非法时应原样返回（避免误删）', () => {
    const r = removeFromQueue(Q, 1, 99)
    assert.deepEqual(r.queue, Q)
    assert.equal(r.currentIndex, 1)
  })
})

describe('moveInQueue — 拖拽排序', () => {
  test('把当前项拖到后面：索引跟随', () => {
    const r = moveInQueue(Q, 0, 0, 2)
    assert.deepEqual(r.queue, ['B', 'C', 'A', 'D'])
    assert.equal(r.queue[r.currentIndex], 'A')
  })

  test('把当前项拖到前面：索引跟随', () => {
    const r = moveInQueue(Q, 3, 3, 0)
    assert.deepEqual(r.queue, ['D', 'A', 'B', 'C'])
    assert.equal(r.queue[r.currentIndex], 'D')
  })

  test('移动当前项之前的项到其后：索引前移', () => {
    const r = moveInQueue(Q, 2, 0, 3)
    assert.equal(r.queue[r.currentIndex], 'C', '仍指向同一首歌')
  })

  test('移动当前项之后的项到其前：索引后移', () => {
    const r = moveInQueue(Q, 1, 3, 0)
    assert.equal(r.queue[r.currentIndex], 'B', '仍指向同一首歌')
  })

  test('原地拖拽应无变化', () => {
    const r = moveInQueue(Q, 1, 1, 1)
    assert.deepEqual(r.queue, Q)
    assert.equal(r.currentIndex, 1)
  })
})

describe('clampSeek — 进度边界', () => {
  test('负数夹紧到 0', () => {
    assert.equal(clampSeek(-10, 200), 0)
  })

  test('超过时长夹紧到时长', () => {
    assert.equal(clampSeek(500, 200), 200)
  })

  test('合法值保持不变', () => {
    assert.equal(clampSeek(120, 200), 120)
  })

  test('时长为 0（未加载）时不夹到 0，保留原值', () => {
    assert.equal(clampSeek(30, 0), 30)
  })

  test('时长为 NaN 时按 0 处理并保留原值', () => {
    assert.equal(clampSeek(30, NaN), 30)
  })
})

describe('playHistory — 随机模式上一首', () => {
  test('连续播放后 pop 应返回上一条', () => {
    const h = makeHistory()
    h.push(0); h.push(5); h.push(2)
    assert.equal(h.pop(), 5)
  })

  test('连续相同索引不重复记录', () => {
    const h = makeHistory()
    h.push(3); h.push(3); h.push(3)
    assert.equal(h.size, 1)
  })

  test('空历史 pop 返回 null', () => {
    const h = makeHistory()
    assert.equal(h.pop(), null)
  })

  test('负索引被忽略', () => {
    const h = makeHistory()
    h.push(-1)
    assert.equal(h.size, 0)
  })

  test('reset 后为空', () => {
    const h = makeHistory()
    h.push(1); h.push(2)
    h.reset()
    assert.equal(h.size, 0)
    assert.equal(h.pop(), null)
  })

  test('历史仅剩一条时 pop 后返回 null（没有更早的歌）', () => {
    const h = makeHistory()
    h.push(7)
    assert.equal(h.pop(), null)
  })
})
