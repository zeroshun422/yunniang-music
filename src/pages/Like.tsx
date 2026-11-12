import React, { useEffect, useMemo, useState } from 'react'
import type { Song } from '@/types'
import * as ncm from '@/api/ncm'
import { usePlayer } from '@/store/player'
import { useLibrary } from '@/store/library'
import { useAuth } from '@/store/auth'
import { SongList } from '@/components/SongRow'
import { useSongMenu } from '@/components/SongContextMenu'
import { IconPlay, IconHeart, IconSearch, IconMusic } from '@/components/Icons'

type SortKey = 'default' | 'likeTime' | 'name' | 'artist' | 'duration'

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'likeTime', label: '最近喜欢' },
  { key: 'default', label: '默认顺序' },
  { key: 'name', label: '按名称' },
  { key: 'artist', label: '按歌手' },
  { key: 'duration', label: '按时长' },
]

const collator = new Intl.Collator('zh-Hans-CN', { sensitivity: 'base', numeric: true })

export function LikePage() {
  const { user } = useAuth()
  const { playQueue, addToQueue, queue, currentIndex } = usePlayer()
  const { likedIds, toggleLike, loadLikes } = useLibrary()

  const [songs, setSongs] = useState<Song[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [keyword, setKeyword] = useState('')
  const [sort, setSort] = useState<SortKey>('likeTime')
  // 歌曲 id -> 喜欢时间戳（毫秒）
  const [likeTimes, setLikeTimes] = useState<Map<number, number>>(new Map())
  const [totalCount, setTotalCount] = useState(0)

  const uid = user?.userId

  useEffect(() => {
    if (!uid) {
      setLoading(false)
      return
    }
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid])

  async function load() {
    if (!uid) return
    setLoading(true)
    setError(null)
    try {
      // 用带「喜欢时间」的完整接口（trackIds 不会被截断到 1000 首）
      const data = await ncm.likePlaylistWithTime(uid)
      setLikeTimes(new Map(data.items.map((x) => [x.song.id, x.at])))
      setSongs(data.songs.filter((s) => s && s.id))
      if (data.total > 0) setTotalCount(data.total)
      // 顺带同步一下全局喜欢集合，避免状态不一致
      if (likedIds.size !== data.songs.length) void loadLikes(uid)
    } catch (e: any) {
      setError(e?.message || '加载喜欢的音乐失败')
    } finally {
      setLoading(false)
    }
  }

  /** 点击红心：已喜欢的取消并即时从列表移除；未喜欢的则加回 */
  const handleLikeToggle = async (song: Song) => {
    const wasLiked = likedIds.has(song.id)
    const backup = songs
    if (wasLiked) setSongs((prev) => prev.filter((s) => s.id !== song.id))
    try {
      await toggleLike(song.id)
    } catch (e) {
      if (wasLiked) setSongs(backup)
      setError(wasLiked ? '取消喜欢失败，请重试' : '收藏失败，请重试')
    }
  }

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    let list = songs
    if (kw) {
      list = list.filter((s) => {
        const name = (s.name || '').toLowerCase()
        const artists = (s.ar || s.artists || []).map((a) => a.name).join(' ').toLowerCase()
        const album = (s.al?.name || s.album?.name || '').toLowerCase()
        return name.includes(kw) || artists.includes(kw) || album.includes(kw)
      })
    }
    if (sort === 'likeTime') {
      // 最近喜欢的在前（时间戳倒序）
      list = [...list].sort((a, b) => (likeTimes.get(b.id) || 0) - (likeTimes.get(a.id) || 0))
    } else if (sort === 'name') {
      list = [...list].sort((a, b) => collator.compare(a.name, b.name))
    } else if (sort === 'artist') {
      list = [...list].sort((a, b) => {
        const aa = (a.ar || a.artists || [])[0]?.name || ''
        const bb = (b.ar || b.artists || [])[0]?.name || ''
        return collator.compare(aa, bb)
      })
    } else if (sort === 'duration') {
      list = [...list].sort((a, b) => (b.dt || b.duration || 0) - (a.dt || a.duration || 0))
    }
    return list
  }, [songs, keyword, sort, likeTimes])

  const cover = useMemo(() => {
    const first = songs.find((s) => s.al?.picUrl || s.album?.picUrl)
    return first ? ncm.songCoverUrl(first, 400) : ''
  }, [songs])

  const currentId = queue[currentIndex]?.id

  const header = (
    <div className="page-header">
      <h1 className="page-title">我喜欢的音乐</h1>
      <span className="page-sub">
        {loading
          ? '正在同步…'
          : `共 ${totalCount || songs.length} 首${keyword ? ` · 匹配 ${filtered.length} 首` : ''}`}
      </span>
      <button
        className="btn sm ghost"
        style={{ marginLeft: 'auto' }}
        onClick={() => void load()}
        disabled={loading || !uid}
      >
        重新同步
      </button>
    </div>
  )

  if (!uid) {
    return (
      <div className="content-scroll">
        {header}
        <div className="notice-box">需要登录后才能查看我喜欢的音乐。</div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="content-scroll">
        {header}
        <div className="loading-wrap">
          <div className="spinner" />
          <div>正在同步我喜欢的音乐…</div>
        </div>
      </div>
    )
  }

  // 完全没有数据时才整页报错；已有列表时用行内提示，避免误操作后列表被清空
  if (error && !songs.length) {
    return (
      <div className="content-scroll">
        {header}
        <div className="error-box">{error}</div>
        <button className="btn" onClick={() => void load()}>重试</button>
      </div>
    )
  }

  return (
    <div className="content-scroll">
      {header}

      {error && <div className="error-box" style={{ marginBottom: 14 }}>{error}</div>}

      {/* 顶部大封面 + 简介 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 24,
          padding: '20px 22px',
          borderRadius: 16,
          border: '1px solid var(--border)',
          background:
            'radial-gradient(120% 140% at 0% 0%, var(--accent-soft), var(--hero-scrim) 52%, var(--bg-1))',
          marginBottom: 22,
        }}
      >
        <div
          style={{
            width: 172,
            height: 172,
            borderRadius: 14,
            overflow: 'hidden',
            background: 'var(--bg-3)',
            flexShrink: 0,
            display: 'grid',
            placeItems: 'center',
            boxShadow: 'var(--shadow-1)',
          }}
        >
          {cover ? (
            <img src={cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <IconHeart size={54} filled />
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ marginBottom: 8, color: 'var(--text-2)', fontSize: 12.5 }}>
            <IconHeart size={14} filled /> 歌单
          </div>
          <div style={{ fontSize: 26, fontWeight: 650, marginBottom: 6 }}>我喜欢的音乐</div>
          <div className="muted" style={{ fontSize: 13, marginBottom: 4 }}>
            {user?.nickname} · 共 <span style={{ color: 'var(--text-0)', fontWeight: 600 }}>{totalCount || songs.length}</span> 首
          </div>
          <div className="muted small" style={{ marginBottom: 16 }}>
            每一次点亮红心，都会出现在这里
          </div>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <button
              className="btn primary"
              onClick={() => void playQueue(filtered, 0)}
              disabled={!filtered.length}
            >
              <IconPlay size={14} /> 播放全部
            </button>
            <button
              className="btn"
              onClick={() => { if (filtered[0]) void playQueue(filtered, Math.floor(Math.random() * filtered.length)) }}
              disabled={!filtered.length}
            >
              随机播放
            </button>
          </div>
        </div>
      </div>

      {/* 搜索 + 排序 */}
      <div className="toolbar">
        <div className="search-input-wrap" style={{ width: 240 }}>
          <IconSearch size={15} />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="在喜欢的音乐中搜索"
          />
        </div>
        <div className="row" style={{ gap: 6 }}>
          {SORTS.map((s) => (
            <button
              key={s.key}
              className={`chip ${sort === s.key ? 'active' : ''}`}
              onClick={() => setSort(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>
        {keyword && (
          <button className="btn sm ghost" onClick={() => setKeyword('')}>清除</button>
        )}
      </div>

      {!songs.length ? (
        <div className="empty">
          <div className="empty-icon">♡</div>
          还没有喜欢的歌曲
          <div className="small" style={{ color: 'var(--text-3)' }}>
            在任意歌曲上点击红心，就会收藏到这里
          </div>
        </div>
      ) : !filtered.length ? (
        <div className="empty">
          <div className="empty-icon">♪</div>
          没有匹配「{keyword}」的歌曲
        </div>
      ) : (
        <SongList
          songs={filtered}
          currentId={currentId}
          likedIds={likedIds}
          onPlay={(song, i) => void playQueue(filtered, i)}
          onLike={(song) => void handleLikeToggle(song)}
          onAddQueue={addToQueue}
          onContextMenu={(e, song) => useSongMenu.getState().show(e.clientX, e.clientY, song)}
          emptyText="还没有喜欢的歌曲"
        />
      )}

      {/* 说明：列表内喜欢按钮即取消喜欢 */}
      <div className="muted small mt-16" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <IconMusic size={13} /> 提示：再次点击红心可取消喜欢，该歌曲会立即从本列表移除。
      </div>
    </div>
  )
}
