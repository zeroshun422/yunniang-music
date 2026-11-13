import { app } from 'electron'
import { autoUpdater } from 'electron-updater'

// ---------------------------------------------------------------------------
// 自动更新
//
// 设计要点：
// 1. 只对「已打包」的应用生效 —— 开发模式下没有 app-update.yml，检查会报错
// 2. 启动后延迟检查，避免和首屏加载抢资源
// 3. 下载行为可选，默认「提示后由用户决定」（autoDownload = false）
// 4. 更新源默认走 v4.gh-proxy.org 加速镜像；镜像检查失败时自动回退直连
//    GitHub 并重新检查（重新检查才会重建 provider / 文件 URL）
// 5. 更新源必须是 releases/latest/download（永续最新地址），不能用
//    releases/download/v<当前版本>/，否则读到自己这一版的元数据，永远无更新
// 6. AppImage 与 deb 均可应用内下载；deb 安装时由 electron-updater 通过
//    pkexec / sudo 提权完成
// 7. 失败静默 —— 更新检查失败不弹窗，只在设置页显示状态
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

// ---------------------------------------------------------------------------
// 下载加速镜像
//
// 直连 GitHub Release 在国内网络下经常超时或返回 302 后无法续传。
// 实测：直连大文件 Range 请求返回 302 且实收 0 字节，
// 而经过 v4.gh-proxy.org 代理可正常返回 206 并达到 ~19MB/s。
//
// 镜像前缀作用方式：在完整 URL 前拼接，例如
//   https://v4.gh-proxy.org/https://github.com/owner/repo/releases/download/...
// ---------------------------------------------------------------------------
const PROXY_PREFIX = 'https://v4.gh-proxy.org/'

/**
 * 更新源基址。
 *
 * 必须使用 `releases/latest/download/`（GitHub 的永续最新地址），
 * 而不是 `releases/download/v<当前版本>/` —— 后者会取到「自己这一版」的
 * 元数据，永远检测不到新版本。
 */
function releaseBaseUrl(): string {
  return 'https://github.com/zeroshun422/yunniang-music/releases/latest/download'
}

let useProxy = true
/** 当前生效的更新源地址（含是否走镜像），供设置页展示 */
let activeFeedUrl = ''
/** 镜像前缀，导出给设置页显示 */
export const UPDATE_MIRROR = PROXY_PREFIX

/**
 * 正在做「镜像 → 直连」自动回退时为 true。
 * electron-updater 在失败时会派发 error 事件，回退期间要抑制这些中间错误，
 * 否则 UI 会先闪一次「更新失败」再变成「检查中」，状态抖动且误导用户。
 */
let fallbackInProgress = false

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

  // 把更新源指向加速镜像。
  // 方式：改用 generic provider，把 url 设为「代理前缀 + Release 基址」，
  // 这样元数据与大文件下载都会走代理。
  // 若代理不可用，checkForUpdates 会捕获错误并自动回退直连。
  configureFeed(useProxy)

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
    // 自动回退期间的中间错误不推送（checkForUpdates 会重新检查）
    if (fallbackInProgress) return
    emit({ state: 'error', message: err?.message || '检查更新失败' })
  })

  // 启动后延迟检查：等首屏稳定，避免与 API 启动、列表渲染抢资源
  setTimeout(() => {
    void checkForUpdates()
  }, 8000)
}

/**
 * 配置更新源。
 * @param proxied true 走镜像，false 直连 GitHub
 */
function configureFeed(proxied: boolean) {
  const base = proxied ? PROXY_PREFIX + releaseBaseUrl() : releaseBaseUrl()
  try {
    autoUpdater.setFeedURL({ provider: 'generic', url: base } as any)
    activeFeedUrl = base
    console.log('[updater] 更新源:', base)
  } catch (e: any) {
    console.warn('[updater] 设置更新源失败:', e?.message)
  }
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
    // 镜像不可用 → 切到直连，重新检查一次。
    // 注意：只有「重新检查」才会让 electron-updater 用新 provider 重建
    // updateInfoAndProvider（见其 doCheckForUpdates），所以回退必须放在这里，
    // 而不是在 downloadUpdate 里（那里复用的是旧 provider 拼出的代理 URL）。
    if (useProxy) {
      console.warn('[updater] 镜像检查失败，回退直连:', e?.message)
      fallbackInProgress = true
      useProxy = false
      configureFeed(false)
      try {
        await autoUpdater.checkForUpdates()
        return lastStatus
      } catch (e2: any) {
        emit({ state: 'error', message: e2?.message || '检查更新失败' })
        return lastStatus
      } finally {
        fallbackInProgress = false
      }
    }
    emit({ state: 'error', message: e?.message || '检查更新失败' })
  }
  return lastStatus
}

/** 开始下载已发现的更新 */
export async function downloadUpdate(): Promise<boolean> {
  // 不做「镜像失败自动回退直连」：downloadUpdate() 复用的是 checkForUpdates()
  // 缓存下来的 updateInfoAndProvider，里面已包含拼好的代理 URL；此处换 feed
  // 并不会改变正在下载的文件地址，只会造成重复下载同一个失败 URL。
  // 若加速镜像确实不可用，用户可在设置里看到「前往下载页」手动获取。
  try {
    emit({ state: 'downloading', percent: 0 })
    await autoUpdater.downloadUpdate()
    return true
  } catch (e: any) {
    // electron-updater 内部已派发过 error 事件，这里补一条更明确的中文提示
    emit({
      state: 'error',
      message: e?.message
        ? `下载更新失败：${e.message}`
        : '下载更新失败，可点击「前往下载页」手动获取新版本。',
    })
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
    /** 当前更新源是否走加速镜像 */
    usingMirror: useProxy,
    /** 实际使用的更新源地址 */
    feedUrl: activeFeedUrl,
    /** 镜像前缀（展示用） */
    mirror: PROXY_PREFIX,
  }
}
