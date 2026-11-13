import type { QualityLevel, QualityOption } from '@/types'

/** 自动更新状态机，与 electron/updater.ts 的 UpdateStatus 保持一致 */
export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string; releaseNotes?: string; releaseDate?: string }
  | { state: 'not-available'; currentVersion: string }
  | { state: 'downloading'; percent: number; bytesPerSecond?: number; transferred?: number; total?: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string }

declare global {
  interface Window {
    yun: {
      getConfig(): Promise<{ apiBase: string; proxyBase: string; downloadDir: string; cacheDir: string; version: string; isDev: boolean }>
      getPlatform(): Promise<{ platform: string; arch: string; electron: string; chrome: string; node: string }>
      saveCookie(c: string): Promise<boolean>
      loadCookie(): Promise<string>
      clearCookie(): Promise<boolean>
      ncm(path: string, opts?: { method?: string; body?: unknown }): Promise<any>
      ncmWithCookie(path: string, cookie: string): Promise<any>
      probeAudio(id: number, level: string): Promise<any>
      download(payload: { id: number; name: string; artist: string; level: string }): Promise<any>
      onDownloadProgress(cb: (d: { id: number; percent: number }) => void): () => void
      openDownloadDir(): Promise<void>
      lyricShow(text: any): Promise<boolean>
      lyricUpdate(payload: any): Promise<boolean>
      lyricHide(): Promise<boolean>
      lyricToggle(): Promise<boolean>
      lyricSetIgnoreMouse(v: boolean): Promise<boolean>
      onLyricUpdate(cb: (d: any) => void): () => void
      winMinimize(): Promise<void>
      winMaximize(): Promise<boolean>
      winClose(): Promise<void>
      winIsMaximized(): Promise<boolean>
      onMaximized(cb: (v: boolean) => void): () => void
      // 自动更新
      getUpdateInfo(): Promise<{
        currentVersion: string
        format: 'appimage' | 'deb' | 'unknown'
        packaged: boolean
        feedConfigured: boolean
        usingMirror?: boolean
        feedUrl?: string
        mirror?: string
      }>
      getUpdateStatus(): Promise<UpdateStatus>
      checkUpdate(): Promise<UpdateStatus>
      downloadUpdate(): Promise<boolean>
      installUpdate(): Promise<boolean>
      openReleasePage(): Promise<boolean>
      onUpdateStatus(cb: (s: UpdateStatus) => void): () => void
    }
  }
}

// 音质档位（顺序即 UI 顺序）
export const QUALITIES: QualityOption[] = [
  { level: 'standard', label: '标准', br: 128000, desc: '128kbps MP3，省流量' },
  { level: 'higher', label: '较高', br: 192000, desc: '192kbps MP3' },
  { level: 'exhigh', label: '极高', br: 320000, desc: '320kbps MP3，日常推荐' },
  { level: 'lossless', label: '无损', br: 999000, badge: 'SQ', desc: 'FLAC 无损音质（需黑胶 VIP）' },
  { level: 'hires', label: 'Hi-Res', br: 1900000, badge: 'HR', desc: '24bit 高解析（需 SVIP）' },
  { level: 'jymaster', label: '超清母带', br: 1999000, badge: '母带', desc: 'Master 母带音质（需 SVIP）' },
]

export const QUALITY_LABEL: Record<string, string> = Object.fromEntries(
  QUALITIES.map((q) => [q.level, q.label])
)

export function levelToLabel(level: string | undefined | null): string {
  if (!level) return ''
  return QUALITY_LABEL[level] || level
}

/** 若服务端降级，提示用户实际拿到的音质 */
export function qualityNotice(requested: QualityLevel, actual: string, br: number): string | null {
  if (!actual) return null
  if (requested === actual) return null
  const reqLabel = levelToLabel(requested)
  const actLabel = levelToLabel(actual)
  const kbps = br ? Math.round(br / 1000) + 'kbps' : ''
  return `已从「${reqLabel}」降级为「${actLabel}」${kbps ? '（' + kbps + '）' : ''}`
}
