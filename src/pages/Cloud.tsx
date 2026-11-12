import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Song } from '@/types'
import * as ncm from '@/api/ncm'
import { usePlayer } from '@/store/player'
import { useAuth } from '@/store/auth'
import { useSongMenu } from '@/components/SongContextMenu'
import {
  IconCloud, IconPlay, IconDownload, IconSearch, IconClose, IconPlus,
} from '@/components/Icons'

/** 网盘接口返回的原始条目 */
interface CloudItem {
  songId: number
  songName?: string
  artist?: string
  album?: string
  fileName?: string
  fileSize?: number
  bitrate?: number
  simpleSong?: Song | null
}

const PAGE_SIZE = 100

/** 字节格式化：B / KB / MB / GB */
function formatBytes(n: number | undefined): string {
  if (!n || n <= 0) return '0 MB'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = n
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  // 小于 1MB 时也以 KB 展示更直观；总占用统一用 MB/GB
  const fixed = v >= 100 || i <= 1 ? 0 : v >= 10 ? 1 : 2
  return `${v.toFixed(fixed)} ${units[i]}`
}

/** 码率格式化：bps → kbps */
function formatBitrate(br: number | undefined): string {
  if (!br || br <= 0) return '—'
  return `${Math.round(br / 1000)} kbps`
}

/** 把网盘条目转换成可播放的 Song */
function toSong(item: CloudItem): Song {
  if (item.simpleSong && item.simpleSong.id) return item.simpleSong
  return {
    id: item.songId,
    name: item.songName || item.fileName || '未知歌曲',
    ar: [{ id: 0, name: item.artist || '未知歌手' }],
    al: { id: 0, name: item.album || '未知专辑' },
    dt: 0,
  }
}

function songTitle(item: CloudItem): string {
  return item.songName || item.simpleSong?.name || item.fileName || '未知歌曲'
}

function songArtist(item: CloudItem): string {
  const ss = item.simpleSong
  if (ss?.ar?.length) return ss.ar.map((a) => a.name).join(' / ')
  return item.artist || '未知歌手'
}

function songAlbum(item: CloudItem): string {
  return item.simpleSong?.al?.name || item.album || '—'
}

export function CloudPage() {
  const { user } = useAuth()
  const { playQueue, addToQueue, queue, currentIndex } = usePlayer()

  const [items, setItems] = useState<CloudItem[]>([])
  const [count, setCount] = useState(0)
  const [size, setSize] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [keyword, setKeyword] = useState('')
  const [hasMore, setHasMore] = useState(true)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const offsetRef = useRef(0)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    offsetRef.current = 0
    try {
      const r = await ncm.cloudList(PAGE_SIZE, 0)
      if (!alive.current) return
      setItems(r.data as CloudItem[])
      setCount(r.count)
      setSize(r.size)
      offsetRef.current = r.data.length
      setHasMore(r.data.length > 0 && r.data.length < r.count)
    } catch (e: any) {
      if (alive.current) setError(e?.message || '加载音乐网盘失败')
    } finally {
      if (alive.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const loadMore = async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    setError(null)
    try {
      const r = await ncm.cloudList(PAGE_SIZE, offsetRef.current)
      if (!alive.current) return
      setItems((prev) => {
        const seen = new Set(prev.map((x) => x.songId))
        const add = (r.data as CloudItem[]).filter((x) => !seen.has(x.songId))
        return [...prev, ...add]
      })
      setCount(r.count)
      setSize(r.size)
      offsetRef.current += r.data.length
      setHasMore(r.data.length > 0 && offsetRef.current < r.count)
    } catch (e: any) {
      if (alive.current) setError(e?.message || '加载更多失败')
    } finally {
      if (alive.current) setLoadingMore(false)
    }
  }

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    if (!kw) return items
    return items.filter((it) => {
      const name = (songTitle(it) || '').toLowerCase()
      const file = (it.fileName || '').toLowerCase()
      const artist = songArtist(it).toLowerCase()
      return name.includes(kw) || file.includes(kw) || artist.includes(kw)
    })
  }, [items, keyword])

  const playable = useMemo(() => filtered.map(toSong), [filtered])

  const handleDelete = async (item: CloudItem) => {
    const title = songTitle(item)
    if (!window.confirm(`确定要从音乐网盘删除「${title}」吗？\n该操作会删除云端文件，无法恢复。`)) return
    setDeletingId(item.songId)
    setError(null)
    try {
      await ncm.cloudDelete(item.songId)
      setItems((prev) => prev.filter((x) => x.songId !== item.songId))
      setCount((c) => Math.max(0, c - 1))
      setSize((s) => Math.max(0, s - (item.fileSize || 0)))
    } catch (e: any) {
      setError('删除失败：' + (e?.message || '未知错误'))
    } finally {
      setDeletingId(null)
    }
  }

  const currentId = queue[currentIndex]?.id

  const header = (
    <div className="page-header">
      <h1 className="page-title">音乐网盘</h1>
      <span className="page-sub">
        {loading ? '正在读取…' : `共 ${count} 首 · 占用 ${formatBytes(size)}`}
      </span>
      <div className="row" style={{ marginLeft: 'auto', gap: 8 }}>
        <button className="btn sm ghost" onClick={() => void window.yun.openDownloadDir()}>
          <IconDownload size={14} /> 打开下载目录
        </button>
        <button className="btn sm ghost" onClick={() => void load()} disabled={loading}>
          刷新
        </button>
      </div>
    </div>
  )

  if (loading) {
    return (
      <div className="content-scroll">
        {header}
        <div className="loading-wrap">
          <div className="spinner" />
          <div>正在读取音乐网盘…</div>
        </div>
      </div>
    )
  }

  if (error && !items.length) {
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

      {!user && (
        <div className="notice-box" style={{ marginBottom: 16 }}>
          <IconCloud size={15} /> 未登录时可能无法读取完整的音乐网盘，请先登录账号。
        </div>
      )}

      {/* 统计卡片 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 22,
          padding: '18px 22px',
          borderRadius: 16,
          border: '1px solid var(--border)',
          background:
            'radial-gradient(120% 140% at 0% 0%, var(--accent-soft), var(--hero-scrim) 55%, var(--bg-1))',
          marginBottom: 18,
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background: 'var(--accent-soft)',
            color: 'var(--accent)',
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0,
          }}
        >
          <IconCloud size={28} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, marginBottom: 3 }}>
            共 <span style={{ fontWeight: 650 }}>{count}</span> 首 · 占用{' '}
            <span style={{ fontWeight: 650 }}>{formatBytes(size)}</span>
          </div>
          <div className="muted small">
            音乐网盘中的歌曲可在本客户端直接播放；上传请使用网易云官方客户端。
          </div>
        </div>
        {playable.length > 0 && (
          <button className="btn primary" onClick={() => void playQueue(playable, 0)}>
            <IconPlay size={14} /> 播放全部
          </button>
        )}
      </div>

      <div className="toolbar">
        <div className="search-input-wrap" style={{ width: 270 }}>
          <IconSearch size={15} />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="按歌名 / 文件名 / 歌手筛选"
          />
        </div>
        {keyword && <button className="btn sm ghost" onClick={() => setKeyword('')}>清除</button>}
        <span className="small muted" style={{ marginLeft: 'auto' }}>
          显示 {filtered.length} / 已载入 {items.length} 首
        </span>
      </div>

      {error && <div className="error-box" style={{ marginBottom: 14 }}>{error}</div>}

      {!items.length ? (
        <div className="empty">
          <div className="empty-icon">☁</div>
          网盘还是空的
          <div className="small" style={{ color: 'var(--text-3)', lineHeight: 1.9 }}>
            可以先用网易云官方客户端把本地音乐上传到音乐云盘，
            <br />
            上传完成后回到这里点「刷新」即可播放。
          </div>
        </div>
      ) : !filtered.length ? (
        <div className="empty">
          <div className="empty-icon">♪</div>
          没有匹配「{keyword}」的文件
        </div>
      ) : (
        <>
          <div
            className="table-head"
            style={{ gridTemplateColumns: '42px 1fr 150px 150px 96px 86px 68px' }}
          >
            <div>#</div>
            <div>歌名 / 文件名</div>
            <div>歌手</div>
            <div>专辑</div>
            <div>码率</div>
            <div style={{ textAlign: 'right', paddingRight: 10 }}>大小</div>
            <div />
          </div>

          {filtered.map((it, i) => {
            const title = songTitle(it)
            const isCurrent = it.songId === currentId
            const song = toSong(it)
            const busy = deletingId === it.songId
            return (
              <div
                key={`${it.songId}-${i}`}
                className={`song-row ${isCurrent ? 'playing' : ''}`}
                style={{
                  gridTemplateColumns: '42px 1fr 150px 150px 96px 86px 68px',
                  opacity: busy ? 0.4 : 1,
                }}
                onDoubleClick={() => void playQueue(playable, i)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  useSongMenu.getState().show(e.clientX, e.clientY, song)
                }}
              >
                <div className="song-idx" onClick={() => void playQueue(playable, i)} style={{ cursor: 'pointer' }}>
                  <span className="num">{String(i + 1).padStart(2, '0')}</span>
                  <span className="play-ico"><IconPlay size={13} /></span>
                </div>

                <div className="song-main" style={{ minWidth: 0 }}>
                  <div className="song-name text-ellipsis" title={title}>
                    {title}
                    {it.fileName && it.fileName !== title && (
                      <span style={{ color: 'var(--text-3)', fontSize: 11, marginLeft: 8, fontWeight: 400 }}>
                        {it.fileName}
                      </span>
                    )}
                  </div>
                  <div className="song-album">{songAlbum(it)}</div>
                </div>

                <div className="song-artist text-ellipsis" title={songArtist(it)}>{songArtist(it)}</div>
                <div className="song-artist text-ellipsis" title={songAlbum(it)}>{songAlbum(it)}</div>
                <div className="song-dur" style={{ textAlign: 'left', fontSize: 12 }}>
                  {formatBitrate(it.bitrate)}
                </div>
                <div className="song-dur">{formatBytes(it.fileSize)}</div>

                <div className="song-actions" style={{ opacity: busy ? 0.5 : undefined }}>
                  <button
                    className="song-action-btn"
                    title="加入播放队列"
                    onClick={(e) => { e.stopPropagation(); addToQueue(song) }}
                    disabled={busy}
                  >
                    <IconPlus size={14} />
                  </button>
                  <button
                    className="song-action-btn"
                    title="从网盘删除"
                    onClick={(e) => { e.stopPropagation(); void handleDelete(it) }}
                    disabled={busy}
                    style={{ color: 'var(--text-2)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-2)' }}
                  >
                    <IconClose size={14} />
                  </button>
                </div>
              </div>
            )
          })}

          <div className="row" style={{ justifyContent: 'center', marginTop: 20 }}>
            {hasMore ? (
              <button className="btn" onClick={() => void loadMore()} disabled={loadingMore}>
                {loadingMore ? '加载中…' : `加载更多（已载入 ${items.length} / ${count}）`}
              </button>
            ) : (
              <span className="small muted">已经到底了 · 共 {items.length} 首</span>
            )}
          </div>
        </>
      )}
    </div>
  )
}
