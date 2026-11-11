import { create } from 'zustand'
import type { UserProfile } from '@/types'
import * as ncm from '@/api/ncm'

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
      set({ cookie: saved || '' })
      if (saved) {
        const st = await ncm.loginStatus().catch(() => null)
        const profile = st?.data?.profile
        // 注意：/login/status 的 code 位于 data.code（顶层可能没有 code）
        const ok = st?.data?.code === 200 || st?.code === 200
        if (profile && ok) {
          set({ user: profile })
        } else if (st === null) {
          // 网络失败：不要误删凭据，只标记未登录
          set({ cookie: saved, user: null })
        } else {
          // 真正判定登录态失效才清理
          await window.yun.clearCookie()
          set({ cookie: '', user: null })
        }
      }
    } catch (e) {
      console.error('[auth] bootstrap failed', e)
    } finally {
      set({ ready: true })
    }
  },

  refreshUser: async () => {
    const st = await ncm.loginStatus().catch(() => null)
    const profile = st?.data?.profile
    const ok = st?.data?.code === 200 || st?.code === 200
    if (profile && ok) set({ user: profile })
  },

  loginByQrPoll: async (key) => {
    try {
      const r = await ncm.qrCheck(key)
      if (r.code === 803) {
        // 登录成功：拿服务端种下的 cookie
        const cookie = await window.yun.loadCookie()
        set({ cookie })
        await get().refreshUser()
        const u = get().user
        if (!u) {
          const st = await ncm.loginStatus().catch(() => null)
          if (st?.data?.profile) set({ user: st.data.profile })
        }
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
