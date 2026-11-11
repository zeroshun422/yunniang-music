import type { Song, Playlist, UserProfile, QualityLevel, LyricLine } from '@/types'

// ---------------------------------------------------------------------------
// 网易云接口封装
// 所有请求经由主进程转发（自动携带登录 Cookie），并做统一错误处理与重试
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  code: number
  needLogin: boolean
  constructor(msg: string, code = -1, needLogin = false) {
    super(msg)
    this.code = code
    this.needLogin = needLogin
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** 带重试的请求：-460(风控) / 网络错误自动退避重试 */
export async function api<T = any>(
  path: string,
  opts: { method?: string; body?: unknown; retries?: number } = {}
): Promise<T> {
  const retries = opts.retries ?? 3
  let lastMsg = ''
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await window.yun.ncm(path, { method: opts.method, body: opts.body })
    if (res && (res.code === 200 || res.code === 201)) return res as T

    // 需要登录
    if (res && (res.code === 301 || res.code === 302)) {
      throw new ApiError(res.msg || '需要登录', res.code, true)
    }
    // 风控 / 限流：退避后重试
    if (res && (res.code === -460 || res.code === -447 || res.code === -462)) {
      lastMsg = res.message || res.msg || '检测到网络环境存在风险'
      if (attempt < retries) { await sleep(400 * (attempt + 1)); continue }
    }
    // 网络层失败
    if (!res || res.code === -1) {
      lastMsg = (res && res.msg) || '网络请求失败'
      if (attempt < retries) { await sleep(300 * (attempt + 1)); continue }
    }
    // 其它错误直接返回数据，由调用方判断
    if (res) return res as T
    throw new ApiError(lastMsg || '请求失败', -1)
  }
  throw new ApiError(lastMsg || '请求失败（已重试）', -460)
}

// --------------------------- 登录 ---------------------------

/** 二维码 key */
export async function qrKey() {
  const r = await api<{ data: { unikey: string } }>('/login/qr/key')
  return r.data.unikey
}

/** 生成二维码图片（返回 base64 dataURL） */
export async function qrCreate(key: string) {
  const r = await api<{ data: { qrimg: string; qrurl: string } }>(
    `/login/qr/create?key=${key}&qrimg=true`
  )
  return r.data
}

/** 轮询二维码状态 800过期 801等待 802待确认 803成功 */
export async function qrCheck(key: string) {
  const r = await window.yun.ncm(`/login/qr/check?key=${key}&t=${Date.now()}`)
  return r as { code: number; message?: string; cookie?: string }
}

/** 手机号登录 */
export async function loginCellphone(phone: string, password: string, countrycode = '86') {
  const r = await window.yun.ncm(
    `/login/cellphone?phone=${encodeURIComponent(phone)}&password=${encodeURIComponent(
      password
    )}&countrycode=${countrycode}`,
    { method: 'POST' }
  )
  if (r.code === 200) {
    // 登录成功后拉取完整 cookie
    const st = await window.yun.ncm('/login/status')
    return { ...r, status: st }
  }
  return r
}

/** 邮箱登录 */
export async function loginEmail(email: string, password: string) {
  const r = await window.yun.ncm(
    `/login?email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`,
    { method: 'POST' }
  )
  return r
}

/** 纯 cookie 登录（二维码成功后） */
export async function loginByCookie(cookie: string) {
  const r = await window.yun.ncmWithCookie('/login/status', cookie)
  return r
}

/** 登录状态 */
export async function loginStatus() {
  const r = await window.yun.ncm('/login/status?t=' + Date.now())
  return r as { code?: number; data?: { code?: number; profile: UserProfile; account?: any } }
}

export async function logout() {
  await window.yun.ncm('/logout')
  await window.yun.clearCookie()
}

// --------------------------- 搜索 ---------------------------

export const SEARCH_TYPES = [
  { type: 1, label: '单曲' },
  { type: 1000, label: '歌单' },
  { type: 100, label: '歌手' },
  { type: 10, label: '专辑' },
  { type: 1002, label: '用户' },
  { type: 1009, label: '电台' },
  { type: 1004, label: 'MV' },
] as const

/**
 * 搜索（带回退链）
 * 网易云有两个搜索接口：
 *   - /cloudsearch：结果更准、更稳定，但部分分类字段结构不同
 *   - /search：老接口，容易被风控返回 405 / -460
 * 因此优先 cloudsearch，失败再退回 search，两者都失败才抛错。
 */
export async function search(keywords: string, type = 1, limit = 30, offset = 0) {
  const kw = encodeURIComponent(keywords)

  // 1) 优先 cloudsearch
  try {
    const r = await api<any>(`/cloudsearch?keywords=${kw}&type=${type}&limit=${limit}&offset=${offset}`, { retries: 2 })
    if (r && r.code === 200 && r.result) return r
  } catch (e) { /* 继续回退 */ }

  // 2) 回退 /search
  try {
    const r2 = await api<any>(`/search?keywords=${kw}&type=${type}&limit=${limit}&offset=${offset}`, { retries: 2 })
    if (r2 && r2.code === 200) return r2
    // 接口返回了非 200（如 405），抛出以便 UI 提示
    throw new ApiError(
      r2?.msg || r2?.message || `搜索接口暂不可用（code ${r2?.code}），请稍后重试`,
      r2?.code ?? -1
    )
  } catch (e: any) {
    if (e instanceof ApiError) throw e
    throw new ApiError('搜索失败：' + (e?.message || '未知错误'), -1)
  }
}

export async function searchSuggest(keywords: string) {
  return api<any>(`/search/suggest?keywords=${encodeURIComponent(keywords)}&type=mobile`)
}

export async function hotSearch() {
  return api<any>('/search/hot')
}

// --------------------------- 推荐 ---------------------------

/** 每日推荐歌曲 */
export async function recommendSongs() {
  const r = await api<{ data: { dailySongs: Song[]; recommendReasons?: any[] } }>('/recommend/songs')
  return r.data.dailySongs || []
}

/** 每日推荐歌单 */
export async function recommendResource() {
  const r = await api<{ recommend: Playlist[] }>('/recommend/resource')
  return r.recommend || []
}

/** 私人雷达（官方固定歌单 id 3136952023） */
export const RADAR_PLAYLIST_ID = 3136952023
export async function privateRadar() {
  const r = await api<{ playlist: Playlist }>(`/playlist/detail?id=${RADAR_PLAYLIST_ID}&s=0`)
  const pl = r.playlist
  if (!pl) throw new ApiError('私人雷达暂不可用（需登录且账号需有一定听歌记录）', 404, true)
  // 雷达歌单 tracks 可能为空，需要单独拉
  if (!pl.tracks || pl.tracks.length === 0) {
    const t = await api<{ songs: Song[] }>(
      `/playlist/track/all?id=${RADAR_PLAYLIST_ID}&limit=60`
    )
    pl.tracks = t.songs || []
  }
  return pl
}

/** 心动模式：基于某首歌 + 歌单智能推荐 */
export async function heartMode(songId: number, playlistId: number, count = 20) {
  const r = await api<any>(
    `/playmode/intelligence/list?id=${songId}&pid=${playlistId}&sid=${songId}&count=${count}`
  )
  return (r.data || []) as any[]
}

/** 私人漫游 / 私人FM */
export async function personalFm() {
  const r = await api<{ data: Song[] }>('/personal_fm?timestamp=' + Date.now())
  return r.data || []
}

/** 漫游模式切换：aidj / DEFAULT / FAMILIAR / EXPLORE / SCENE_RCMD */
export async function personalFmMode(mode: string, limit = 3) {
  const r = await api<{ data: Song[] }>(`/personal/fm/mode?mode=${mode}&limit=${limit}`)
  return r.data || []
}

/** 不感兴趣 */
export async function fmTrash(id: number) {
  return api(`/fm_trash?id=${id}&timestamp=${Date.now()}`)
}

// --------------------------- 歌单 ---------------------------

/** 歌单广场分类 */
export async function playlistCatlist() {
  const r = await api<{ sub: any[] }>('/playlist/catlist')
  return r.sub || []
}

export async function playlistHighqualityTags() {
  return api<any>('/playlist/highquality/tags')
}

/** 歌单广场：按分类/排序拉取 */
export async function topPlaylist(cat = '全部', order = 'hot', limit = 30, offset = 0) {
  const r = await api<{ playlists: Playlist[]; more: boolean }>(
    `/top/playlist?cat=${encodeURIComponent(cat)}&order=${order}&limit=${limit}&offset=${offset}`
  )
  return r.playlists || []
}

/** 精品歌单 */
export async function highqualityPlaylist(cat = '全部', limit = 20) {
  const r = await api<{ playlists: Playlist[] }>(
    `/top/playlist/highquality?cat=${encodeURIComponent(cat)}&limit=${limit}`
  )
  return r.playlists || []
}

export async function playlistDetail(id: number) {
  const r = await api<{ playlist: Playlist }>(`/playlist/detail?id=${id}`)
  return r.playlist
}

export async function playlistTrackAll(id: number, limit = 1000) {
  const r = await api<{ songs: Song[] }>(`/playlist/track/all?id=${id}&limit=${limit}`)
  return r.songs || []
}

/** 收藏/取消收藏歌单 */
export async function subscribePlaylist(id: number, subscribe: boolean) {
  return api(`/playlist/subscribe?t=${subscribe ? 1 : 2}&id=${id}&timestamp=${Date.now()}`)
}

// --------------------------- 排行榜 ---------------------------

export async function toplist() {
  const r = await api<{ list: any[] }>('/toplist')
  // 过滤掉非官方榜单（歌曲数 0 的空榜单）
  return (r.list || []).filter((x) => x.name)
}

export async function toplistDetail(id: number) {
  const r = await api<any>(`/playlist/detail?id=${id}`)
  return r.playlist
}

// --------------------------- 歌手 ---------------------------

/** 歌手详情（含简介、粉丝数） */
export async function artistDetail(id: number) {
  const r = await api<{ data: { artist: any; user?: any } }>(`/artist/detail?id=${id}`)
  return r.data?.artist || null
}

/** 歌手热门歌曲（最多 50 首） */
export async function artistTopSongs(id: number) {
  const r = await api<{ songs: Song[] }>(`/artist/top/song?id=${id}`)
  return r.songs || []
}

/** 歌手全部歌曲（分页） */
export async function artistSongs(id: number, limit = 50, offset = 0, order = 'hot') {
  const r = await api<{ songs: Song[]; more?: boolean; total?: number }>(
    `/artist/songs?id=${id}&limit=${limit}&offset=${offset}&order=${order}`
  )
  return { songs: r.songs || [], more: !!r.more, total: r.total || 0 }
}

/** 歌手专辑 */
export async function artistAlbums(id: number, limit = 30, offset = 0) {
  const r = await api<{ hotAlbums: any[]; more?: boolean }>(
    `/artist/album?id=${id}&limit=${limit}&offset=${offset}`
  )
  return r.hotAlbums || []
}

// --------------------------- 用户音乐库 ---------------------------

/** 我喜欢的音乐（用 likelist 拿全部 id，再批量取详情） */
export async function likeList(uid: number) {
  const r = await api<{ ids: number[] }>(`/likelist?uid=${uid}&timestamp=${Date.now()}`)
  return r.ids || []
}

export async function songDetail(ids: number[]) {
  if (!ids.length) return []
  // 分批，避免 URL 过长
  const chunks: number[][] = []
  for (let i = 0; i < ids.length; i += 200) chunks.push(ids.slice(i, i + 200))
  const all: Song[] = []
  for (const c of chunks) {
    const r = await api<{ songs: Song[] }>(`/song/detail?ids=${c.join(',')}`)
    all.push(...(r.songs || []))
  }
  return all
}

export async function likeSong(id: number, like: boolean) {
  return api(`/like?id=${id}&like=${like}&timestamp=${Date.now()}`, { method: 'POST' })
}

/** 收藏的歌单 */
export async function userSubscribedPlaylists(uid: number, limit = 100, offset = 0) {
  const r = await api<{ playlist: Playlist[] }>(
    `/user/playlist?uid=${uid}&limit=${limit}&offset=${offset}`
  )
  return r.playlist || []
}

/** 创建的歌单（从 user/playlist 里筛出自己创建的） */
export async function userCreatedPlaylists(uid: number) {
  const all = await userSubscribedPlaylists(uid, 1000, 0)
  return all.filter((p) => p.creator?.userId === uid)
}

export async function userPlaylistSubscribers(uid: number) {
  return userSubscribedPlaylists(uid)
}

/**
 * 获取「我喜欢的音乐」完整数据（含添加时间）。
 * 关键：playlist/detail 的 tracks 会被截断到 1000 首，
 * 但 trackIds 是完整的，且每项带 at（添加时间戳）。
 * 因此用 trackIds 作为主数据源，tracks 仅用于补齐歌曲详情。
 */
export async function likePlaylistWithTime(uid: number) {
  // 1. 找到「我喜欢的音乐」特殊歌单（specialType === 5）
  const pls = await userSubscribedPlaylists(uid, 1000, 0)
  const likePl = (pls || []).find((p: any) => p.specialType === 5)
  if (!likePl) throw new ApiError('未找到「我喜欢的音乐」歌单', 404, true)

  // 2. 拉取详情拿 trackIds（完整 + 含添加时间）
  const r = await api<any>(`/playlist/detail?id=${likePl.id}&s=8`)
  const trackIds: any[] = r?.playlist?.trackIds || []
  const tracks: Song[] = r?.playlist?.tracks || []

  // 3. 建立 id -> 歌曲 映射（tracks 可能不含全部歌曲）
  const byId = new Map<number, Song>()
  for (const t of tracks) byId.set(t.id, t)

  const ids = trackIds.map((x) => x.id).filter((x) => typeof x === 'number')
  const atMap = new Map<number, number>()
  for (const x of trackIds) {
    if (typeof x.id === 'number' && typeof x.at === 'number') atMap.set(x.id, x.at)
  }

  // 4. 补齐 tracks 里缺失的歌曲详情
  const missing = ids.filter((id) => !byId.has(id))
  if (missing.length) {
    for (let i = 0; i < missing.length; i += 200) {
      const chunk = missing.slice(i, i + 200)
      try {
        const d = await api<{ songs: Song[] }>(`/song/detail?ids=${chunk.join(',')}`)
        for (const s of d.songs || []) byId.set(s.id, s)
      } catch (e) { /* 单批失败不影响整体 */ }
    }
  }

  // 5. 按喜欢时间倒序组装（最近喜欢的在前）
  const ordered: { song: Song; at: number }[] = []
  for (const id of ids) {
    const song = byId.get(id)
    if (song) ordered.push({ song, at: atMap.get(id) || 0 })
  }
  ordered.sort((a, b) => b.at - a.at)

  return {
    playlist: likePl,
    items: ordered,                                  // [{ song, at }]
    songs: ordered.map((x) => x.song!),              // 纯歌曲数组
    total: ids.length,
  }
}

// --------------------------- 听歌排行 ---------------------------

export interface PlayRecordItem {
  song: Song
  playCount: number
  score?: number
}

/**
 * 获取用户听歌排行。
 * @param uid 用户 id
 * @param range 'week' 最近一周 | 'all' 全部时间
 */
export async function userPlayRecord(uid: number, range: 'week' | 'all' = 'week'): Promise<PlayRecordItem[]> {
  const type = range === 'week' ? 1 : 0
  const r = await api<any>(`/user/record?uid=${uid}&type=${type}&timestamp=${Date.now()}`)
  const raw: any[] = (type === 1 ? r.weekData : r.allData) || r.allData || r.weekData || []
  return raw
    .filter((x) => x && x.song && typeof x.song.id === 'number')
    .map((x) => ({
      song: x.song as Song,
      playCount: typeof x.playCount === 'number' ? x.playCount : 0,
      score: x.score,
    }))
}

/**
 * 从听歌排行中「抽取」一首近期播放次数较高的歌作为种子。
 *
 * 策略：加权随机，而不是永远取第一名。
 *   - 只考虑播放次数 >= max(1, 最高次数 * 0.3) 的候选，保证确实是「近期常听」
 *   - 权重 = playCount，播放越多越容易被抽中，但每次结果可能不同
 *   - 允许排除上次选中的歌曲，避免连续两次抽到同一首
 */
export function pickSeedFromRecords(
  records: PlayRecordItem[],
  excludeId?: number
): PlayRecordItem | null {
  if (!records.length) return null

  const usable = records.filter((r) => r.song && typeof r.song.id === 'number')
  if (!usable.length) return null

  const maxCount = Math.max(...usable.map((r) => r.playCount), 1)
  // 至少达到最高播放量的 30%，滤掉偶然听过一次的歌
  const threshold = Math.max(1, maxCount * 0.3)
  let pool = usable.filter((r) => r.playCount >= threshold && r.song.id !== excludeId)
  // 排除后为空则放宽
  if (!pool.length) pool = usable.filter((r) => r.song.id !== excludeId)
  if (!pool.length) pool = usable

  const totalWeight = pool.reduce((sum, r) => sum + Math.max(1, r.playCount), 0)
  let target = Math.random() * totalWeight
  for (const item of pool) {
    target -= Math.max(1, item.playCount)
    if (target <= 0) return item
  }
  return pool[pool.length - 1]
}

// --------------------------- 音乐云盘 ---------------------------

export async function cloudList(limit = 200, offset = 0) {
  const r = await api<any>(`/user/cloud?limit=${limit}&offset=${offset}&timestamp=${Date.now()}`)
  return { data: (r.data || []) as any[], count: r.count || 0, size: r.size || 0 }
}

export async function cloudDetail(id: number) {
  const r = await api<{ data: Song[] }>(`/user/cloud/detail?id=${id}`)
  return r.data || []
}

export async function cloudDelete(id: number) {
  return api(`/user/cloud/del?id=${id}`)
}

export async function cloudSearch(keywords: string, limit = 30) {
  const r = await api<any>(`/cloudsearch?keywords=${encodeURIComponent(keywords)}&limit=${limit}`)
  return r.result || {}
}

// --------------------------- 歌词 ---------------------------

/** 解析 LRC 时间轴 */
export function parseLrc(lrc: string): LyricLine[] {
  if (!lrc) return []
  const lines = lrc.split('\n')
  const out: LyricLine[] = []
  const re = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g
  for (const raw of lines) {
    let m
    const times: number[] = []
    re.lastIndex = 0
    while ((m = re.exec(raw)) !== null) {
      const min = parseInt(m[1], 10)
      const sec = parseInt(m[2], 10)
      const frac = m[3] ? parseInt(m[3].padEnd(3, '0'), 10) : 0
      times.push(min * 60 + sec + frac / 1000)
    }
    const text = raw.replace(/\[[^\]]*\]/g, '').trim()
    if (!text) continue
    for (const t of times) out.push({ time: t, text })
  }
  return out.sort((a, b) => a.time - b.time)
}

export async function lyric(id: number) {
  const r = await api<any>(`/lyric?id=${id}&timestamp=${Date.now()}`)
  const main = parseLrc(r.lrc?.lyric || '')
  const trans = parseLrc(r.tlyric?.lyric || '')
  const trMap = new Map<number, string>()
  // 翻译按时间近似匹配（±0.3s）
  for (const t of trans) {
    for (const m of main) {
      if (Math.abs(m.time - t.time) < 0.35) { trMap.set(m.time, t.text); break }
    }
  }
  return {
    lines: main.map((l) => ({ ...l, trans: trMap.get(l.time) })),
    raw: r.lrc?.lyric || '',
    hasTrans: trans.length > 0,
  }
}

// --------------------------- 音频 ---------------------------

export async function musicUrl(id: number, level: QualityLevel) {
  return api<any>(`/song/url/v1?id=${id}&level=${level}&encodeType=flac`)
}

export function proxyAudioUrl(id: number, level: QualityLevel) {
  return `/__audio__?id=${id}&level=${level}`
}

export async function probeAudio(id: number, level: QualityLevel) {
  return window.yun.probeAudio(id, level)
}

/**
 * 统一读取歌单播放量。
 * 网易云各接口字段大小写不一致：
 *   - /recommend/resource -> playcount （全小写）
 *   - /top/playlist、/playlist/detail -> playCount （驼峰）
 */
export function getPlayCount(pl: any): number {
  if (!pl) return 0
  const v = pl.playCount ?? pl.playcount ?? pl.listenerCount ?? 0
  return typeof v === 'number' && v > 0 ? v : 0
}

export function coverUrl(url: string | undefined | null, size = 300) {
  if (!url || typeof url !== 'string') return ''
  const clean = url.replace(/\?.*$/, '')
  if (!clean) return ''
  return clean + `?param=${size}y${size}`
}

/**
 * 从「任意网易云歌曲/歌单对象」中提取封面地址。
 * 不同接口的字段结构差异很大，必须逐个兜底：
 *   - /song/detail      -> song.al.picUrl
 *   - /personal_fm      -> song.album.picUrl
 *   - /personalized/newsong -> item.picUrl（顶层）
 *   - /search           -> song.al.picUrl 或 song.album.picUrl（可能为空）
 *   - 歌单               -> playlist.coverImgUrl / playlist.picUrl
 */
export function songCoverUrl(song: any, size = 300): string {
  if (!song) return ''
  const candidates = [
    song.al?.picUrl,
    song.album?.picUrl,
    song.picUrl,
    song.simpleSong?.al?.picUrl,
    song.simpleSong?.album?.picUrl,
    song.song?.al?.picUrl,
    song.songInfo?.al?.picUrl,
    song.coverImgUrl,
  ]
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return coverUrl(c, size)
  }
  return ''
}

export function formatDuration(ms: number | undefined) {
  if (!ms || ms < 0) return '00:00'
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const ss = s % 60
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

export function formatCount(n: number | undefined) {
  if (!n) return '0'
  if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿'
  if (n >= 10000) return (n / 10000).toFixed(1) + '万'
  return String(n)
}
