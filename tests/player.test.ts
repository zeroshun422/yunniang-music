// ---------------------------------------------------------------------------
// 队列与播放逻辑单元测试
//
// 重要：本文件直接 import 真实源码（src/store/queue-logic.ts），
// 而不是把逻辑复制一份到测试里。这样源码改动会真实反映到测试结果中。
//
// 历史问题：此前的测试文件内联了一份逻辑副本，源码改了测试仍然通过，
// 属于「假测试」。本次已修正。
// ---------------------------------------------------------------------------

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  removeQueueItem,
  moveQueueItem,
  clampSeekTime,
  createPlayHistory,
  computeNextIndex,
  computePrevIndex,
  shuffleInPlace,
  buildQualityNotice,
} from '../src/store/queue-logic.js'

const Q = ['A', 'B', 'C', 'D']
const st = (queue = Q, currentIndex = 1) => ({ queue, currentIndex })

describe('removeQueueItem — 删除曲目', () => {
  test('删除当前项时标记 removedCurrent（调用方需真正切歌）', () => {
    const r = removeQueueItem(st(Q, 1), 1)
    assert.equal(r.removedCurrent, true)
    assert.deepEqual(r.queue, ['A', 'C', 'D'])
    assert.equal(r.queue[r.currentIndex], 'C')
  })

  test('删除末尾当前项时索引不越界', () => {
    const r = removeQueueItem(st(Q, 3), 3)
    assert.equal(r.removedCurrent, true)
    assert.ok(r.currentIndex < r.queue.length)
    assert.equal(r.queue[r.currentIndex], 'C')
  })

  test('删空队列时索引为 -1', () => {
    const r = removeQueueItem(st(['A'], 0), 0)
    assert.equal(r.currentIndex, -1)
    assert.equal(r.queue.length, 0)
    assert.equal(r.removedCurrent, true)
  })

  test('删除当前项之前的元素：索引前移，指向同一首歌', () => {
    const r = removeQueueItem(st(Q, 2), 0)
    assert.equal(r.removedCurrent, false)
    assert.equal(r.currentIndex, 1)
    assert.equal(r.queue[r.currentIndex], 'C')
  })

  test('删除当前项之后的元素：索引不变，指向同一首歌', () => {
    const r = removeQueueItem(st(Q, 1), 3)
    assert.equal(r.removedCurrent, false)
    assert.equal(r.currentIndex, 1)
    assert.equal(r.queue[r.currentIndex], 'B')
  })

  test('非法索引原样返回（返回同一数组引用，便于调用方判等）', () => {
    const input = Q
    const r = removeQueueItem(st(input, 1), 99)
    assert.equal(r.queue, input)
    assert.equal(r.currentIndex, 1)
  })

  test('负索引原样返回', () => {
    const r = removeQueueItem(st(Q, 1), -1)
    assert.equal(r.queue, Q)
  })
})

describe('moveQueueItem — 拖拽排序', () => {
  test('当前项拖到后面，索引跟随', () => {
    const r = moveQueueItem(st(Q, 0), 0, 2)
    assert.deepEqual(r.queue, ['B', 'C', 'A', 'D'])
    assert.equal(r.queue[r.currentIndex], 'A')
  })

  test('当前项拖到前面，索引跟随', () => {
    const r = moveQueueItem(st(Q, 3), 3, 0)
    assert.deepEqual(r.queue, ['D', 'A', 'B', 'C'])
    assert.equal(r.queue[r.currentIndex], 'D')
  })

  test('移动当前项之前的元素到其后：索引前移，仍指向同一首歌', () => {
    const r = moveQueueItem(st(Q, 2), 0, 3)
    assert.equal(r.queue[r.currentIndex], 'C')
  })

  test('移动当前项之后的元素到其前：索引后移，仍指向同一首歌', () => {
    const r = moveQueueItem(st(Q, 1), 3, 0)
    assert.equal(r.queue[r.currentIndex], 'B')
  })

  test('原地拖拽返回原引用', () => {
    const r = moveQueueItem(st(Q, 1), 1, 1)
    assert.equal(r.queue, Q)
    assert.equal(r.currentIndex, 1)
  })

  test('越界索引返回原引用', () => {
    const r = moveQueueItem(st(Q, 1), 0, 99)
    assert.equal(r.queue, Q)
  })
})

describe('clampSeekTime — 进度边界', () => {
  test('负数夹紧到 0', () => assert.equal(clampSeekTime(-10, 200), 0))
  test('超过时长夹紧到时长', () => assert.equal(clampSeekTime(500, 200), 200))
  test('合法值保持不变', () => assert.equal(clampSeekTime(120, 200), 120))
  test('时长为 0 时保留原值', () => assert.equal(clampSeekTime(30, 0), 30))
  test('时长 NaN 时保留原值', () => assert.equal(clampSeekTime(30, NaN), 30))
  test('时间 NaN 时归零', () => assert.equal(clampSeekTime(NaN, 200), 0))
  test('负时长按未加载处理', () => assert.equal(clampSeekTime(30, -5), 30))
})

describe('createPlayHistory — 随机模式上一首', () => {
  test('连续播放后 pop 返回上一条', () => {
    const h = createPlayHistory()
    h.push(0); h.push(5); h.push(2)
    assert.equal(h.pop(), 5)
  })

  test('连续相同索引不重复记录', () => {
    const h = createPlayHistory()
    h.push(3); h.push(3); h.push(3)
    assert.equal(h.size, 1)
  })

  test('空历史 pop 返回 null', () => {
    assert.equal(createPlayHistory().pop(), null)
  })

  test('负索引被忽略', () => {
    const h = createPlayHistory()
    h.push(-1)
    assert.equal(h.size, 0)
  })

  test('reset 后清空', () => {
    const h = createPlayHistory()
    h.push(1); h.push(2)
    h.reset()
    assert.equal(h.size, 0)
    assert.equal(h.pop(), null)
  })

  test('仅一条时 pop 后返回 null', () => {
    const h = createPlayHistory()
    h.push(7)
    assert.equal(h.pop(), null)
  })

  test('超出上限时丢弃最旧记录', () => {
    const h = createPlayHistory(3)
    h.push(1); h.push(2); h.push(3); h.push(4)
    assert.equal(h.size, 3)
    assert.deepEqual(h.snapshot(), [2, 3, 4])
  })
})

describe('computeNextIndex — 下一首', () => {
  test('顺序播放：索引 +1', () => {
    assert.equal(computeNextIndex({ currentIndex: 1, length: 4, repeat: 'all', shuffle: false, manual: false }), 2)
  })

  test('到达末尾且列表循环：回到 0', () => {
    assert.equal(computeNextIndex({ currentIndex: 3, length: 4, repeat: 'all', shuffle: false, manual: false }), 0)
  })

  test('到达末尾且不循环：返回 null（停止播放）', () => {
    assert.equal(computeNextIndex({ currentIndex: 3, length: 4, repeat: 'off', shuffle: false, manual: false }), null)
  })

  test('到达末尾但用户手动点下一首：回到 0', () => {
    assert.equal(computeNextIndex({ currentIndex: 3, length: 4, repeat: 'off', shuffle: false, manual: true }), 0)
  })

  test('空队列返回 null', () => {
    assert.equal(computeNextIndex({ currentIndex: 0, length: 0, repeat: 'all', shuffle: false, manual: false }), null)
  })

  test('随机模式：随机索引不与当前重复', () => {
    const idx = computeNextIndex({
      currentIndex: 2, length: 4, repeat: 'all', shuffle: true, manual: false,
      random: () => 0.5, // 固定返回 2 → 应自动 +1
    })
    assert.notEqual(idx, 2)
    assert.ok(idx !== null && idx >= 0 && idx < 4)
  })

  test('随机模式单曲队列：允许返回同一首', () => {
    const idx = computeNextIndex({
      currentIndex: 0, length: 1, repeat: 'all', shuffle: true, manual: false,
      random: () => 0.5,
    })
    assert.equal(idx, 0)
  })
})

describe('computePrevIndex — 上一首', () => {
  test('索引 -1', () => assert.equal(computePrevIndex(2, 4), 1))
  test('首项回绕到末尾', () => assert.equal(computePrevIndex(0, 4), 3))
  test('空队列返回 -1', () => assert.equal(computePrevIndex(0, 0), -1))
})

describe('shuffleInPlace — 洗牌', () => {
  test('元素集合不变（只改变顺序）', () => {
    const input = Array.from({ length: 50 }, (_, i) => i)
    const out = shuffleInPlace([...input])
    assert.equal(out.length, input.length)
    assert.deepEqual([...out].sort((a, b) => a - b), input)
  })

  test('确定性随机源下结果可复现', () => {
    const a = shuffleInPlace([1, 2, 3, 4, 5], () => 0.42)
    const b = shuffleInPlace([1, 2, 3, 4, 5], () => 0.42)
    assert.deepEqual(a, b)
  })

  test('空数组与单元素安全', () => {
    assert.deepEqual(shuffleInPlace([]), [])
    assert.deepEqual(shuffleInPlace([1]), [1])
  })
})

describe('buildQualityNotice — 降级提示', () => {
  test('档位一致时不提示', () => {
    assert.equal(buildQualityNotice('lossless', 'lossless', 900000), null)
  })

  test('未拿到实际档位时不提示', () => {
    assert.equal(buildQualityNotice('lossless', null, 0), null)
    assert.equal(buildQualityNotice('lossless', undefined, 0), null)
  })

  test('降级时给出中文提示与码率', () => {
    const msg = buildQualityNotice('lossless', 'exhigh', 320000)
    assert.ok(msg && msg.includes('无损') && msg.includes('极高') && msg.includes('320kbps'))
  })

  test('码率为 0 时省略码率部分', () => {
    const msg = buildQualityNotice('hires', 'lossless', 0)
    assert.ok(msg && !msg.includes('kbps'))
  })
})
