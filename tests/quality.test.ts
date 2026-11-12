// ---------------------------------------------------------------------------
// 音质解析逻辑单元测试
//
// 运行：npm run test
// 使用 Node 内置 node:test，无需额外依赖。
// 源码为 TypeScript，使用 esbuild 预编译到 dist-test/ 后执行。
// ---------------------------------------------------------------------------

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  inferRealLevel,
  levelToBr,
  resolveWithFallback,
  QUALITY_CHAIN,
  MAX_ATTEMPTS_PER_LEVEL,
  type QualityLevel,
  type FetchOutcome,
} from '../electron/quality.js'

// 无延迟的 sleep，避免测试变慢
const noSleep = async () => {}

describe('inferRealLevel — 真实音质反推', () => {
  test('真无损：FLAC + 798kbps 应保持 lossless', () => {
    assert.equal(inferRealLevel('lossless', 798000, 'flac'), 'lossless')
  })

  test('真母带：FLAC + 2755kbps 应保持 jymaster', () => {
    assert.equal(inferRealLevel('jymaster', 2755102, 'flac'), 'jymaster')
  })

  test('真 Hi-Res：FLAC + 2832kbps 应保持 hires', () => {
    assert.equal(inferRealLevel('hires', 2832000, 'flac'), 'hires')
  })

  test('静默降级：请求 lossless 但返回 320k MP3 → exhigh', () => {
    assert.equal(inferRealLevel('lossless', 320000, 'mp3'), 'exhigh')
  })

  test('静默降级：请求 lossless 但返回 128k MP3 → standard', () => {
    assert.equal(inferRealLevel('lossless', 128012, 'MP3'), 'standard')
  })

  test('静默降级：请求 jymaster 但只给 320k mp3 → exhigh', () => {
    assert.equal(inferRealLevel('jymaster', 320000, 'mp3'), 'exhigh')
  })

  test('大小写不敏感：FLAC / Flac / flac 都识别', () => {
    assert.equal(inferRealLevel('lossless', 900000, 'FLAC'), 'lossless')
    assert.equal(inferRealLevel('lossless', 900000, 'Flac'), 'lossless')
  })

  test('type 含 flac 子串也可识别（如 "audio/flac"）', () => {
    assert.equal(inferRealLevel('lossless', 900000, 'audio/flac'), 'lossless')
  })

  test('请求 exhigh 却拿到 FLAC 高码率 → 如实升报 lossless', () => {
    assert.equal(inferRealLevel('exhigh', 900000, 'flac'), 'lossless')
  })

  test('请求 higher 拿到 320k → 升报 exhigh', () => {
    assert.equal(inferRealLevel('higher', 320000, 'mp3'), 'exhigh')
  })

  test('请求 higher 拿到 192k → 保持 higher', () => {
    assert.equal(inferRealLevel('higher', 192000, 'mp3'), 'higher')
  })

  test('边界：FLAC 但码率仅 600k → 归为 lossless', () => {
    assert.equal(inferRealLevel('hires', 600000, 'flac'), 'lossless')
  })

  test('边界：FLAC 但码率 400k → 不算无损，归 exhigh', () => {
    assert.equal(inferRealLevel('lossless', 400000, 'flac'), 'exhigh')
  })

  test('异常输入：br/type 为空不应崩溃', () => {
    assert.equal(inferRealLevel('lossless', null, null), 'standard')
    assert.equal(inferRealLevel('lossless', undefined, undefined), 'standard')
    assert.equal(inferRealLevel('lossless', 0, ''), 'standard')
  })

  test('异常输入：br 为字符串数字也能解析', () => {
    assert.equal(inferRealLevel('lossless', '798000', 'flac'), 'lossless')
  })
})

describe('levelToBr — 档位到码率映射', () => {
  test('各档位映射正确', () => {
    assert.equal(levelToBr('standard'), 128000)
    assert.equal(levelToBr('higher'), 192000)
    assert.equal(levelToBr('exhigh'), 320000)
    assert.equal(levelToBr('lossless'), 999000)
    assert.equal(levelToBr('hires'), 1900000)
    assert.equal(levelToBr('jymaster'), 1999000)
  })

  test('未知档位回退到 320000', () => {
    assert.equal(levelToBr('unknown'), 320000)
  })
})

describe('QUALITY_CHAIN — 降级链完整性', () => {
  test('每档链路的末位都是 standard', () => {
    for (const [k, chain] of Object.entries(QUALITY_CHAIN)) {
      assert.equal(chain[chain.length - 1], 'standard', `${k} 链路末位应为 standard`)
    }
  })

  test('每档链路首位是请求的档位本身', () => {
    for (const [k, chain] of Object.entries(QUALITY_CHAIN)) {
      assert.equal(chain[0], k, `${k} 链路首位应为自己`)
    }
  })

  test('链路严格递减（不会出现低档回退到高档）', () => {
    const rank: Record<string, number> = {
      standard: 0, higher: 1, exhigh: 2, lossless: 3, hires: 4, jymaster: 5,
    }
    for (const [k, chain] of Object.entries(QUALITY_CHAIN)) {
      for (let i = 1; i < chain.length; i++) {
        assert.ok(
          rank[chain[i]] <= rank[chain[i - 1]],
          `${k} 链路出现回升：${chain[i - 1]} -> ${chain[i]}`
        )
      }
    }
  })
})

describe('resolveWithFallback — 重试与降级', () => {
  test('第一次就成功：不重试、不降级', async () => {
    let calls = 0
    const r = await resolveWithFallback(
      ['lossless', 'exhigh'],
      async (lv) => {
        calls++
        return { ok: true, url: 'x', br: 798000, type: 'flac' }
      },
      noSleep
    )
    assert.equal(r.found, true)
    assert.equal(r.level, 'lossless')
    assert.equal(calls, 1)
    assert.equal(r.attempts, 1)
  })

  test('风控错误应重试同一档位，最终成功', async () => {
    let calls = 0
    const r = await resolveWithFallback(
      ['lossless'],
      async () => {
        calls++
        // 前两次风控，第三次成功
        if (calls < 3) return { ok: false, code: -460, retryable: true }
        return { ok: true, url: 'x', br: 798000, type: 'flac' }
      },
      noSleep
    )
    assert.equal(r.found, true)
    assert.equal(calls, 3)
  })

  test('风控重试耗尽后应降级到下一档', async () => {
    const seen: string[] = []
    const r = await resolveWithFallback(
      ['lossless', 'exhigh'],
      async (lv) => {
        seen.push(lv)
        if (lv === 'lossless') return { ok: false, code: -460, retryable: true }
        return { ok: true, url: 'y', br: 320000, type: 'mp3' }
      },
      noSleep
    )
    assert.equal(r.found, true)
    assert.equal(r.level, 'exhigh')
    // lossless 用满重试次数后换档
    const losslessCalls = seen.filter((s) => s === 'lossless').length
    assert.equal(losslessCalls, MAX_ATTEMPTS_PER_LEVEL)
  })

  test('不可重试错误无版权应立刻换档不浪费重试', async () => {
    const seen: string[] = []
    await resolveWithFallback(
      ['lossless', 'exhigh'],
      async (lv) => {
        seen.push(lv)
        if (lv === 'lossless') return { ok: false, code: -200, retryable: false }
        return { ok: true, url: 'z', br: 320000, type: 'mp3' }
      },
      noSleep
    )
    const losslessCalls = seen.filter((s) => s === 'lossless').length
    assert.equal(losslessCalls, 1, '无版权错误不应重试')
  })

  test('全部档位失败应返回 found=false 且 attempts 正确', async () => {
    const r = await resolveWithFallback(
      ['higher', 'standard'],
      async () => ({ ok: false, code: -460, retryable: true }),
      noSleep
    )
    assert.equal(r.found, false)
    assert.equal(r.attempts, MAX_ATTEMPTS_PER_LEVEL * 2)
    assert.ok(r.lastError)
  })

  test('fetchLevel 抛异常应被捕获并继续重试', async () => {
    let calls = 0
    const r = await resolveWithFallback(
      ['standard'],
      async () => {
        calls++
        if (calls < 2) throw new Error('网络中断')
        return { ok: true, url: 'ok', br: 128000, type: 'mp3' }
      },
      noSleep
    )
    assert.equal(r.found, true)
    assert.equal(calls, 2)
  })

  test('空降级链应直接返回失败', async () => {
    const r = await resolveWithFallback([], async () => ({ ok: true, url: 'x' }), noSleep)
    assert.equal(r.found, false)
    assert.equal(r.attempts, 0)
  })

  test('URL 缺失时不算成功（防止空链接通过）', async () => {
    const r = await resolveWithFallback(
      ['standard'],
      async () => ({ ok: true, url: '', br: 128000 }),
      noSleep
    )
    assert.equal(r.found, false)
  })
})
