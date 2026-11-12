// ---------------------------------------------------------------------------
// 音质解析核心逻辑（纯函数，无副作用，便于单元测试）
//
// 从 electron/main.ts 抽出：这部分是最容易出错、且与账号权益/风控强相关的逻辑，
// 必须可以在不启动 Electron、不联网的情况下被验证。
// ---------------------------------------------------------------------------

/** 请求音质 -> 允许回退的顺序（高到低） */
export type QualityLevel =
  | 'standard'
  | 'higher'
  | 'exhigh'
  | 'lossless'
  | 'hires'
  | 'jymaster'

export const QUALITY_CHAIN: Record<string, QualityLevel[]> = {
  jymaster: ['jymaster', 'hires', 'lossless', 'exhigh', 'higher', 'standard'],
  hires: ['hires', 'lossless', 'exhigh', 'higher', 'standard'],
  lossless: ['lossless', 'exhigh', 'higher', 'standard'],
  exhigh: ['exhigh', 'higher', 'standard'],
  higher: ['higher', 'standard'],
  standard: ['standard'],
}

/** 旧接口沿用 br 参数，需要把档位映射为码率 */
export function levelToBr(level: string): number {
  switch (level) {
    case 'standard':
      return 128000
    case 'higher':
      return 192000
    case 'exhigh':
      return 320000
    case 'lossless':
      return 999000
    case 'hires':
      return 1900000
    case 'jymaster':
      return 1999000
    default:
      return 320000
  }
}

/**
 * 依据接口返回的码率与格式，反推「真实」音质档位。
 *
 * 背景：网易云在账号无对应权益时会「静默降级」——仍然返回 code 200，
 * 但 br 只有 128000/320000 且 type 是 MP3。若不校验就会在 UI 上虚标「无损」。
 *
 * 判定规则：
 *  - 无损类档位（lossless/hires/jymaster）必须同时满足「无损格式」+「足够码率」
 *  - 否则按实际码率向下归位
 */
export function inferRealLevel(
  requested: string,
  br: number | string | null | undefined,
  type: string | null | undefined
): QualityLevel {
  const t = String(type || '').toLowerCase()
  const isFlacLike = t.includes('flac') || t.includes('ape') || t.includes('wav')
  const kbps = Math.round((Number(br) || 0) / 1000)

  if (requested === 'lossless' || requested === 'hires' || requested === 'jymaster') {
    if (isFlacLike && kbps >= 700) return requested as QualityLevel
    if (isFlacLike && kbps >= 500) return 'lossless'
    if (kbps >= 320) return 'exhigh'
    if (kbps >= 192) return 'higher'
    return 'standard'
  }

  if (requested === 'exhigh') {
    if (isFlacLike && kbps >= 700) return 'lossless'
    return kbps >= 300 ? 'exhigh' : kbps >= 180 ? 'higher' : 'standard'
  }

  if (requested === 'higher') {
    if (kbps >= 300) return 'exhigh'
    return kbps >= 180 ? 'higher' : 'standard'
  }

  // standard 及其它：若意外拿到高质量 FLAC，如实上报
  if (isFlacLike && kbps >= 700) return 'lossless'
  return 'standard'
}

/** 单个档位内的重试次数上限 */
export const MAX_ATTEMPTS_PER_LEVEL = 5

/** 网易云风控的错误码（可重试） */
export const RISK_CONTROL_CODES = [-460, -462]

export interface FetchOutcome {
  /** 该次请求是否拿到了可用链接 */
  ok: boolean
  br?: number
  type?: string
  size?: number
  url?: string
  /** 接口返回码 */
  code?: number
  /** 是否属于风控类错误（应重试） */
  retryable?: boolean
}

/**
 * 按「降级链 + 同档位重试」解析播放地址。
 *
 * @param order      降级顺序（默认取 QUALITY_CHAIN[wanted]）
 * @param fetchLevel 实际发起请求的函数（注入以便测试）
 * @param sleep      退避函数（注入以便测试，避免真等待）
 */
export async function resolveWithFallback(
  order: QualityLevel[],
  fetchLevel: (level: QualityLevel) => Promise<FetchOutcome>,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  random: () => number = Math.random
): Promise<{
  found: boolean
  level?: QualityLevel
  br?: number
  type?: string
  size?: number
  url?: string
  attempts: number
  lastError?: string
}> {
  let attempts = 0
  let lastError: string | undefined

  for (const level of order) {
    for (let i = 0; i < MAX_ATTEMPTS_PER_LEVEL; i++) {
      if (i > 0) await sleep(160 + random() * 240)
      attempts++

      let outcome: FetchOutcome
      try {
        outcome = await fetchLevel(level)
      } catch (e: any) {
        lastError = e?.message || '请求异常'
        continue
      }

      if (outcome.ok && outcome.url) {
        return {
          found: true,
          level,
          br: outcome.br,
          type: outcome.type,
          size: outcome.size,
          url: outcome.url,
          attempts,
        }
      }

      lastError = `level=${level} 无链接`

      // 非风控类错误（无版权 / 已下架）重试无意义，直接换下一档
      if (!outcome.retryable) break
    }
  }

  return { found: false, attempts, lastError }
}
