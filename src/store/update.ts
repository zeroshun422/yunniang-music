import { create } from 'zustand'
import type { UpdateStatus } from '@/api/bridge'

interface UpdateState {
  status: UpdateStatus
  info: {
    currentVersion: string
    format: string
    packaged: boolean
    usingMirror?: boolean
    feedUrl?: string
    mirror?: string
  } | null
  /** 用户是否手动触发过检查（用于区分"启动自动检查"与"手动检查"） */
  manual: boolean
  init: () => Promise<void>
  check: () => Promise<void>
  download: () => Promise<void>
  install: () => Promise<void>
  openReleasePage: () => Promise<void>
}

export const useUpdate = create<UpdateState>((set, get) => ({
  status: { state: 'idle' },
  info: null,
  manual: false,

  init: async () => {
    try {
      const [status, info] = await Promise.all([
        window.yun.getUpdateStatus(),
        window.yun.getUpdateInfo(),
      ])
      set({ status, info })
    } catch {
      /* 更新模块不可用时静默 */
    }

    // 订阅后续状态推送
    window.yun.onUpdateStatus?.((s) => set({ status: s }))
  },

  check: async () => {
    set({ manual: true, status: { state: 'checking' } })
    try {
      const s = await window.yun.checkUpdate()
      set({ status: s })
    } catch (e: any) {
      set({ status: { state: 'error', message: e?.message || '检查更新失败' } })
    }
  },

  download: async () => {
    // 下载进度由主进程通过 update:status 推送，这里只触发
    await window.yun.downloadUpdate()
  },

  install: async () => {
    await window.yun.installUpdate()
  },

  openReleasePage: async () => {
    await window.yun.openReleasePage()
  },
}))

/** 从状态中提取「是否有可用更新」等便捷判断 */
export function describeUpdate(s: UpdateStatus): string {
  switch (s.state) {
    case 'idle':
      return '未检查'
    case 'checking':
      return '正在检查…'
    case 'available':
      return `发现新版本 v${s.version}`
    case 'not-available':
      return '已是最新版本'
    case 'downloading':
      return `下载中 ${s.percent}%`
    case 'downloaded':
      return `v${s.version} 已下载，可重启安装`
    case 'error':
      return s.message
    default:
      return ''
  }
}
