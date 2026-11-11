import { create } from 'zustand'
import type { Song, QualityLevel, LyricLine } from '@/types'
import * as ncm from '@/api/ncm'

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
    if (!queue.length) return
    let nextIdx: number
    if (shuffle) {
      nextIdx = Math.floor(Math.random() * queue.length)
      if (queue.length > 1 && nextIdx === currentIndex) nextIdx = (nextIdx + 1) % queue.length
    } else {
      nextIdx = currentIndex + 1
      if (nextIdx >= queue.length) {
        if (repeat === 'all' || manual) nextIdx = 0
        else { set({ playing: false }); return }
      }
    }
    set({ currentIndex: nextIdx })
    await loadAndPlay(queue[nextIdx], set, get)
  },

  prev: async () => {
    const { queue, currentIndex } = get()
    if (!queue.length) return
    // 播放超过 3 秒时先重头播
    if (audioEl && audioEl.currentTime > 3) {
      audioEl.currentTime = 0
      return
    }
    let prevIdx = currentIndex - 1
    if (prevIdx < 0) prevIdx = queue.length - 1
    set({ currentIndex: prevIdx })
    await loadAndPlay(queue[prevIdx], set, get)
  },

  seek: (t) => {
    if (audioEl) { audioEl.currentTime = t; set({ currentTime: t }) }
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
    const q = queue.filter((_, i) => i !== index)
    let ci = currentIndex
    if (index < currentIndex) ci--
    else if (index === currentIndex) ci = Math.min(currentIndex, q.length - 1)
    set({ queue: q, currentIndex: ci })
  },

  clearQueue: () => {
    if (audioEl) { audioEl.pause(); audioEl.src = '' }
    set({ queue: [], currentIndex: -1, playing: false, lyrics: [], currentLine: -1 })
  },

  moveInQueue: (from, to) => {
    const { queue, currentIndex } = get()
    if (from === to) return
    const q = [...queue]
    const [item] = q.splice(from, 1)
    q.splice(to, 0, item)
    let ci = currentIndex
    if (from === currentIndex) ci = to
    else if (from < currentIndex && to >= currentIndex) ci--
    else if (from > currentIndex && to <= currentIndex) ci++
    set({ queue: q, currentIndex: ci })
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

function shuffleArray<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}


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

function ncm_qualityNotice(requested: QualityLevel, actual: string, br: number): string | null {
  if (!actual || requested === actual) return null
  const LABELS: Record<string, string> = {
    standard: '标准', higher: '较高', exhigh: '极高', lossless: '无损',
    hires: 'Hi-Res', jyeffect: '高清环绕', sky: '沉浸环绕', jymaster: '超清母带',
  }
  return `「${LABELS[requested] || requested}」不可用，已自动降级为「${LABELS[actual] || actual}」${
    br ? `（${Math.round(br / 1000)}kbps）` : ''
  }`
}
