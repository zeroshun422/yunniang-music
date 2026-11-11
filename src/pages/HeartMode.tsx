import React, { useEffect, useState } from 'react'
import * as ncm from '@/api/ncm'
import type { Song, Playlist } from '@/types'
import { useAuth } from '@/store/auth'
import { usePlayer } from '@/store/player'
import { useLibrary } from '@/store/library'
import { useSongMenu } from '@/components/SongContextMenu'
import {
  IconPlay,
  IconSearch,
  IconHeart,
  IconHeartMode,
  IconClose,
  IconPlus,
  IconShuffle,
} from '@/components/Icons'

// ---------------------------------------------------------------------------
// 数据归一化
// 心动模式接口返回的每项可能是 { songInfo } / { song } / 直接是 song，
// 搜索结果又是旧字段（artists/album/duration），这里统一收敛成 Song。
// ---------------------------------------------------------------------------
function normalizeSong(raw: any): Song | null {
  if (!raw || typeof raw.id !== 'number') return null
  const artists = raw.ar || raw.artists || []
  const album = raw.al || raw.album || { id: 0, name: '' }
  return {
    id: raw.id,
    name: raw.name || '未知歌曲',
    ar: artists,
    al: album,
    dt: raw.dt || raw.duration || 0,
    fee: raw.fee,
    mv: raw.mv,
  }
}

interface HeartEntry {
  song: Song
  reason?: string
}

/** 兼容三种返回结构，并按 id 去重 */
function parseHeartData(data: any[]): HeartEntry[] {
  const out: HeartEntry[] = []
  const seen = new Set<number>()
  for (const item of data || []) {
    const raw = item?.songInfo || item?.song || item
    const song = normalizeSong(raw)
    if (!song || seen.has(song.id)) continue
    seen.add(song.id)
    const r = item?.reason ?? item?.recommendReason ?? item?.alg ?? null
    out.push({ song, reason: typeof r === 'string' && r.trim() ? r.trim() : undefined })
  }
  return out
}

function artistText(song: Song): string {
  return (song.ar || song.artists || []).map((a) => a.name).join(' / ') || '未知歌手'
}

// ---------------------------------------------------------------------------
// 一行心动推荐（需要在歌曲名下展示推荐理由，所以不用通用 SongList）
// ---------------------------------------------------------------------------
function HeartRow({
  entry,
  index,
  current,
  liked,
  onPlay,
  onLike,
  onQueue,
  onMenu,
}: {
  entry: HeartEntry
  index: number
  current: boolean
  liked: boolean
  onPlay: () => void
  onLike: () => void
  onQueue: () => void
  onMenu: (e: React.MouseEvent) => void
}) {
  const { song, reason } = entry
  return (
    <div
      className="row"
      onDoubleClick={onPlay}
      onContextMenu={(e) => {
        e.preventDefault()
        onMenu(e)
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-2)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      style={{
        height: 58,
        padding: '0 10px',
        borderRadius: 8,
        gap: 12,
        color: current ? 'var(--accent)' : 'var(--text-1)',
        cursor: 'default',
        transition: 'background 0.1s',
      }}
    >
      <div
        onClick={onPlay}
        style={{
          width: 24,
          textAlign: 'center',
          fontSize: 12.5,
          color: 'var(--text-3)',
          fontVariantNumeric: 'tabular-nums',
          cursor: 'pointer',
        }}
      >
        {String(index + 1).padStart(2, '0')}
      </div>

      <img
        src={ncm.songCoverUrl(song, 80)}
        alt=""
        onClick={onPlay}
        style={{
          width: 40,
          height: 40,
          borderRadius: 6,
          objectFit: 'cover',
          background: 'var(--bg-3)',
          flex: '0 0 auto',
          cursor: 'pointer',
        }}
      />

      <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={onPlay}>
        <div
          className="text-ellipsis"
          style={{
            fontSize: 13.5,
            color: current ? 'var(--accent)' : 'var(--text-0)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {song.name}
          {song.fee === 1 && <span className="song-tag">VIP</span>}
        </div>
        <div
          className="text-ellipsis"
          style={{ fontSize: 12, color: 'var(--text-2)', display: 'flex', gap: 8 }}
        >
          <span className="text-ellipsis">{artistText(song)}</span>
          {reason && (
            <span
              className="text-ellipsis"
              style={{ color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              · {reason}
            </span>
          )}
        </div>
      </div>

      <div
        style={{
          width: 52,
          textAlign: 'right',
          fontSize: 12.5,
          color: 'var(--text-3)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {ncm.formatDuration(song.dt)}
      </div>

      <div className="row" style={{ gap: 4, flex: '0 0 auto' }}>
        <button
          className={`song-action-btn ${liked ? 'liked' : ''}`}
          title={liked ? '取消喜欢' : '喜欢'}
          onClick={(e) => {
            e.stopPropagation()
            onLike()
          }}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <IconHeart size={14} filled={liked} />
        </button>
        <button
          className="song-action-btn"
          title="加入播放队列"
          onClick={(e) => {
            e.stopPropagation()
            onQueue()
          }}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <IconPlus size={14} />
        </button>
      </div>
    </div>
  )
}

export function HeartModePage() {
  const { user } = useAuth()
  const { playQueue, addToQueue, queue, currentIndex } = usePlayer()
  const { likedIds, toggleLike } = useLibrary()

  // 种子搜索
  const [kw, setKw] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<Song[]>([])
  const [searchErr, setSearchErr] = useState<string | null>(null)
  const [seed, setSeed] = useState<Song | null>(null)
  // 近期常听（用于「随机抽一首」）
  const [recLoading, setRecLoading] = useState(false)
  const [records, setRecords] = useState<ncm.PlayRecordItem[]>([])
  const [recErr, setRecErr] = useState<string | null>(null)
  const [recRange, setRecRange] = useState<'week' | 'all'>('week')

  // 歌单选择
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [plLoading, setPlLoading] = useState(true)
  const [plError, setPlError] = useState<string | null>(null)
  // 注意：/playmode/intelligence/list 只接受「用户自己的歌单」，
  // 传入私人雷达等官方歌单会返回 400「不支持该歌单类型」。
  // 因此默认值用 0 表示未选择，加载完用户歌单后自动选中第一个。
  const [playlistId, setPlaylistId] = useState<number>(0)

  // 生成结果
  const [entries, setEntries] = useState<HeartEntry[]>([])
  const [genLoading, setGenLoading] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const [generated, setGenerated] = useState(false)

  useEffect(() => {
    loadPlaylists()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.userId])

  async function loadPlaylists() {
    setPlLoading(true)
    setPlError(null)
    if (!user) {
      setPlaylists([])
      setPlLoading(false)
      return
    }
    try {
      const all = await ncm.userSubscribedPlaylists(user.userId, 100, 0)
      // 过滤掉无 id 的异常项，取前 8 个供选择
      const usable = (all || []).filter((p) => p && typeof p.id === 'number').slice(0, 8)
      setPlaylists(usable)
      // 自动选中第一个用户歌单（接口只支持用户自己的歌单）
      if (usable.length > 0) {
        setPlaylistId((cur) => (cur && usable.some((p) => p.id === cur) ? cur : usable[0].id))
      }
    } catch (e: any) {
      setPlaylists([])
      setPlError((e && e.message) || '收藏歌单加载失败')
    } finally {
      setPlLoading(false)
    }
  }

  // 从「近期播放次数较高」的歌曲中抽取种子
  async function drawRecentSeed() {
    if (!user?.userId) {
      setRecErr('请先登录，才能读取你的听歌排行')
      return
    }
    setRecLoading(true)
    setRecErr(null)
    try {
      const list = records.length ? records : await ncm.userPlayRecord(user.userId, recRange)
      if (!records.length) setRecords(list)
      if (!list.length) {
        setRecErr(recRange === 'week'
          ? '最近一周没有听歌记录，试试切换到「全部时间」'
          : '还没有听歌记录')
        return
      }
      const picked = ncm.pickSeedFromRecords(list, seed?.id)
      if (picked) {
        setSeed(picked.song)
        setSearchResults([])
        setSearchErr(null)
        setGenerated(false)
        setEntries([])
      }
    } catch (e: any) {
      setRecErr(e?.message || '读取听歌排行失败')
    } finally {
      setRecLoading(false)
    }
  }

  // 切换统计范围后重新拉取
  async function changeRange(r: 'week' | 'all') {
    setRecRange(r)
    setRecords([])
    setRecErr(null)
    if (!user?.userId) return
    setRecLoading(true)
    try {
      const list = await ncm.userPlayRecord(user.userId, r)
      setRecords(list)
    } catch (e: any) {
      setRecErr(e?.message || '读取听歌排行失败')
    } finally {
      setRecLoading(false)
    }
  }

  async function doSearch() {
    const key = kw.trim()
    if (!key || searching) return
    setSearching(true)
    setSearchErr(null)
    setSearchResults([])
    try {
      const r = await ncm.search(key, 1, 10)
      const rawSongs: any[] = (r && r.result && r.result.songs) || []
      const list: Song[] = []
      const seen = new Set<number>()
      for (const raw of rawSongs) {
        const s = normalizeSong(raw)
        if (!s || seen.has(s.id)) continue
        seen.add(s.id)
        list.push(s)
      }
      setSearchResults(list)
    } catch (e: any) {
      setSearchErr((e && e.message) || '搜索失败')
    } finally {
      setSearching(false)
    }
  }

  function chooseSeed(s: Song) {
    setSeed(s)
    setSearchResults([])
    setKw('')
    setEntries([])
    setGenerated(false)
    setGenError(null)
  }

  async function generate() {
    if (!seed || genLoading) return
    setGenLoading(true)
    setGenError(null)
    setEntries([])
    setGenerated(false)
    try {
      if (!playlistId) {
        setGenError('请先选择一个你自己的歌单作为推荐参考（心动模式不支持官方歌单）')
        setGenLoading(false)
        return
      }
      const data = await ncm.heartMode(seed.id, playlistId, 20)
      const list = parseHeartData(Array.isArray(data) ? data : [])
      if (!list.length) {
        setGenError('没有找到合适的相似歌曲，换一首种子歌曲或换一个歌单试试')
      } else {
        setEntries(list)
      }
      setGenerated(true)
    } catch (e: any) {
      setGenerated(true)
      setGenError(
        e && e.needLogin
          ? '心动模式需要登录后才能使用，请先在「设置」中登录'
          : (e && e.message) || '心动模式暂不可用'
      )
    } finally {
      setGenLoading(false)
    }
  }

  const songs = entries.map((e) => e.song)
  const currentId = queue[currentIndex]?.id
  const showMenu = (e: React.MouseEvent, song: Song) =>
    useSongMenu.getState().show(e.clientX, e.clientY, song)
  const playlistName =
    playlists.find((p) => p.id === playlistId)?.name || '所选歌单'

  // -------------------------------------------------------------------------
  // 初始加载（收藏歌单）
  // -------------------------------------------------------------------------
  if (plLoading) {
    return (
      <div className="content-scroll">
        <div className="loading-wrap">
          <div className="spinner" />
          <div>正在准备心动模式…</div>
        </div>
      </div>
    )
  }

  return (
    <div className="content-scroll">
      <div className="page-header">
        <h1 className="page-title">心动模式</h1>
        <span className="page-sub">选一首种子歌曲，云娘顺着你的口味接着往下推荐</span>
      </div>

      {!user && (
        <div className="notice-box" style={{ marginBottom: 18 }}>
          心动模式需要登录网易云账号才能使用，请先在「设置」中登录。
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* 第 1 步：选择种子歌曲                                             */}
      {/* ---------------------------------------------------------------- */}
      <div className="section-title">
        <span
          style={{
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: 'var(--accent-soft)',
            color: 'var(--accent)',
            fontSize: 11,
            display: 'grid',
            placeItems: 'center',
          }}
        >
          1
        </span>
        选择种子歌曲
      </div>

      <div className="toolbar" style={{ marginBottom: 12 }}>
        <div className="search-input-wrap" style={{ flex: '1 1 320px', maxWidth: 460 }}>
          <IconSearch size={16} />
          <input
            value={kw}
            placeholder="搜索一首歌作为种子，例如：夜曲"
            onChange={(e) => setKw(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') doSearch()
            }}
          />
          {kw && (
            <button
              title="清空"
              onClick={() => {
                setKw('')
                setSearchResults([])
                setSearchErr(null)
              }}
              style={{ color: 'var(--text-3)', display: 'grid', placeItems: 'center' }}
            >
              <IconClose size={14} />
            </button>
          )}
        </div>
        <button className="btn primary" onClick={doSearch} disabled={!kw.trim() || searching}>
          {searching ? '搜索中…' : '搜索'}
        </button>

        <button
          className="btn ghost"
          onClick={drawRecentSeed}
          disabled={recLoading || !user}
          title={user ? '从你近期播放次数较高的歌曲中随机抽取一首' : '登录后可用'}
        >
          <IconShuffle size={14} />
          {recLoading ? '读取中…' : '抽一首近期常听'}
        </button>
      </div>

      {/* 近期常听的范围切换 */}
      <div className="row" style={{ gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <span className="small muted">听歌排行范围：</span>
        <button
          className={`chip ${recRange === 'week' ? 'active' : ''}`}
          style={{ padding: '3px 11px', fontSize: 11.5 }}
          onClick={() => changeRange('week')}
          disabled={recLoading}
        >
          最近一周
        </button>
        <button
          className={`chip ${recRange === 'all' ? 'active' : ''}`}
          style={{ padding: '3px 11px', fontSize: 11.5 }}
          onClick={() => changeRange('all')}
          disabled={recLoading}
        >
          全部时间
        </button>
        {records.length > 0 && (
          <span className="small muted">· 共 {records.length} 首候选</span>
        )}
      </div>

      {recErr && <div className="notice-box" style={{ marginBottom: 12 }}>{recErr}</div>}

      {searchErr && <div className="error-box">{searchErr}</div>}

      {searching && (
        <div className="loading-wrap" style={{ padding: '24px 0' }}>
          <div className="spinner" />
          <div>正在搜索…</div>
        </div>
      )}

      {!searching && searchResults.length > 0 && (
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: 6,
            marginBottom: 18,
            maxHeight: 320,
            overflowY: 'auto',
            background: 'var(--bg-1)',
          }}
        >
          {searchResults.map((s) => (
            <div
              key={s.id}
              className="row"
              onClick={() => chooseSeed(s)}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-2)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              style={{ height: 46, padding: '0 10px', borderRadius: 6, gap: 12, cursor: 'pointer' }}
            >
              <img
                src={ncm.songCoverUrl(s, 60)}
                alt=""
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 4,
                  objectFit: 'cover',
                  background: 'var(--bg-3)',
                  flex: '0 0 auto',
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="text-ellipsis" style={{ fontSize: 13, color: 'var(--text-0)' }}>
                  {s.name}
                </div>
                <div className="text-ellipsis small" style={{ color: 'var(--text-2)' }}>
                  {artistText(s)}
                  {s.al?.name ? ` · ${s.al.name}` : ''}
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                {ncm.formatDuration(s.dt)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 已选种子 */}
      {seed && (
        <div
          className="row"
          style={{
            gap: 14,
            padding: '11px 14px',
            borderRadius: 'var(--radius)',
            background: 'var(--bg-2)',
            border: '1px solid var(--border-light)',
            marginBottom: 22,
          }}
        >
          <img
            src={ncm.songCoverUrl(seed, 80)}
            alt=""
            style={{
              width: 44,
              height: 44,
              borderRadius: 6,
              objectFit: 'cover',
              background: 'var(--bg-3)',
              flex: '0 0 auto',
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="text-ellipsis" style={{ fontSize: 13.5, color: 'var(--text-0)' }}>
              {seed.name}
            </div>
            <div className="text-ellipsis small" style={{ color: 'var(--text-2)' }}>
              {artistText(seed)}
            </div>
          </div>
          <span className="small muted" style={{ flex: '0 0 auto' }}>当前种子</span>
          <button
            className="btn sm ghost"
            title="取消选择"
            onClick={() => {
              setSeed(null)
              setEntries([])
              setGenerated(false)
              setGenError(null)
            }}
          >
            取消
          </button>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* 第 2 步：选择参考歌单                                             */}
      {/* ---------------------------------------------------------------- */}
      <div className="section-title" style={{ marginTop: seed ? 0 : 10 }}>
        <span
          style={{
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: 'var(--accent-soft)',
            color: 'var(--accent)',
            fontSize: 11,
            display: 'grid',
            placeItems: 'center',
          }}
        >
          2
        </span>
        选择参考歌单
        <span className="more" style={{ cursor: 'default' }}>决定推荐的方向</span>
      </div>

      {plError && (
        <div className="error-box">
          {plError}
          <button className="btn sm" style={{ marginLeft: 10 }} onClick={loadPlaylists}>
            重试
          </button>
        </div>
      )}

      <div className="tabs" style={{ marginBottom: 20 }}>
        {playlists.map((p) => (
          <button
            key={p.id}
            className={`chip ${playlistId === p.id ? 'active' : ''}`}
            onClick={() => setPlaylistId(p.id)}
            title={p.name}
          >
            {p.name}
          </button>
        ))}
      </div>

      {playlists.length === 0 && !plError && (
        <div className="small muted" style={{ marginBottom: 18 }}>
          没有读取到你的歌单。心动模式需要至少一个「你自己创建的或收藏的歌单」作为推荐参考。
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* 第 3 步：生成                                                   */}
      {/* ---------------------------------------------------------------- */}
      <div className="row" style={{ gap: 12, marginBottom: 22 }}>
        <button className="btn primary" onClick={generate} disabled={!seed || genLoading}>
          <IconHeartMode size={14} />
          <span style={{ marginLeft: 6 }}>{genLoading ? '生成中…' : '生成心动推荐'}</span>
        </button>
        <span className="small muted">
          {seed ? `种子「${seed.name}」+ ${playlistName}` : '请先选择种子歌曲'}
        </span>
      </div>

      {genLoading && (
        <div className="loading-wrap">
          <div className="spinner" />
          <div>正在为你生成心动歌单…</div>
        </div>
      )}

      {!genLoading && genError && (
        <>
          <div className="error-box">{genError}</div>
          <button className="btn" onClick={generate}>重试</button>
        </>
      )}

      {!genLoading && !genError && generated && entries.length === 0 && (
        <div className="empty">
          <div className="empty-icon">
            <IconHeartMode size={34} />
          </div>
          没有生成推荐，换一首种子歌曲试试
        </div>
      )}

      {!genLoading && entries.length > 0 && (
        <>
          <div className="row-between" style={{ marginBottom: 10 }}>
            <div className="section-title" style={{ marginBottom: 0 }}>
              心动推荐
              <span className="small muted" style={{ fontWeight: 400 }}>
                共 {entries.length} 首
              </span>
            </div>
            <div className="row" style={{ gap: 10 }}>
              <button className="btn sm primary" onClick={() => playQueue(songs, 0)}>
                <IconPlay size={12} />
                <span style={{ marginLeft: 5 }}>播放全部</span>
              </button>
              <button className="btn sm ghost" onClick={generate}>
                重新生成
              </button>
            </div>
          </div>

          <div>
            {entries.map((entry, i) => (
              <HeartRow
                key={`${entry.song.id}-${i}`}
                entry={entry}
                index={i}
                current={entry.song.id === currentId}
                liked={likedIds.has(entry.song.id)}
                onPlay={() => playQueue(songs, i)}
                onLike={() => toggleLike(entry.song.id).catch(() => {})}
                onQueue={() => addToQueue(entry.song)}
                onMenu={(e) => showMenu(e, entry.song)}
              />
            ))}
          </div>
        </>
      )}

      {!genLoading && !generated && !genError && !seed && (
        <div className="empty">
          <div className="empty-icon">
            <IconHeart size={34} filled={false} />
          </div>
          选一首种子歌曲，开启心动模式
        </div>
      )}
    </div>
  )
}
