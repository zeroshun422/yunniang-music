import { create } from 'zustand'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'yun-theme'
/** 默认主题：浅色 */
const DEFAULT_THEME: Theme = 'light'

/** 过渡时长，需与 global.css 中 --theme-transition-duration 保持一致 */
const TRANSITION_MS = 800

/* ---------------------------------------------------------------------------
   玻璃透明度
   ---------------------------------------------------------------------------
   语义：1 = 设计基准；<1 更通透；>1 更实。
   实现：JS 只写一个数字变量 --glass-scale 到 <html>，
         颜色与上下限的 clamp 全部由 CSS 的派生层完成（见 global.css）。

   为什么不在 JS 里算 rgba：
     玻璃有 5 个层级（侧边栏/面板/抽屉/弹层/标题栏），
     若在 JS 里逐个算颜色，就必须把每层的颜色也搬进 TS，
     明暗两套主题 × 5 层 = 10 组常量，全部散落在 TS 里，
     改配色时要同时改 CSS 和 TS，几乎必然不同步。
     只传一个比例数字，配色仍只有 CSS 一处真源。
--------------------------------------------------------------------------- */
const ALPHA_KEY = 'yun-glass-alpha'

/** 滑块范围。下限不是 0：全透明时文字会直接压在背景图上不可读 */
export const GLASS_ALPHA_MIN = 0.2
export const GLASS_ALPHA_MAX = 1.8
export const GLASS_ALPHA_DEFAULT = 1

function clampAlpha(v: number): number {
  if (!Number.isFinite(v)) return GLASS_ALPHA_DEFAULT
  return Math.min(GLASS_ALPHA_MAX, Math.max(GLASS_ALPHA_MIN, v))
}

function readInitialAlpha(): number {
  try {
    const raw = localStorage.getItem(ALPHA_KEY)
    if (raw === null) return GLASS_ALPHA_DEFAULT
    const n = Number(raw)
    return Number.isFinite(n) ? clampAlpha(n) : GLASS_ALPHA_DEFAULT
  } catch {
    return GLASS_ALPHA_DEFAULT
  }
}

/** 把比例写到 <html> 的内联样式上；CSS 派生层会据此重算所有玻璃色 */
function applyAlpha(alpha: number) {
  document.documentElement.style.setProperty('--glass-scale', String(alpha))
}
/** 用于标记「正在切换主题」，CSS 依据它启用全局颜色过渡 */
const ANIMATING_ATTR = 'data-theme-animating'

function readInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    /* localStorage 不可用时退回默认 */
  }
  return DEFAULT_THEME
}

/**
 * 把主题写到 <html data-theme="..."> 上。
 *
 * 关于过渡：
 * CSS 变量本身不可过渡，切换 data-theme 会让所有颜色在同一帧跳变。
 * 因此这里在切换前给 <html> 挂上 data-theme-animating，让
 * global.css 中的规则对颜色属性启用 transition；
 * 过渡结束后移除该属性，避免长期存在的通配 transition 影响
 * hover 等交互手感与渲染性能。
 *
 * @param animate 是否播放过渡（首帧初始化时传 false，避免闪动）
 */
function applyTheme(theme: Theme, animate: boolean) {
  const root = document.documentElement

  if (!animate) {
    // 首帧/无动画：直接落定，且确保不残留 animating 状态
    root.removeAttribute(ANIMATING_ATTR)
    root.setAttribute('data-theme', theme)
    root.style.colorScheme = theme
    return
  }

  // 尊重系统「减少动态效果」偏好：直接切换，不做渐变
  const reduceMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  if (reduceMotion) {
    root.setAttribute('data-theme', theme)
    root.style.colorScheme = theme
    return
  }

  // 1) 先挂标记并强制一次样式计算，确保 transition 在属性变化前已生效
  root.setAttribute(ANIMATING_ATTR, '')
  void root.offsetHeight // 触发重排，提交 transition 声明

  // 2) 切换主题，此时颜色会从旧值平滑插值到新值
  root.setAttribute('data-theme', theme)
  root.style.colorScheme = theme

  // 3) 过渡结束后移除标记（留一点余量，避免边界掉帧）
  scheduleAnimationEnd(() => {
    // 期间若又发生切换，新的定时器会覆盖旧的，这里用属性存在性兜底
    root.removeAttribute(ANIMATING_ATTR)
  })
}

let animTimer: ReturnType<typeof setTimeout> | null = null

function scheduleAnimationEnd(done: () => void) {
  if (animTimer) clearTimeout(animTimer)
  animTimer = setTimeout(() => {
    animTimer = null
    done()
  }, TRANSITION_MS + 60)
}

interface ThemeState {
  theme: Theme
  setTheme: (t: Theme) => void
  toggle: () => void
  /** 玻璃透明度比例：1 为基准，<1 更通透，>1 更实 */
  glassAlpha: number
  setGlassAlpha: (v: number) => void
  /** 应用启动时调用一次，确保 DOM 与持久化状态一致（不播放过渡） */
  init: () => void
}

export const useTheme = create<ThemeState>((set, get) => ({
  theme: DEFAULT_THEME,
  glassAlpha: GLASS_ALPHA_DEFAULT,

  init: () => {
    const t = readInitialTheme()
    // 首帧不做过渡：否则会从浅色渐变到深色，反而制造"闪屏"
    applyTheme(t, false)
    const a = readInitialAlpha()
    applyAlpha(a)
    set({ theme: t, glassAlpha: a })
  },

  setGlassAlpha: (v) => {
    const next = clampAlpha(v)
    const prev = get().glassAlpha
    if (prev === next) return
    applyAlpha(next)
    try {
      localStorage.setItem(ALPHA_KEY, String(next))
    } catch {
      /* 忽略写入失败 */
    }
    set({ glassAlpha: next })
  },

  setTheme: (t) => {
    const prev = get().theme
    if (prev === t) return
    applyTheme(t, true)
    try {
      localStorage.setItem(STORAGE_KEY, t)
    } catch {
      /* 忽略写入失败 */
    }
    set({ theme: t })
  },

  toggle: () => {
    get().setTheme(get().theme === 'dark' ? 'light' : 'dark')
  },
}))
