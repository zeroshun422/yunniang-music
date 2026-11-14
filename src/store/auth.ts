import { create } from 'zustand'
import type { UserProfile } from '@/types'
import * as ncm from '@/api/ncm'

/**
 * 判断 /login/status 的响应是否「明确表示未登录」。
 *
 * 网易云的返回有两种形态：
 *  - 已登录：{ data: { code: 200, profile: {...} } }（module/login_status.js 在
 *    body.code === 200 时才包一层 data）
 *  - 未登录：顶层 { code: 301 } 之类，没有 data 字段
 *
 * 只有这两种「服务端明确答复」才允许清理本地凭据。
 * 风控(-460/-447/-462)、限流、超时、502 等一律视为「状态未知」，
 * 必须保留凭据 —— 否则一次偶发风控就会把用户的登录态抹掉。
 */
const DEFINITIVE_LOGGED_OUT_CODES = new Set([301, 302, -201, 400, 10004])
const TRANSIENT_CODES = new Set([-460, -447, -462, -1, 500, 502, 503, 504])

/**
 * 判断 cookie 串里是否带有非空的 MUSIC_U。
 * 不能用 includes('MUSIC_U')：'MUSIC_U=' 这种空值也会命中，属于误判。
 */
export function hasLoginCredential(cookie: string): boolean {
  if (!cookie) return false
  for (const part of cookie.split(/;\s*/)) {
    const idx = part.indexOf('=')
    if (idx < 1) continue
    if (part.slice(0, idx).trim() === 'MUSIC_U') return part.slice(idx + 1).trim() !== ''
  }
  return false
}

export type LoginStatusVerdict = 'logged-in' | 'logged-out' | 'unknown'

/** 解析 login/status 响应，给出三态结论 */
export function classifyLoginStatus(st: any): { verdict: LoginStatusVerdict; profile: UserProfile | null } {
  // 请求本身失败（网络错误等）
  if (st == null) return { verdict: 'unknown', profile: null }

  const innerCode = st?.data?.code
  const topCode = st?.code
  const ok = innerCode === 200 || topCode === 200
  const profile: UserProfile | null = st?.data?.profile || st?.profile || null

  if (ok && profile) return { verdict: 'logged-in', profile }
  // 返回 200 但没有 profile：说明匿名态，属于明确未登录
  if (ok && !profile) return { verdict: 'logged-out', profile: null }

  const code = typeof topCode === 'number' ? topCode : typeof innerCode === 'number' ? innerCode : null
  if (code == null) return { verdict: 'unknown', profile: null }
  if (TRANSIENT_CODES.has(code) || (code >= 500 && code <= 599)) {
    return { verdict: 'unknown', profile: null }
  }
  if (DEFINITIVE_LOGGED_OUT_CODES.has(code)) return { verdict: 'logged-out', profile: null }
  // 其它未知 code：保守起见不清凭据
  return { verdict: 'unknown', profile: null }
}

interface AuthState {
  user: UserProfile | null
  cookie: string
  ready: boolean
  loggingIn: boolean
  error: string | null

  bootstrap: () => Promise<void>
  refreshUser: () => Promise<void>
  loginByQrPoll: (key: string) => Promise<{ ok: boolean; code: number; message?: string }>
  loginByPhone: (phone: string, pwd: string) => Promise<{ ok: boolean; message?: string }>
  loginByEmail: (email: string, pwd: string) => Promise<{ ok: boolean; message?: string }>
  logout: () => Promise<void>
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  cookie: '',
  ready: false,
  loggingIn: false,
  error: null,

  bootstrap: async () => {
    try {
      const saved = await window.yun.loadCookie()
      if (!saved) {
        set({ cookie: '', user: null })
        return
      }
      set({ cookie: saved })

      const st = await ncm.loginStatus().catch(() => null)
      const { verdict, profile } = classifyLoginStatus(st)

      if (verdict === 'logged-in' && profile) {
        set({ user: profile })
        return
      }

      if (verdict === 'logged-out') {
        // 仅在此处清理：服务端明确说「未登录」
        await window.yun.clearCookie()
        set({ cookie: '', user: null })
        return
      }

      // 状态未知（风控 / 网络 / 未知 code）：保留凭据，只标记未登录
      console.warn('[auth] 登录态暂时无法确认，保留本地凭据')
      set({ cookie: saved, user: null })
    } catch (e) {
      console.error('[auth] bootstrap failed', e)
    } finally {
      set({ ready: true })
    }
  },

  refreshUser: async () => {
    const st = await ncm.loginStatus().catch(() => null)
    const { verdict, profile } = classifyLoginStatus(st)
    if (verdict === 'logged-in' && profile) set({ user: profile })
  },

  loginByQrPoll: async (key) => {
    try {
      const r = await ncm.qrCheck(key)
      if (r.code === 803) {
        // 登录成功：接口会在 body.cookie 里返回服务端种下的凭据。
        // 优先直接落库（主进程已顺带合并写入），再读回校验，避免只读到空值。
        const fromApi = typeof (r as any).cookie === 'string' ? (r as any).cookie : ''
        if (fromApi && hasLoginCredential(fromApi)) {
          await window.yun.saveCookie(fromApi)
        }
        let cookie = await window.yun.loadCookie()
        if (!cookie || !hasLoginCredential(cookie)) {
          // 读回失败但接口给了凭据：直接采用接口值
          if (fromApi) cookie = fromApi
        }
        set({ cookie })
        await get().refreshUser()
        return { ok: true, code: 803 }
      }
      return { ok: false, code: r.code, message: r.message }
    } catch (e: any) {
      return { ok: false, code: -1, message: e.message }
    }
  },

  loginByPhone: async (phone, pwd) => {
    set({ loggingIn: true, error: null })
    try {
      const r = await ncm.loginCellphone(phone, pwd)
      if (r.code === 200) {
        const fromApi = typeof (r as any).cookie === 'string' ? (r as any).cookie : ''
        if (fromApi && hasLoginCredential(fromApi)) await window.yun.saveCookie(fromApi)
        await get().refreshUser()
        const cookie = await window.yun.loadCookie()
        set({ cookie, loggingIn: false })
        return { ok: true }
      }
      const msg = r.message || r.msg || `登录失败（code ${r.code}）`
      set({ loggingIn: false, error: msg })
      return { ok: false, message: msg }
    } catch (e: any) {
      set({ loggingIn: false, error: e.message })
      return { ok: false, message: e.message }
    }
  },

  loginByEmail: async (email, pwd) => {
    set({ loggingIn: true, error: null })
    try {
      const r = await ncm.loginEmail(email, pwd)
      if (r.code === 200) {
        const fromApi = typeof (r as any).cookie === 'string' ? (r as any).cookie : ''
        if (fromApi && hasLoginCredential(fromApi)) await window.yun.saveCookie(fromApi)
        await get().refreshUser()
        const cookie = await window.yun.loadCookie()
        set({ cookie, loggingIn: false })
        return { ok: true }
      }
      const msg = r.message || r.msg || `登录失败（code ${r.code}）`
      set({ loggingIn: false, error: msg })
      return { ok: false, message: msg }
    } catch (e: any) {
      set({ loggingIn: false, error: e.message })
      return { ok: false, message: e.message }
    }
  },

  logout: async () => {
    await ncm.logout().catch(() => {})
    set({ user: null, cookie: '' })
  },
}))

