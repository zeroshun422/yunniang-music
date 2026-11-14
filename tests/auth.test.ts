// ---------------------------------------------------------------------------
// 登录态与 Cookie 持久化单元测试
//
// 本文件覆盖一次真实的线上事故：用户重启后登录信息丢失。
// 两个根因：
//  1. bootstrap 把「风控 -460 / 网络异常」也当成「登录过期」，直接删凭据
//  2. 内嵌 API 不返回 Set-Cookie 头，凭据在 body.cookie 里；
//     旧 mergeCookie 用 `split(';')[0]` 只取第一段，把 MUSIC_U 丢掉
//
// 测试直接 import 真实源码，不是复制逻辑。
// ---------------------------------------------------------------------------

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { mergeCookie, getCookieValue, hasLoginCredential } from '../electron/cookie.js'
import { classifyLoginStatus, hasLoginCredential as hasLoginCredFront } from '../src/store/auth.js'

describe('mergeCookie — Set-Cookie 头 vs 完整 cookie 串', () => {
  test('完整 cookie 串必须逐段解析（回归：旧实现只取第一段会丢 MUSIC_U）', () => {
    const merged = mergeCookie('', ['NMTID=abc; MUSIC_U=token123; __csrf=xyz'])
    assert.equal(getCookieValue(merged, 'NMTID'), 'abc')
    assert.equal(getCookieValue(merged, 'MUSIC_U'), 'token123')
    assert.equal(getCookieValue(merged, '__csrf'), 'xyz')
  })

  test('Set-Cookie 头只取第一段，属性不能当成 cookie', () => {
    const merged = mergeCookie('', ['MUSIC_U=tok; Path=/; HttpOnly; SameSite=Lax'])
    assert.equal(getCookieValue(merged, 'MUSIC_U'), 'tok')
    assert.equal(getCookieValue(merged, 'Path'), '')
    assert.equal(getCookieValue(merged, 'HttpOnly'), '')
    assert.equal(getCookieValue(merged, 'SameSite'), '')
  })

  test('Expires 属性里的逗号与日期不会被误解析', () => {
    const merged = mergeCookie('', [
      'MUSIC_U=tok2; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Max-Age=3600; Domain=.music.163.com',
    ])
    assert.equal(getCookieValue(merged, 'MUSIC_U'), 'tok2')
    assert.equal(getCookieValue(merged, 'Domain'), '')
  })

  test('新值覆盖旧值（同名）', () => {
    const merged = mergeCookie('MUSIC_U=old; NMTID=keep', ['MUSIC_U=new'])
    assert.equal(getCookieValue(merged, 'MUSIC_U'), 'new')
    assert.equal(getCookieValue(merged, 'NMTID'), 'keep')
  })

  test('保留旧 cookie 中未被覆盖的键', () => {
    const merged = mergeCookie('a=1; b=2', ['b=3; c=4'])
    assert.equal(merged, 'a=1; b=3; c=4')
  })

  test('空值也要写入（服务端用同名空值表示清除）', () => {
    const merged = mergeCookie('MUSIC_U=old', ['MUSIC_U='])
    assert.equal(getCookieValue(merged, 'MUSIC_U'), '')
    assert.equal(hasLoginCredential(merged), false)
  })

  test('忽略无等号的垃圾片段', () => {
    const merged = mergeCookie('', [';;;=bad; GOOD=1; nosign'])
    assert.equal(getCookieValue(merged, 'GOOD'), '1')
  })

  test('空输入返回空串', () => {
    assert.equal(mergeCookie('', []), '')
    assert.equal(mergeCookie('', [null as any, undefined as any]), '')
  })
})

describe('mergeCookie — 内嵌 API 的真实混合形态（事故根因）', () => {
  /**
   * NeteaseCloudMusicApi/module/login_qr_check.js 实际返回的 body.cookie 是
   * 多条 Set-Cookie 用 join(';') 拼成的长串，属性与键值对交织：
   *
   *   MUSIC_U=xxx; Max-Age=1296000; Path=/; __csrf=yyy; Max-Age=1296000; Path=/
   *
   * 旧实现 split(';')[0] 只能拿到第一段，登录成功后剩余凭据全丢。
   */
  const REAL_SHAPE =
    'MUSIC_U=f0a1b2c3; Max-Age=1296000; Path=/; __csrf=deadbeef; Max-Age=1296000; Path=/; NMTID=anon123; Max-Age=315; Path=/'

  test('登录成功的混合串：MUSIC_U / __csrf / NMTID 都要保住', () => {
    const merged = mergeCookie('', [REAL_SHAPE])
    assert.equal(getCookieValue(merged, 'MUSIC_U'), 'f0a1b2c3')
    assert.equal(getCookieValue(merged, '__csrf'), 'deadbeef')
    assert.equal(getCookieValue(merged, 'NMTID'), 'anon123')
  })

  test('属性名不得被当成 cookie 写入', () => {
    const merged = mergeCookie('', [REAL_SHAPE])
    assert.equal(getCookieValue(merged, 'Max-Age'), '')
    assert.equal(getCookieValue(merged, 'Path'), '')
  })

  test('未登录时只有匿名 NMTID 的返回（正是事故现场内容）', () => {
    const anonymous = 'NMTID=00OTDTU_DC01p2w-kkjmHTz8jwYFBEAAAGh2nEs-Q; Max-Age=315'
    const merged = mergeCookie('', [anonymous])
    assert.equal(getCookieValue(merged, 'NMTID'), '00OTDTU_DC01p2w-kkjmHTz8jwYFBEAAAGh2nEs-Q')
    assert.equal(hasLoginCredential(merged), false)
    assert.equal(getCookieValue(merged, 'Max-Age'), '')
  })

  test('匿名 NMTID 不得覆盖已有的 MUSIC_U', () => {
    const existing = 'MUSIC_U=validtoken; NMTID=old'
    const merged = mergeCookie(existing, ['NMTID=new; Max-Age=315'])
    assert.equal(getCookieValue(merged, 'MUSIC_U'), 'validtoken')
    assert.equal(getCookieValue(merged, 'NMTID'), 'new')
  })
})

describe('hasLoginCredential — 判定是否含登录凭据', () => {
  test('含非空 MUSIC_U 为真', () => {
    assert.equal(hasLoginCredential('MUSIC_U=abc'), true)
    assert.equal(hasLoginCredential('NMTID=x; MUSIC_U=abc; __csrf=y'), true)
  })

  test('MUSIC_U 为空值时为假（不能用 includes 判断）', () => {
    assert.equal(hasLoginCredential('MUSIC_U='), false)
    assert.equal(hasLoginCredential('NMTID=x; MUSIC_U='), false)
  })

  test('只有 NMTID 的残缺凭据为假（正是事故现场的文件内容）', () => {
    assert.equal(hasLoginCredential('NMTID=00OkhrpkUFQXYXfNUHVnse2n_ET_ckAAAG'), false)
  })

  test('键名前缀相同但不同名不算（MUSIC_UA 不是 MUSIC_U）', () => {
    assert.equal(hasLoginCredential('MUSIC_UA=abc'), false)
  })
})

describe('classifyLoginStatus — 三态判定（防误删凭据）', () => {
  test('data.code=200 且有 profile → 已登录', () => {
    const r = classifyLoginStatus({ data: { code: 200, profile: { userId: 1 } } })
    assert.equal(r.verdict, 'logged-in')
    assert.deepEqual(r.profile, { userId: 1 })
  })

  test('顶层 code=200 且带 profile → 已登录（兼容未包 data 的形态）', () => {
    const r = classifyLoginStatus({ code: 200, profile: { userId: 2 } })
    assert.equal(r.verdict, 'logged-in')
  })

  test('code=200 但没有 profile → 明确未登录（匿名态）', () => {
    const r = classifyLoginStatus({ code: 200, data: { code: 200 } })
    assert.equal(r.verdict, 'logged-out')
  })

  test('code=301 → 明确未登录，允许清凭据', () => {
    assert.equal(classifyLoginStatus({ code: 301 }).verdict, 'logged-out')
    assert.equal(classifyLoginStatus({ data: { code: 302 } }).verdict, 'logged-out')
  })

  test('风控 -460 必须判为 unknown（回归：旧代码会删凭据）', () => {
    assert.equal(classifyLoginStatus({ code: -460 }).verdict, 'unknown')
    assert.equal(classifyLoginStatus({ code: -447 }).verdict, 'unknown')
    assert.equal(classifyLoginStatus({ code: -462 }).verdict, 'unknown')
  })

  test('5xx 与网络失败判为 unknown', () => {
    assert.equal(classifyLoginStatus({ code: 502 }).verdict, 'unknown')
    assert.equal(classifyLoginStatus({ code: 503 }).verdict, 'unknown')
    assert.equal(classifyLoginStatus(null).verdict, 'unknown')
  })

  test('未知 code 保守判为 unknown，不清凭据', () => {
    assert.equal(classifyLoginStatus({ code: 9999 }).verdict, 'unknown')
    assert.equal(classifyLoginStatus({ code: -999 }).verdict, 'unknown')
  })

  test('只有 unknown 与 logged-out 才可能触发清理，logged-in 不清理', () => {
    const cases = [
      { input: null, expectClear: false },
      { input: { code: -460 }, expectClear: false },
      { input: { code: 301 }, expectClear: true },
      { input: { data: { code: 200, profile: { userId: 1 } } }, expectClear: false },
    ]
    for (const c of cases) {
      const { verdict } = classifyLoginStatus(c.input)
      const wouldClear = verdict === 'logged-out'
      assert.equal(wouldClear, c.expectClear, JSON.stringify(c.input))
    }
  })
})

describe('classifyLoginStatus — 安全属性：绝不因异常响应删凭据', () => {
  /**
   * 这是本次事故的核心不变量：
   * 只有当服务端「明确」表示未登录（301/302 等）时才允许清空本地凭据。
   * 任何其它 code（风控、限流、5xx、未知值）都必须落到 unknown。
   *
   * 用穷举式断言守住这条线，避免以后调整 TRANSIENT_CODES 时退化为误删。
   */
  const MUST_NOT_CLEAR = [
    -460, -447, -462, -1, 500, 502, 503, 504, -999, 9999, 0,
  ]
  test('风控/限流/服务端错误/未知 code 一律不得判为 logged-out', () => {
    for (const code of MUST_NOT_CLEAR) {
      const { verdict } = classifyLoginStatus({ code })
      assert.notEqual(verdict, 'logged-out', `code ${code} 不应触发清理凭据`)
    }
  })

  test('同样的 code 出现在 data.code 里也不得判为 logged-out', () => {
    for (const code of MUST_NOT_CLEAR) {
      const { verdict } = classifyLoginStatus({ data: { code } })
      assert.notEqual(verdict, 'logged-out', `data.code ${code} 不应触发清理凭据`)
    }
  })

  test('空的 / 畸形响应不得判为 logged-out', () => {
    for (const bad of [null, undefined, {}, { data: {} }, { code: undefined }, 'oops' as any]) {
      const { verdict } = classifyLoginStatus(bad as any)
      assert.notEqual(verdict, 'logged-out', `响应 ${JSON.stringify(bad)} 不应触发清理凭据`)
    }
  })

  test('只有明确登出码才判为 logged-out', () => {
    for (const code of [301, 302, -201, 400, 10004]) {
      assert.equal(classifyLoginStatus({ code }).verdict, 'logged-out', `code ${code} 应判为 logged-out`)
    }
  })
})

describe('前后端 hasLoginCredential 判定一致', () => {
  test('两侧对同一批样例给出相同结论', () => {
    const samples = [
      'MUSIC_U=abc',
      'MUSIC_U=',
      'NMTID=x; MUSIC_U=t',
      'NMTID=only',
      'MUSIC_UA=abc',
      '',
    ]
    for (const s of samples) {
      assert.equal(hasLoginCredential(s), hasLoginCredFront(s), `不一致: ${JSON.stringify(s)}`)
    }
  })
})
