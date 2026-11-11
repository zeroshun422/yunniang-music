import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { Playlist, Song } from '@/types'
import * as ncm from '@/api/ncm'
import { SongList } from '@/components/SongRow'
import { IconPlay, IconHeart, IconBack, IconStar } from '@/components/Icons'
import { usePlayer } from '@/store/player'
import { useLibrary } from '@/store/library'
import { useSongMenu } from '@/components/SongContextMenu'

/** 封面地址兜底：无图时返回 undefined，避免空 src 触发无效请求 */
function cover(src?: string, size = 300): string | undefined {
  return src ? ncm.coverUrl(src, size) : undefined
}

export function PlaylistDetailPage() {
  const { id: idParam } = useParams<{ id: string }>()
  const id = Number(idParam)
  const navigate = useNavigate()

  const { playQueue, addToQueue, queue, currentIndex } = usePlayer()
  const { likedIds, toggleLike } = useLibrary()

  const [playlist, setPlaylist] = useState<Playlist | null>(null)
  const [songs, setSongs] = useState<Song[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [subscribing, setSubscribing] = useState(false)
  const [descExpanded, setDescExpanded] = useState(false)

  const seq = useRef(0)

  useEffect(() => {
    setDescExpanded(false)
    void load()
    return () => {
      seq.current++
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idParam])

  useEffect(() => {
    if (!hint) return
    const t = setTimeout(() => setHint(null), 2600)
    return () => clearTimeout(t)
  }, [hint])

  async function load() {
    const my = ++seq.current
    setLoading(true)
    setError(null)
    setPlaylist(null)
    setSongs([])

    if (!idParam || !Number.isFinite(id) || id <= 0) {
      setError('歌单 ID 无效')
      setLoading(false)
      return
    }

    try {
      const pl = await ncm.playlistDetail(id)
      if (my !== seq.current) return
      if (!pl) throw new Error('歌单不存在或已下架')
      setPlaylist(pl)

      // 全部歌曲；失败或为空退回 playlist.tracks
      let tracks: Song[] = []
      try {
        tracks = await ncm.playlistTrackAll(id)
      } catch (e) {
        tracks = []
      }
      if (my !== seq.current) return
      if (!tracks.length) tracks = (pl.tracks || []) as Song[]
      setSongs(tracks)
    } catch (e: any) {
      if (my !== seq.current) return
      setError(e?.message || '歌单加载失败，请稍后重试')
    } finally {
      if (my === seq.current) setLoading(false)
    }
  }

  async function toggleSubscribe() {
    if (!playlist || subscribing) return
    const next = !playlist.subscribed
    setSubscribing(true)
    try {
      const r: any = await ncm.subscribePlaylist(playlist.id, next)
      if (r && typeof r.code === 'number' && r.code !== 200) {
        setHint(r.message || r.msg || '操作失败，请稍后重试')
        return
      }
      setPlaylist((p) => (p ? { ...p, subscribed: next } : p))
      setHint(next ? '已收藏该歌单' : '已取消收藏')
    } catch (e: any) {
      setHint(e?.message || '操作失败，请稍后重试')
    } finally {
      setSubscribing(false)
    }
  }

  const header = (
    <div className="page-header">
      <h1 className="page-title">歌单详情</h1>
      <span className="page-sub">
        {playlist
          ? `${playlist.trackCount ?? songs.length} 首歌曲 · ${
              playlist.creator?.nickname || '网易云音乐'
            }`
          : '正在读取歌单信息…'}
      </span>
    </div>
  )

  if (loading) {
    return (
      <div className="content-scroll">
        {header}
        <div className="loading-wrap">
          <div className="spinner" />
          <div>加载歌单中…</div>
        </div>
      </div>
    )
  }

  if (error || !playlist) {
    return (
      <div className="content-scroll">
        {header}
        <div className="error-box">{error || '歌单不存在'}</div>
        <div className="row" style={{ marginTop: 12, gap: 10 }}>
          <button className="btn" onClick={load}>
            重试
          </button>
          <button className="btn ghost" onClick={() => navigate(-1)}>
            返回
          </button>
        </div>
      </div>
    )
  }

  const playlistCover = playlist.coverImgUrl || playlist.picUrl
  const creator = playlist.creator?.nickname || '网易云音乐'
  const subscribed = !!playlist.subscribed
  const trackCount = playlist.trackCount ?? songs.length
  const desc = (playlist.description || '').trim()
  const descLong = desc.length > 160

  return (
    <div className="content-scroll">
      {header}

      {/* 顶部工具条 */}
      <div className="row" style={{ marginBottom: 16, gap: 8 }}>
        <button className="btn ghost sm" onClick={() => navigate(-1)}>
          <IconBack size={14} /> 返回
        </button>
      </div>

      {/* 歌单头部 */}
      <div
        style={{
          display: 'flex',
          gap: 22,
          alignItems: 'flex-start',
          marginBottom: 26,
          flexWrap: 'wrap',
        }}
      >
        <img
          src={cover(playlistCover, 400)}
          alt=""
          style={{
            width: 186,
            height: 186,
            borderRadius: 'var(--radius-lg)',
            objectFit: 'cover',
            background: 'var(--bg-3)',
            flexShrink: 0,
            boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
          }}
        />

        <div className="grow" style={{ minWidth: 260, display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              fontSize: 22,
              fontWeight: 640,
              lineHeight: 1.35,
              marginBottom: 12,
            }}
          >
            {playlist.name}
            {subscribed && (
              <span className="song-tag" style={{ marginLeft: 10, verticalAlign: 'middle' }}>
                已收藏
              </span>
            )}
          </div>

          <div className="row" style={{ gap: 10, marginBottom: 10 }}>
            <span className="small muted">创建者</span>
            <span className="small" style={{ color: 'var(--text-0)' }}>
              {creator}
            </span>
          </div>

          <div className="row" style={{ gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
            <span className="small muted">
              {ncm.formatCount(trackCount)} 首歌曲
            </span>
            <span className="small muted">
              {ncm.formatCount(ncm.getPlayCount(playlist))} 次播放
            </span>
            {typeof (playlist as any).subscribedCount === 'number' && (
              <span className="small muted">
                收藏 {ncm.formatCount((playlist as any).subscribedCount)} 次
              </span>
            )}
            {Array.isArray(playlist.tags) && playlist.tags.length > 0 && (
              <span className="row" style={{ gap: 5, flexWrap: 'wrap' }}>
                {playlist.tags.slice(0, 4).map((t) => (
                  <span
                    key={t}
                    className="small"
                    style={{
                      padding: '1px 8px',
                      borderRadius: 10,
                      background: 'var(--bg-2)',
                      color: 'var(--text-2)',
                    }}
                  >
                    {t}
                  </span>
                ))}
              </span>
            )}
          </div>

          {desc && (
            <div
              className="small"
              style={{
                color: 'var(--text-2)',
                lineHeight: 1.75,
                whiteSpace: 'pre-wrap',
                maxWidth: 720,
                ...(descLong && !descExpanded
                  ? {
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical' as const,
                      overflow: 'hidden',
                    }
                  : {}),
              }}
            >
              {desc}
            </div>
          )}
          {descLong && (
            <button
              className="small"
              style={{
                alignSelf: 'flex-start',
                marginTop: 5,
                color: 'var(--text-2)',
                cursor: 'pointer',
              }}
              onClick={() => setDescExpanded((v) => !v)}
            >
              {descExpanded ? '收起' : '展开全部'}
            </button>
          )}

          <div className="row" style={{ gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
            <button
              className="btn primary"
              disabled={!songs.length}
              onClick={() => {
                if (!songs.length) return
                void playQueue(songs, 0)
              }}
            >
              <IconPlay size={14} /> 播放全部
            </button>
            <button className="btn" disabled={subscribing} onClick={toggleSubscribe}>
              {subscribed ? <IconStar size={14} /> : <IconHeart size={14} />}
              {subscribing ? '处理中…' : subscribed ? '取消收藏' : '收藏'}
            </button>
            <button
              className="btn ghost"
              disabled={!songs.length}
              onClick={() => {
                songs.forEach((s) => addToQueue(s))
                setHint('已加入播放队列')
              }}
            >
              加入队列
            </button>
          </div>
        </div>
      </div>

      {hint && (
        <div className="notice-box" style={{ marginBottom: 14 }}>
          {hint}
        </div>
      )}

      {/* 歌曲列表 */}
      <div className="section-title">
        歌曲列表
        <span className="more" style={{ cursor: 'default' }}>
          {songs.length} 首
        </span>
      </div>

      {songs.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">♪</div>
          该歌单暂无可播放歌曲
        </div>
      ) : (
        <SongList
          songs={songs}
          currentId={queue[currentIndex]?.id}
          likedIds={likedIds}
          onPlay={(_song, i) => {
            void playQueue(songs, i)
          }}
          onLike={(song) => {
            toggleLike(song.id).catch(() => setHint('喜欢失败，请稍后再试'))
          }}
          onAddQueue={addToQueue}
          onContextMenu={(e: React.MouseEvent, song) => {
            useSongMenu.getState().show(e.clientX, e.clientY, song)
          }}
        />
      )}
    </div>
  )
}
