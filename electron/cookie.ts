// ---------------------------------------------------------------------------
// Cookie 合并逻辑（纯函数，无 Electron 依赖，便于单元测试）
//
// 背景（真实踩坑，已由内嵌 API 实测证实）：
// 内嵌的 NeteaseCloudMusicApi 用 `res.send(body)` 返回，**不设置 Set-Cookie
// 响应头**，而是把凭据放在 JSON 的 body.cookie 字段里。
//
// 该字段的真实形态并不干净。NeteaseCloudMusicApi/module/login_qr_check.js 用
//   `cookie: result.cookie.join(';')`
// 把「每一条 Set-Cookie 头」直接拼成一个长串，而每条本身还带着属性：
//
//   MUSIC_U=xxx; Max-Age=1296000; Path=/; __csrf=yyy; Max-Age=1296000; Path=/
//
// 所以它既不是纯 Set-Cookie，也不是纯 cookie 串，而是二者的混合体。
// 旧实现用 `split(';')[0]` 取第一段，登录成功后只剩 MUSIC_U 之前的匿名
// NMTID，用户表现就是「重启后登录信息丢失」。
//
// 正确做法：逐段扫描，凡是不带 `=` 的段、或是已知属性名（Max-Age/Path/
// HttpOnly/Secure/SameSite/Domain/Expires）一律跳过，其余按 k=v 收集。
// ---------------------------------------------------------------------------

/** 已知的 Set-Cookie 属性名（小写）。这些段即使带 `=` 也不是 cookie。 */
const COOKIE_ATTR_NAMES = new Set([
  'path',
  'domain',
  'expires',
  'max-age',
  'httponly',
  'secure',
  'samesite',
  'priority',
  'partitioned',
])

/**
 * 解析一段 cookie 文本（可能是 Set-Cookie、纯 cookie 串，或两者拼接）。
 * 返回收集到的 [key, value] 列表，保持出现顺序。
 */
function parsePairs(text: string): Array<[string, string]> {
  const out: Array<[string, string]> = []
  if (!text) return out
  for (const raw of text.split(';')) {
    const seg = raw.trim()
    if (!seg) continue
    const idx = seg.indexOf('=')
    // 无等号：纯属性标志（如 HttpOnly）或垃圾片段
    if (idx < 1) continue
    const k = seg.slice(0, idx).trim()
    const v = seg.slice(idx + 1).trim()
    if (!k) continue
    // 属性名即使带值也不是 cookie（Max-Age=315 等）
    if (COOKIE_ATTR_NAMES.has(k.toLowerCase())) continue
    out.push([k, v])
  }
  return out
}

/**
 * 合并 cookie。
 *
 * @param oldCookie 已有凭据，形如 `a=1; b=2`
 * @param incoming  待合并项数组；每项可以是 Set-Cookie 头、完整 cookie 串，
 *                  也可以是二者拼接的混合体（内嵌 API 的实际形态）
 * @returns 合并后的 cookie 串（`k=v; k2=v2`）
 */
export function mergeCookie(oldCookie: string, incoming: Array<string | null | undefined>): string {
  const map = new Map<string, string>()
  for (const [k, v] of parsePairs(oldCookie)) map.set(k, v)
  for (const c of incoming || []) {
    if (!c) continue
    for (const [k, v] of parsePairs(c)) map.set(k, v)
  }
  return Array.from(map.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')
}

/** 从 cookie 串中取某个键的值，取不到返回空串 */
export function getCookieValue(cookie: string, key: string): string {
  if (!cookie) return ''
  for (const [k, v] of parsePairs(cookie)) {
    if (k === key) return v
  }
  return ''
}

/**
 * 判断一份 cookie 是否含有可用的登录凭据（MUSIC_U 非空）。
 * 用于「读回失败时是否采用接口返回值」这类判断。
 */
export function hasLoginCredential(cookie: string): boolean {
  return getCookieValue(cookie, 'MUSIC_U') !== ''
}
