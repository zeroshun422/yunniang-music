import { create } from 'zustand'

/**
 * 纯 UI 状态（与播放业务逻辑无关）
 *
 * 用途：右侧抽屉（播放队列 / 歌词）打开时，需要给主内容区让出宽度，
 * 由 App 层感知并加上 .drawer-open 类。放在独立 store 避免污染 player store 的业务状态。
 */
export type DrawerKind = null | 'queue' | 'lyric'

interface UiState {
  drawer: DrawerKind
  openDrawer: (d: Exclude<DrawerKind, null>) => void
  closeDrawer: () => void
  toggleDrawer: (d: Exclude<DrawerKind, null>) => void
}

export const useUi = create<UiState>((set, get) => ({
  drawer: null,
  openDrawer: (d) => set({ drawer: d }),
  closeDrawer: () => set({ drawer: null }),
  toggleDrawer: (d) => set({ drawer: get().drawer === d ? null : d }),
}))

export function useDrawer(kind: Exclude<DrawerKind, null>) {
  const drawer = useUi((s) => s.drawer)
  const openDrawer = useUi((s) => s.openDrawer)
  const closeDrawer = useUi((s) => s.closeDrawer)
  return {
    open: drawer === kind,
    toggle: () => useUi.getState().toggleDrawer(kind),
    close: closeDrawer,
    openDrawer,
  }
}
