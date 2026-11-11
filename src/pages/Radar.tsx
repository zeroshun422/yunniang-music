import React, { useEffect, useState } from 'react'
import * as ncm from '@/api/ncm'
import type { Song, Playlist } from '@/types'
import { useAuth } from '@/store/auth'
import { usePlayer } from '@/store/player'
import { useLibrary } from '@/store/library'
import { SongList } from '@/components/SongRow'
import { useSongMenu } from '@/components/SongContextMenu'
import { IconPlay, IconRadar } from '@/components/Icons'

const WEEK = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

function todayText(): string {
  const d = new Date()
  return `${d.getMonth() + 1}月${d.getDate()}日 ${WEEK[d.getDay()]}`
}

export function RadarPage() {
  const { user } = useAuth()
  const { playQueue, addToQueue, queue, currentIndex } = usePlayer()
  const { likedIds, toggleLike } = useLibrary()

  const [playlist, setPlaylist] = useState<Playlist | null>(null)
  const [tracks, setTracks] = useState<Song[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.userId])

  async function load() {
    setLoading(true)
    setError(null)
    setUnavailable(false)
    setPlaylist(null)
    setTracks([])

    if (!user) {
      setUnavailable(true)
      setLoading(false)
      return
    }

    try {
      const pl = await ncm.privateRadar()
      let list = pl?.tracks || []

      // 雷达歌单的 tracks 有时为空，单独拉一次
      if (list.length === 0) {
        list = await ncm.playlistTrackAll(ncm.RADAR_PLAYLIST_ID, 100).catch(() => [])
      }

      if (!list.length) {
        setUnavailable(true)
      } else {
        setPlaylist(pl)
        setTracks(list)
      }
    } catch (e: any) {
      // 404 / 需要登录 / 空数据都视为"暂不可用"
      setUnavailable(true)
      if (e && !e.needLogin && e.code !== 404) {
        setError((e && e.message) || '私人雷达加载失败')
      }
    } finally {
      setLoading(false)
    }
  }

  const showMenu = (e: React.MouseEvent, song: Song) =>
    useSongMenu.getState().show(e.clientX, e.clientY, song)

  const currentId = queue[currentIndex]?.id
  const cover = playlist ? playlist.coverImgUrl || playlist.picUrl : ''
  const desc = playlist?.description || '根据你的听歌记录每天生成的个性化推荐歌单，播放越多越懂你。'

  const header = (
    <div className="page-header">
      <h1 className="page-title">私人雷达</h1>
      <span className="page-sub">{todayText()} · 每天更新的个性化推荐</span>
    </div>
  )

  if (loading) {
    return (
      <div className="content-scroll">
        <div className="loading-wrap">
          <div className="spinner" />
          <div>正在扫描你的音乐雷达…</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="content-scroll">
        {header}
        <div className="error-box">{error}</div>
        <button className="btn" onClick={load}>重试</button>
      </div>
    )
  }

  if (unavailable) {
    return (
      <div className="content-scroll">
        {header}
        <div className="notice-box" style={{ marginBottom: 18 }}>
          私人雷达需要登录，且账号需有一定听歌记录才能生成。
        </div>
        <div className="empty">
          <div className="empty-icon">
            <IconRadar size={34} />
          </div>
          <div>雷达暂时没有捕捉到信号</div>
          <div className="small" style={{ maxWidth: 380, lineHeight: 1.8 }}>
            先去多听几首歌，让云娘更了解你的口味；雷达歌单每天更新，明天再来看看吧。
          </div>
          <button className="btn primary" style={{ marginTop: 6 }} onClick={load}>
            重新扫描
          </button>
        </div>
      </div>
    )
  }

  if (!playlist) {
    return (
      <div className="content-scroll">
        {header}
        <div className="error-box">私人雷达暂不可用</div>
        <button className="btn" onClick={load}>重试</button>
      </div>
    )
  }

  return (
    <div className="content-scroll">
      {header}

      {/* 雷达歌单信息 */}
      <div
        style={{
          display: 'flex',
          gap: 22,
          alignItems: 'flex-start',
          marginBottom: 24,
          padding: 16,
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-1)',
          border: '1px solid var(--border)',
        }}
      >
        <div style={{ position: 'relative', flex: '0 0 auto' }}>
          <img
            src={ncm.coverUrl(cover, 300)}
            alt=""
            style={{
              width: 168,
              height: 168,
              borderRadius: 'var(--radius-lg)',
              objectFit: 'cover',
              background: 'var(--bg-3)',
              display: 'block',
              boxShadow: '0 4px 20px rgba(0,0,0,0.45)',
            }}
          />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              color: 'var(--accent)',
              border: '1px solid var(--accent)',
              borderRadius: 4,
              padding: '1px 6px',
              marginBottom: 9,
            }}
          >
            <IconRadar size={12} />
            每日更新
          </div>

          <h2 style={{ fontSize: 20, fontWeight: 620, marginBottom: 8, lineHeight: 1.35 }}>
            {playlist.name || '私人雷达'}
          </h2>

          <div
            style={{
              fontSize: 12.5,
              color: 'var(--text-2)',
              lineHeight: 1.75,
              maxHeight: 66,
              overflow: 'hidden',
              marginBottom: 12,
            }}
          >
            {desc}
          </div>

          <div className="row" style={{ gap: 16, fontSize: 12, color: 'var(--text-3)', marginBottom: 14 }}>
            <span>共 {tracks.length} 首</span>
            {ncm.getPlayCount(playlist) > 0 ? <span>播放 {ncm.formatCount(ncm.getPlayCount(playlist))}</span> : null}
            {playlist.creator?.nickname ? <span>by {playlist.creator.nickname}</span> : null}
          </div>

          <div className="row" style={{ gap: 10 }}>
            <button className="btn primary" onClick={() => playQueue(tracks, 0)}>
              <IconPlay size={14} />
              <span style={{ marginLeft: 6 }}>播放全部</span>
            </button>
            <button
              className="btn ghost"
              onClick={() => tracks.forEach((t) => addToQueue(t))}
            >
              加入队列
            </button>
          </div>
        </div>
      </div>

      {/* 歌曲列表 */}
      <div className="section-title">雷达捕捉到的歌</div>
      <SongList
        songs={tracks}
        currentId={currentId}
        likedIds={likedIds}
        onPlay={(_song, i) => playQueue(tracks, i)}
        onLike={(song) => toggleLike(song.id).catch(() => {})}
        onAddQueue={addToQueue}
        onContextMenu={showMenu}
        emptyText="雷达暂时没有捕捉到歌曲"
      />
    </div>
  )
}
