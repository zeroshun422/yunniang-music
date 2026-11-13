import { app } from 'electron'
import { autoUpdater } from 'electron-updater'

// ---------------------------------------------------------------------------
// 自动更新
//
// 设计要点：
// 1. 只对「已打包」的应用生效 —— 开发模式下没有 app-update.yml，检查会报错
// 2. 启动后延迟检查，避免和首屏加载抢资源
// 3. 下载行为可选（询问用户 / 自动），默认「提示后由用户决定」
// 4. AppImage 与 deb 的更新方式不同：
//    - AppImage：electron-updater 可直接替换文件
//    - deb：需要 sudo 安装，因此只提示「有新版本」并引导到 Release 页
// 5. 失败静默 —— 更新检查失败不应打扰用户听歌
// ---------------------------------------------------------------------------

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string; releaseNotes?: string; releaseDate?: string }
  | { state: 'not-available'; currentVersion: string }
  | { state: 'downloading'; percent: number; bytesPerSecond?: number; transferred?: number; total?: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string }

type Sender = (status: UpdateStatus) => void

let lastStatus: UpdateStatus = { state: 'idle' }
let send: Sender | null = null

/** 当前运行形态：AppImage / deb / 其它 */
function detectPackageFormat(): 'appimage' | 'deb' | 'unknown' {
  const p = process.env.APPIMAGE || ''
  if (p) return 'appimage'
  // deb 安装后位于 /opt，二进制路径不含 AppImage 环境变量
  if (process.execPath.includes('/opt/')) return 'deb'
  return 'unknown'
}

function emit(status: UpdateStatus) {
  lastStatus = status
  try {
    send?.(status)
  } catch {
    /* 渲染进程可能已关闭 */
  }
}

/**
 * 初始化自动更新。
 * @param onStatus 状态推送回调（通常是向渲染进程发 IPC）
 */
export function initAutoUpdater(onStatus: Sender) {
  send = onStatus

  // 开发模式不检查更新
  if (!app.isPackaged) {
    emit({ state: 'idle' })
    return
  }

  autoUpdater.autoDownload = false // 由用户确认后再下载
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowPrerelease = false

  autoUpdater.on('checking-for-update', () => emit({ state: 'checking' }))

  autoUpdater.on('update-available', (info) => {
    emit({
      state: 'available',
      version: info.version,
      releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined,
      releaseDate: info.releaseDate,
    })
  })

  autoUpdater.on('update-not-available', (info) => {
    emit({ state: 'not-available', currentVersion: info?.version || app.getVersion() })
  })

  autoUpdater.on('download-progress', (p) => {
    emit({
      state: 'downloading',
      percent: Math.round(p.percent),
      bytesPerSecond: p.bytesPerSecond,
      transferred: p.transferred,
      total: p.total,
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    emit({ state: 'downloaded', version: info.version })
  })

  autoUpdater.on('error', (err) => {
    // 更新失败不弹窗打扰，仅记录并通过状态告知
    console.warn('[updater] 检查更新失败:', err?.message)
    emit({ state: 'error', message: err?.message || '检查更新失败' })
  })

  // 启动后延迟检查：等首屏稳定，避免与 API 启动、列表渲染抢资源
  setTimeout(() => {
    void checkForUpdates()
  }, 8000)
}

/** 手动检查更新（设置页按钮） */
export async function checkForUpdates(): Promise<UpdateStatus> {
  if (!app.isPackaged) {
    emit({ state: 'error', message: '开发模式下不检查更新' })
    return lastStatus
  }
  try {
    await autoUpdater.checkForUpdates()
  } catch (e: any) {
    emit({ state: 'error', message: e?.message || '检查更新失败' })
  }
  return lastStatus
}

/** 开始下载已发现的更新 */
export async function downloadUpdate(): Promise<boolean> {
  try {
    await autoUpdater.downloadUpdate()
    return true
  } catch (e: any) {
    emit({ state: 'error', message: e?.message || '下载更新失败' })
    return false
  }
}

/** 退出并安装（AppImage 可直接生效；deb 会走系统安装流程） */
export function quitAndInstall() {
  try {
    autoUpdater.quitAndInstall(false, true)
  } catch (e: any) {
    emit({ state: 'error', message: e?.message || '安装更新失败' })
  }
}

export function getUpdateStatus(): UpdateStatus {
  return lastStatus
}

/** 当前版本与安装形态，供设置页展示 */
export function getUpdateInfo() {
  return {
    currentVersion: app.getVersion(),
    format: detectPackageFormat(),
    packaged: app.isPackaged,
    feedConfigured: app.isPackaged,
  }
}
