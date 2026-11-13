import { create } from 'zustand'
import type { Song, QualityLevel, LyricLine } from '@/types'
import * as ncm from '@/api/ncm'
import {
  removeQueueItem,
  moveQueueItem,
  clampSeekTime,
  createPlayHistory,
  computeNextIndex,
  computePrevIndex,
  shuffleInPlace,
  buildQualityNotice,
} from './queue-logic'

type RepeatMode = 'off' | 'all' | 'one'

interface PlayerState {
  // 队列
  queue: Song[]
  currentIndex: number
  playing: boolean
  // 进度
  currentTime: number
  duration: number
  volume: number
  muted: boolean
  // 音质
  quality: QualityLevel
  actualQuality: string
  actualBr: number
  qualityNotice: string | null
  // 歌词
  lyrics: LyricLine[]
  hasTrans: boolean
  currentLine: number
  showDesktopLyric: boolean
  // 模式
  repeat: RepeatMode
  shuffle: boolean
  // 加载态
  loading: boolean
  loadError: string | null

  // 动作
  playSong: (song: Song, list?: Song[]) => Promise<void>
  playQueue: (list: Song[], startIndex?: number) => Promise<void>
  toggle: () => void
  next: (manual?: boolean) => Promise<void>
  prev: () => Promise<void>
  seek: (t: number) => void
  setVolume: (v: number) => void
  toggleMute: () => void
  setQuality: (q: QualityLevel) => void
  setRepeat: (m: RepeatMode) => void
  toggleShuffle: () => void
  // 队列操作
  addToQueue: (s: Song) => void
  addNext: (s: Song) => void
  removeFromQueue: (index: number) => void
  clearQueue: () => void
  moveInQueue: (from: number, to: number) => void
  // 内部
  _audio: HTMLAudioElement | null
  _initAudio: () => void
  toggleDesktopLyric: () => Promise<void>
}

let audioEl: HTMLAudioElement | null = null
// 播放请求序号：用于丢弃过期请求的结果，避免快速切歌时旧探测结果覆盖新歌曲
let playSeq = 0

// 播放历史（存队列索引）：供随机模式下的「上一首」使用
const playHistory = createPlayHistory(100)

function detectQuality(): QualityLevel {
  const saved = localStorage.getItem('yun-quality')
  const valid: QualityLevel[] = ['standard', 'higher', 'exhigh', 'lossless', 'hires', 'jyeffect', 'sky', 'jymaster']
  if (saved && valid.includes(saved as QualityLevel)) return saved as QualityLevel
  return 'exhigh'
}

export const usePlayer = create<PlayerState>((set, get) => ({
  queue: [],
  currentIndex: -1,
  playing: false,
  currentTime: 0,
  duration: 0,
  volume: Number(localStorage.getItem('yun-volume') ?? 0.8),
  muted: false,
  quality: detectQuality(),
  actualQuality: '',
  actualBr: 0,
  qualityNotice: null,
  lyrics: [],
  hasTrans: false,
  currentLine: -1,
  showDesktopLyric: false,
  repeat: (localStorage.getItem('yun-repeat') as RepeatMode) || 'all',
  shuffle: localStorage.getItem('yun-shuffle') === '1',
  loading: false,
  loadError: null,
  _audio: null,

  _initAudio: () => {
    if (audioEl) return
    audioEl = new Audio()
    audioEl.preload = 'auto'
    audioEl.volume = get().volume

    audioEl.addEventListener('timeupdate', () => {
      const t = audioEl!.currentTime
      set({ currentTime: t })
      // 更新当前歌词行
      const lyr = get().lyrics
      if (lyr.length) {
        let idx = -1
        for (let i = 0; i < lyr.length; i++) {
          if (lyr[i].time <= t + 0.25) idx = i
          else break
        }
        if (idx !== get().currentLine) {
          set({ currentLine: idx })
          if (get().showDesktopLyric) {
            const cur = lyr[idx]
            const next = lyr[idx + 1]
            window.yun.lyricUpdate({
              current: cur?.text || '',
              trans: cur?.trans || '',
              next: next?.text || '',
            })
          }
        }
      }
    })

    audioEl.addEventListener('loadedmetadata', () => set({ duration: audioEl!.duration || 0 }))
    audioEl.addEventListener('durationchange', () => set({ duration: audioEl!.duration || 0 }))
    audioEl.addEventListener('play', () => set({ playing: true }))
    audioEl.addEventListener('pause', () => set({ playing: false }))
    audioEl.addEventListener('ended', async () => {
      const { repeat } = get()
      if (repeat === 'one') {
        audioEl!.currentTime = 0
        audioEl!.play().catch(() => {})
      } else {
        await get().next()
      }
    })
    audioEl.addEventListener('error', () => {
      set({ loadError: '音频加载失败，可能是版权限制或网络问题' })
    })

    set({ _audio: audioEl })
  },

  playSong: async (song, list) => {
    get()._initAudio()
    let baseList = list && list.length ? [...list] : [...get().queue]
    let idx = baseList.findIndex((s) => s.id === song.id)
    if (idx < 0) {
      baseList = [...baseList, song]
      idx = baseList.length - 1
    }
    set({ queue: baseList, currentIndex: idx })
    await loadAndPlay(song, set, get)
  },

  playQueue: async (list, startIndex = 0) => {
    if (!list.length) return
    get()._initAudio()
    const shuffled = get().shuffle ? shuffleArray([...list]) : [...list]
    const target = get().shuffle ? shuffled[0] : list[startIndex] || list[0]
    const idx = shuffled.findIndex((s) => s.id === target.id)
    set({ queue: shuffled, currentIndex: idx < 0 ? 0 : idx })
    await loadAndPlay(shuffled[idx < 0 ? 0 : idx], set, get)
  },

  toggle: () => {
    get()._initAudio()
    if (!audioEl) return
    if (!audioEl.src) {
      const q = get().queue
      const i = get().currentIndex
      if (q[i]) loadAndPlay(q[i], set, get)
      return
    }
    audioEl.paused ? audioEl.play().catch(() => {}) : audioEl.pause()
  },

  next: async (manual = false) => {
    const { queue, currentIndex, repeat, shuffle } = get()
    const nextIdx = computeNextIndex({
      currentIndex, length: queue.length, repeat, shuffle, manual,
    })
    if (nextIdx === null) {
      set({ playing: false })
      return
    }
    set({ currentIndex: nextIdx })
    await loadAndPlay(queue[nextIdx], set, get)
  },

  prev: async () => {
    const { queue, currentIndex, shuffle } = get()
    if (!queue.length) return
    if (audioEl && audioEl.currentTime > 3) {
      audioEl.currentTime = 0
      return
    }

    // 随机模式：回到上一条实际播放记录
    if (shuffle) {
      const prevHistoryIdx = playHistory.pop()
      if (prevHistoryIdx !== null && queue[prevHistoryIdx]) {
        set({ currentIndex: prevHistoryIdx })
        await loadAndPlay(queue[prevHistoryIdx], set, get)
        return
      }
    }

    const prevIdx = computePrevIndex(currentIndex, queue.length)
    if (prevIdx < 0) return
    set({ currentIndex: prevIdx })
    await loadAndPlay(queue[prevIdx], set, get)
  },

  seek: (t) => {
    if (!audioEl) return
    const dur = Number.isFinite(audioEl.duration) ? audioEl.duration : 0
    const clamped = clampSeekTime(t, dur)
    audioEl.currentTime = clamped
    set({ currentTime: clamped })
  },

  setVolume: (v) => {
    const vol = Math.max(0, Math.min(1, v))
    if (audioEl) { audioEl.volume = vol; audioEl.muted = false }
    localStorage.setItem('yun-volume', String(vol))
    set({ volume: vol, muted: false })
  },

  toggleMute: () => {
    const m = !get().muted
    if (audioEl) audioEl.muted = m
    set({ muted: m })
  },

  setQuality: (q) => {
    localStorage.setItem('yun-quality', q)
    set({ quality: q })
    // 立即用新音质重载当前歌曲（保持播放进度）
    const s = get().queue[get().currentIndex]
    if (s && audioEl && !audioEl.paused) {
      const t = audioEl.currentTime
      loadAndPlay(s, set, get, t)
    }
  },

  setRepeat: (m) => { localStorage.setItem('yun-repeat', m); set({ repeat: m }) },
  toggleShuffle: () => {
    const s = !get().shuffle
    localStorage.setItem('yun-shuffle', s ? '1' : '0')
    set({ shuffle: s })
  },

  addToQueue: (s) => {
    const q = get().queue
    if (q.some((x) => x.id === s.id)) return
    set({ queue: [...q, s] })
  },

  addNext: (s) => {
    const { queue, currentIndex } = get()
    const q = [...queue]
    q.splice(currentIndex + 1, 0, s)
    set({ queue: q })
  },

  removeFromQueue: (index) => {
    const { queue, currentIndex } = get()
    const result = removeQueueItem({ queue, currentIndex }, index)

    // 非法索引时状态不变
    if (result.queue === queue) return

    if (!result.removedCurrent) {
      set({ queue: result.queue, currentIndex: result.currentIndex })
      return
    }

    // 删的正是当前播放项：必须真正切换音源
    if (!result.queue.length) {
      get().clearQueue()
      return
    }

    set({ queue: result.queue, currentIndex: result.currentIndex })
    void loadAndPlay(result.queue[result.currentIndex], set, get)
  },

  clearQueue: () => {
    if (audioEl) {
      // 作废进行中的加载请求，避免它稍后把音源又设回来
      ++playSeq
      playHistory.reset()
      audioEl.pause()
      audioEl.removeAttribute('src')
      // 必须调用 load()，否则浏览器不会释放已缓冲的媒体资源
      audioEl.load()
    }
    set({
      queue: [],
      currentIndex: -1,
      playing: false,
      currentTime: 0,
      duration: 0,
      lyrics: [],
      hasTrans: false,
      currentLine: -1,
      loading: false,
      loadError: null,
      actualQuality: '',
      actualBr: 0,
      qualityNotice: null,
    })
  },

  moveInQueue: (from, to) => {
    const { queue, currentIndex } = get()
    const result = moveQueueItem({ queue, currentIndex }, from, to)
    if (result.queue === queue) return
    set({ queue: result.queue, currentIndex: result.currentIndex })
  },

  toggleDesktopLyric: async () => {
    const on = !get().showDesktopLyric
    set({ showDesktopLyric: on })
    if (on) {
      const lyr = get().lyrics[get().currentLine]
      await window.yun.lyricShow({ current: lyr?.text || '云娘音乐', trans: lyr?.trans || '', next: '' })
    } else {
      await window.yun.lyricHide()
    }
  },
}))

const shuffleArray = shuffleInPlace


// 代理地址缓存：避免每次切歌都走一次 IPC（也是切歌竞态的诱因之一）
let _proxyCfg: { proxyBase: string } | null = null
async function getProxyConfig() {
  if (_proxyCfg) return _proxyCfg
  const c = await window.yun.getConfig()
  _proxyCfg = { proxyBase: c.proxyBase }
  return _proxyCfg
}

async function loadAndPlay(
  song: Song,
  set: (p: Partial<PlayerState>) => void,
  get: () => PlayerState,
  startAt = 0
) {
  const { quality } = get()
  const mySeq = ++playSeq
  // 记录到播放历史（随机模式下「上一首」依赖它）
  playHistory.push(get().currentIndex)
  set({ loading: true, loadError: null, currentTime: startAt, actualBr: 0, actualQuality: '', qualityNotice: null })

  try {
    // 1. 先探测音质（用于 UI 显示实际拿到什么）
    const probe = await ncm.probeAudio(song.id, quality).catch(() => null)

    // 过期请求直接丢弃，避免覆盖当前歌曲的音质显示
    if (mySeq !== playSeq) return

    // 2. 歌词
    const ly = await ncm.lyric(song.id).catch(() => ({ lines: [], hasTrans: false } as any))

    if (mySeq !== playSeq) return

    if (!probe || probe.code !== 200 || !probe.actualLevel) {
      const msg = probe?.error || '无法获取播放地址（可能是版权限制 / VIP 限制 / 网络风控）'
      set({ loading: false, loadError: msg })
      return
    }

    // 3. 设置音频源（经主进程代理，自动带 Referer）
    // 注意：getConfig 是异步的，切歌时可能有多个并发调用；
    // 必须在 await 之后再次校验序号，否则旧请求会覆盖新歌曲的 src。
    const cfg = await getProxyConfig()
    if (mySeq !== playSeq) return

    const src = `${cfg.proxyBase}/audio?id=${song.id}&level=${quality}`

    const audio = get()._audio || audioEl!
    audio.src = src
    audio.currentTime = 0
    audio.volume = get().muted ? 0 : get().volume

    if (mySeq !== playSeq) return

    const notice = ncm_qualityNotice(quality, probe.actualLevel, probe.br)

    set({
      actualQuality: probe.actualLevel,
      actualBr: probe.br,
      qualityNotice: notice,
      lyrics: ly.lines || [],
      hasTrans: ly.hasTrans || false,
      currentLine: -1,
      loading: false,
    })

    await audio.play().catch((e: any) => {
      const msg = String(e?.message || e || '')
      // 切歌时旧请求被新请求打断属于正常现象，不应提示为错误
      const isInterrupted =
        /interrupted by a new load request/i.test(msg) ||
        /The play\(\) request was interrupted/i.test(msg) ||
        e?.name === 'AbortError'
      // 已经被更新的播放请求取代，静默忽略
      if (isInterrupted || mySeq !== playSeq) return

      set({
        playing: false,
        loadError:
          e?.name === 'NotAllowedError'
            ? '播放需要用户交互，请点击播放按钮重试'
            : '播放失败：' + (msg || '未知错误'),
      })
    })

    // 播放启动后异步校准一次真实码率（此时代理已解析出最终可用的音质）
    ncm
      .probeAudio(song.id, quality)
      .then((p2) => {
        if (mySeq !== playSeq) return
        if (p2 && p2.code === 200 && p2.br > 0) {
          set({ actualBr: p2.br, actualQuality: p2.actualLevel || get().actualQuality })
        }
      })
      .catch(() => {})

    if (get().showDesktopLyric) {
      window.yun.lyricUpdate({ current: '♪ ' + song.name, trans: '', next: '' })
    }
  } catch (e: any) {
    set({ loading: false, loadError: e.message || '播放失败' })
  }
}

const ncm_qualityNotice = buildQualityNotice
