import { create } from 'zustand'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'yun-theme'
/** 默认主题：浅色 */
const DEFAULT_THEME: Theme = 'light'

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
 * 所有配色都通过 :root[data-theme] 的 CSS 变量切换，
 * 因此这里只做一件事：改一个属性，不触碰任何组件的样式。
 */
function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.setAttribute('data-theme', theme)
  // 让原生控件（滚动条、表单）跟随配色方案
  root.style.colorScheme = theme
}

interface ThemeState {
  theme: Theme
  setTheme: (t: Theme) => void
  toggle: () => void
  /** 应用启动时调用一次，确保 DOM 与持久化状态一致 */
  init: () => void
}

export const useTheme = create<ThemeState>((set, get) => ({
  theme: DEFAULT_THEME,

  init: () => {
    const t = readInitialTheme()
    applyTheme(t)
    set({ theme: t })
  },

  setTheme: (t) => {
    applyTheme(t)
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
