import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import * as ncm from '@/api/ncm'
import type { Song } from '@/types'
import { SongList } from '@/components/SongRow'
import { usePlayer } from '@/store/player'
import { useLibrary } from '@/store/library'
import { useAuth } from '@/store/auth'
import { useSongMenu } from '@/components/SongContextMenu'
import { IconBack, IconPlay, IconHeart } from '@/components/Icons'

type Tab = 'hot' | 'all' | 'album'

export function ArtistPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const artistId = Number(id)

  const { playQueue, addToQueue, queue, currentIndex } = usePlayer()
  const { likedIds, toggleLike, loadLikes } = useLibrary()
  const { user } = useAuth()

  const [artist, setArtist] = useState<any>(null)
  const [hotSongs, setHotSongs] = useState<Song[]>([])
  const [allSongs, setAllSongs] = useState<Song[]>([])
  const [albums, setAlbums] = useState<any[]>([])

  const [tab, setTab] = useState<Tab>('hot')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [allLoading, setAllLoading] = useState(false)
  const [albumLoading, setAlbumLoading] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [offset, setOffset] = useState(0)

  useEffect(() => {
    if (Number.isFinite(artistId) && artistId > 0) load()
  }, [artistId])

  useEffect(() => {
    if (user?.userId && likedIds.size === 0) loadLikes(user.userId)
  }, [user?.userId])

  async function load() {
    setLoading(true); setError(null)
    try {
      const [detail, top] = await Promise.allSettled([
        ncm.artistDetail(artistId),
        ncm.artistTopSongs(artistId),
      ])
      if (detail.status === 'fulfilled') setArtist(detail.value)
      if (top.status === 'fulfilled') setHotSongs(top.value)
      if (detail.status === 'rejected' && top.status === 'rejected') {
        throw new Error('歌手信息加载失败，请检查网络或稍后重试')
      }
      if (top.status === 'rejected') {
        setError('热门歌曲加载失败：' + (top.reason?.message || '未知错误'))
      }
    } catch (e: any) {
      setError(e.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  async function loadAll(reset = false) {
    setAllLoading(true)
    try {
      const off = reset ? 0 : offset
      const r = await ncm.artistSongs(artistId, 50, off, 'hot')
      setAllSongs((prev) => (reset ? r.songs : [...prev, ...r.songs]))
      setHasMore(r.more)
      setOffset(off + 50)
    } catch (e: any) {
      setError('歌曲加载失败：' + e.message)
    } finally {
      setAllLoading(false)
    }
  }

  async function loadAlbums() {
    if (albums.length) return
    setAlbumLoading(true)
    try {
      const list = await ncm.artistAlbums(artistId, 30, 0)
      setAlbums(list)
    } catch (e: any) {
      setError('专辑加载失败：' + e.message)
    } finally {
      setAlbumLoading(false)
    }
  }

  const switchTab = (t: Tab) => {
    setTab(t)
    if (t === 'all' && allSongs.length === 0) loadAll(true)
    if (t === 'album' && albums.length === 0) loadAlbums()
  }

  if (!Number.isFinite(artistId) || artistId <= 0) {
    return (
      <div className="content-scroll">
        <div className="error-box">无效的歌手 ID</div>
        <button className="btn" onClick={() => navigate(-1)}>返回</button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="content-scroll">
        <div className="loading-wrap"><div className="spinner" /><div>正在加载歌手信息…</div></div>
      </div>
    )
  }

  if (error && !artist && hotSongs.length === 0) {
    return (
      <div className="content-scroll">
        <div className="error-box">{error}</div>
        <div className="row mt-12">
          <button className="btn primary" onClick={load}>重试</button>
          <button className="btn ghost" onClick={() => navigate(-1)}>返回</button>
        </div>
      </div>
    )
  }

  const avatar = artist?.cover || artist?.avatar || artist?.picUrl || ''
  const name = artist?.name || '未知歌手'
  const briefDesc = artist?.briefDesc || artist?.description || ''
  const musicSize = artist?.musicSize ?? hotSongs.length
  const albumSize = artist?.albumSize ?? 0
  const fansCount = artist?.fansCount ?? artist?.followed ?? 0

  const listForPlay = tab === 'all' ? allSongs : hotSongs

  return (
    <div className="content-scroll">
      <div className="row mb-16" style={{ gap: 8 }}>
        <button className="btn ghost sm" onClick={() => navigate(-1)}>
          <IconBack size={13} /> 返回
        </button>
      </div>

      {/* 头部 */}
      <div style={{ display: 'flex', gap: 24, marginBottom: 26, alignItems: 'flex-start' }}>
        <img
          src={ncm.coverUrl(avatar, 300)}
          alt=""
          style={{
            width: 168, height: 168, borderRadius: '50%', objectFit: 'cover',
            background: 'var(--bg-3)', flexShrink: 0,
            boxShadow: '0 6px 24px rgba(0,0,0,0.45)',
          }}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = '0.25' }}
        />
        <div className="grow" style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 26, fontWeight: 650, marginBottom: 10 }}>{name}</h1>
          <div className="small muted mb-12" style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
            {musicSize > 0 && <span>单曲 {ncm.formatCount(musicSize)}</span>}
            {albumSize > 0 && <span>专辑 {ncm.formatCount(albumSize)}</span>}
            {fansCount > 0 && <span>粉丝 {ncm.formatCount(fansCount)}</span>}
          </div>
          {briefDesc && (
            <div className="small muted" style={{ lineHeight: 1.8, maxWidth: 720 }}>
              {briefDesc.slice(0, 220)}{briefDesc.length > 220 ? '…' : ''}
            </div>
          )}
          <div className="row mt-16" style={{ gap: 10 }}>
            <button
              className="btn primary"
              disabled={!hotSongs.length}
              onClick={() => playQueue(hotSongs, 0)}
            >
              <IconPlay size={14} /> 播放热门歌曲
            </button>
            <button
              className="btn ghost"
              disabled={!hotSongs.length}
              onClick={() => hotSongs.forEach((s) => addToQueue(s))}
            >
              加入队列
            </button>
          </div>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}

      {/* 标签 */}
      <div className="tabs">
        <button className={`chip ${tab === 'hot' ? 'active' : ''}`} onClick={() => switchTab('hot')}>
          热门歌曲 {hotSongs.length > 0 ? `(${hotSongs.length})` : ''}
        </button>
        <button className={`chip ${tab === 'all' ? 'active' : ''}`} onClick={() => switchTab('all')}>
          全部歌曲
        </button>
        <button className={`chip ${tab === 'album' ? 'active' : ''}`} onClick={() => switchTab('album')}>
          专辑
        </button>
      </div>

      {/* 内容 */}
      {(tab === 'hot' || tab === 'all') && (
        <>
          {(tab === 'hot' ? hotSongs : allSongs).length === 0 ? (
            <div className="empty">
              <div className="empty-icon">♪</div>
              {tab === 'hot' ? '暂无热门歌曲' : '暂无歌曲数据'}
            </div>
          ) : (
            <SongList
              songs={listForPlay}
              currentId={queue[currentIndex]?.id}
              likedIds={likedIds}
              onPlay={(_s, i) => playQueue(listForPlay, i)}
              onLike={(s) => toggleLike(s.id).catch(() => {})}
              onAddQueue={addToQueue}
              onContextMenu={(e, s) => useSongMenu.getState().show(e.clientX, e.clientY, s)}
            />
          )}

          {tab === 'all' && hasMore && (
            <div className="row" style={{ justifyContent: 'center', marginTop: 20 }}>
              <button className="btn" onClick={() => loadAll(false)} disabled={allLoading}>
                {allLoading ? '加载中…' : '加载更多'}
              </button>
            </div>
          )}
        </>
      )}

      {tab === 'album' && (
        albumLoading ? (
          <div className="loading-wrap"><div className="spinner" /><div>专辑加载中…</div></div>
        ) : albums.length === 0 ? (
          <div className="empty"><div className="empty-icon">♪</div>暂无专辑</div>
        ) : (
          <div className="grid-cards">
            {albums.map((a) => (
              <div className="card" key={a.id}>
                <div className="card-cover-wrap">
                  <img
                    className="card-cover"
                    src={ncm.coverUrl(a.picUrl, 300)}
                    alt=""
                    loading="lazy"
                  />
                </div>
                <div className="card-title">{a.name}</div>
                <div className="card-sub">
                  {a.publishTime
                    ? new Date(a.publishTime).getFullYear() + ' · '
                    : ''}
                  {a.size ? `${a.size} 首` : ''}
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}
