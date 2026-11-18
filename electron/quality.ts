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

/**
 * 单档位的取链策略：v1 接口失败后**总是**尝试旧接口兜底。
 *
 * ---------------------------------------------------------------------------
 * 为什么单独抽成纯函数：
 *   这里曾经写反 —— 只有「非风控」才走旧接口兜底，风控（-460）直接判失败。
 *   而实测恰恰相反：
 *     · v1 接口 /song/url/v1 命中风控时返回 -460
 *     · 同一首歌，旧接口 /song/url 在同一时刻返回 200 + 有效音频地址
 *   也就是说风控只针对 v1，旧接口正是最需要在风控时启用的兜底。
 *   这个错误靠读代码看不出来（逻辑"看起来"合理），只有实测才能发现，
 *   所以抽出来用测试锁住。
 *
 * @param fetchV1     调 v1 接口，返回 { ok, url?, br?, type?, size?, code? }
 * @param fetchLegacy 调旧接口，同上
 */
export async function fetchWithLegacyFallback(
  fetchV1: () => Promise<FetchOutcome & { code?: number }>,
  fetchLegacy: () => Promise<FetchOutcome & { code?: number }>
): Promise<FetchOutcome> {
  // 1) 先试 v1
  let v1: (FetchOutcome & { code?: number }) | null = null
  let v1Threw = false
  try {
    v1 = await fetchV1()
    if (v1.ok && v1.url) return v1
  } catch {
    v1Threw = true
  }

  // 2) v1 没拿到 -> 无论风控还是无版权，都试旧接口
  try {
    const legacy = await fetchLegacy()
    if (legacy.ok && legacy.url) return legacy
  } catch {
    /* 旧接口也异常，继续按 v1 的结果决定是否重试 */
  }

  // 3) 两者都失败：决定是否值得重试
  //    风控（-460/-462）或请求异常 -> 可重试（风控是随机命中的，重试有意义）
  //    无版权（其它 code）        -> 不可重试（重试只会浪费 5 次）
  const code = v1?.code
  const risk = v1Threw || code === -460 || code === -462
  return { ok: false, code, retryable: risk }
}
