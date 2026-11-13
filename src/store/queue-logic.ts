// ---------------------------------------------------------------------------
// 队列纯逻辑
//
// 从 src/store/player.ts 抽出，使这些易错的状态变更可以被真实导入测试
// （此前测试是「把逻辑复制一份到测试文件」，源码改了测试不会失败，属于无效测试）。
//
// 这些函数不做任何副作用，只接收状态、返回新状态，便于单独验证。
// ---------------------------------------------------------------------------

export interface QueueState<T> {
  queue: T[]
  currentIndex: number
}

/**
 * 删除队列中某一项，并正确修正 currentIndex。
 *
 * 关键点：如果删除的正是「当前播放」的那一项，调用方必须真正切换音源，
 * 否则会出现 UI 显示的是下一首、实际仍在播放被删曲目的错位。
 * 因此这里返回 removedCurrent 供调用方判断。
 */
export function removeQueueItem<T>(
  state: QueueState<T>,
  index: number
): QueueState<T> & { removedCurrent: boolean } {
  const { queue, currentIndex } = state

  // 非法索引：原样返回，避免误删
  if (index < 0 || index >= queue.length) {
    return { queue, currentIndex, removedCurrent: false }
  }

  const nextQueue = queue.filter((_, i) => i !== index)

  if (index !== currentIndex) {
    // 删的是当前项之前的元素 → 索引前移一位；之后的元素 → 索引不变
    return {
      queue: nextQueue,
      currentIndex: index < currentIndex ? currentIndex - 1 : currentIndex,
      removedCurrent: false,
    }
  }

  // 删的是当前项且删空了
  if (!nextQueue.length) {
    return { queue: nextQueue, currentIndex: -1, removedCurrent: true }
  }

  // 删的是当前项：索引夹紧到新队列范围内
  return {
    queue: nextQueue,
    currentIndex: Math.min(currentIndex, nextQueue.length - 1),
    removedCurrent: true,
  }
}

/**
 * 把队列中的一项从 from 移到 to，并保持 currentIndex 指向「同一首歌」。
 */
export function moveQueueItem<T>(state: QueueState<T>, from: number, to: number): QueueState<T> {
  const { queue, currentIndex } = state
  if (from === to) return { queue, currentIndex }
  if (from < 0 || from >= queue.length || to < 0 || to >= queue.length) {
    return { queue, currentIndex }
  }

  const nextQueue = [...queue]
  const [moved] = nextQueue.splice(from, 1)
  nextQueue.splice(to, 0, moved)

  let nextIndex = currentIndex
  if (from === currentIndex) {
    nextIndex = to
  } else if (from < currentIndex && to >= currentIndex) {
    nextIndex--
  } else if (from > currentIndex && to <= currentIndex) {
    nextIndex++
  }

  return { queue: nextQueue, currentIndex: nextIndex }
}

/**
 * 把进度值夹紧到 [0, duration]。
 * 浏览器对 currentTime 接受越界值但不生效，会导致进度条与实际播放位置错位。
 */
export function clampSeekTime(t: number, duration: number): number {
  if (!Number.isFinite(t)) return 0
  if (!Number.isFinite(duration) || duration <= 0) return Math.max(0, t)
  return Math.max(0, Math.min(t, duration))
}

/** 播放历史栈：供随机模式下的「上一首」使用 */
export function createPlayHistory(maxSize = 100) {
  const items: number[] = []

  return {
    push(index: number) {
      if (index < 0) return
      // 连续相同索引不重复记录
      if (items[items.length - 1] === index) return
      items.push(index)
      if (items.length > maxSize) items.shift()
    },
    /** 弹出当前这条，返回上一条；没有更早的记录时返回 null */
    pop(): number | null {
      items.pop()
      const prev = items[items.length - 1]
      return typeof prev === 'number' ? prev : null
    },
    reset() {
      items.length = 0
    },
    get size() {
      return items.length
    },
    snapshot(): number[] {
      return [...items]
    },
  }
}

/** 计算下一首的索引 */
export function computeNextIndex(params: {
  currentIndex: number
  length: number
  repeat: 'off' | 'all' | 'one'
  shuffle: boolean
  manual: boolean
  random?: () => number
}): number | null {
  const { currentIndex, length, repeat, shuffle, manual, random = Math.random } = params
  if (length === 0) return null

  if (shuffle) {
    let next = Math.floor(random() * length)
    if (length > 1 && next === currentIndex) next = (next + 1) % length
    return next
  }

  let next = currentIndex + 1
  if (next >= length) {
    if (repeat === 'all' || manual) return 0
    return null // 停止播放
  }
  return next
}

/** 计算上一首的索引（随机模式另由播放历史处理） */
export function computePrevIndex(currentIndex: number, length: number): number {
  if (length === 0) return -1
  let prev = currentIndex - 1
  if (prev < 0) prev = length - 1
  return prev
}

/** Fisher–Yates 洗牌（原地） */
export function shuffleInPlace<T>(arr: T[], random: () => number = Math.random): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/**
 * 音质降级提示文案。
 * 仅当「请求档位」与「实际档位」不一致时返回提示，否则返回 null。
 */
export function buildQualityNotice(
  requested: string,
  actual: string | null | undefined,
  br: number
): string | null {
  if (!actual || requested === actual) return null
  const LABELS: Record<string, string> = {
    standard: '标准',
    higher: '较高',
    exhigh: '极高',
    lossless: '无损',
    hires: 'Hi-Res',
    jyeffect: '高清环绕',
    sky: '沉浸环绕',
    jymaster: '超清母带',
  }
  const kbps = br ? Math.round(br / 1000) : 0
  return `「${LABELS[requested] || requested}」不可用，已自动降级为「${
    LABELS[actual] || actual
  }」${kbps ? `（${kbps}kbps）` : ''}`
}
