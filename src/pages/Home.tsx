import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as ncm from '@/api/ncm'
import type { Song, Playlist } from '@/types'
import { useAuth } from '@/store/auth'
import { usePlayer } from '@/store/player'
import { IconPlay } from '@/components/Icons'

/** /personalized/newsong 的单条结构 */
interface NewSongItem {
  id: number
  name: string
  picUrl?: string
  song?: Song
}

const WEEK = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

function greeting(): string {
  const h = new Date().getHours()
  if (h < 5) return '夜深了'
  if (h < 11) return '早上好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
}

function todayText(): string {
  const d = new Date()
  return `${d.getMonth() + 1}月${d.getDate()}日 ${WEEK[d.getDay()]}`
}

/** 把 newsong 条目归一化成可播放的 Song */
function toSong(item: NewSongItem): Song | null {
  if (item && item.song && typeof item.song.id === 'number') return item.song
  if (!item || typeof item.id !== 'number') return null
  return {
    id: item.id,
    name: item.name || '未知歌曲',
    al: { id: 0, name: '', picUrl: item.picUrl },
  }
}

export function HomePage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { playQueue } = usePlayer()

  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [newSongs, setNewSongs] = useState<Song[]>([])
  const [newSongPics, setNewSongPics] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [playlistErr, setPlaylistErr] = useState<string | null>(null)
  const [newSongErr, setNewSongErr] = useState<string | null>(null)
  const [playingId, setPlayingId] = useState<number | null>(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    setError(null)
    setPlaylistErr(null)
    setNewSongErr(null)

    const [plRes, nsRes] = await Promise.allSettled([
      ncm.recommendResource(),
      ncm.api<any>('/personalized/newsong?limit=12'),
    ])

    // 推荐歌单
    if (plRes.status === 'fulfilled') {
      setPlaylists(plRes.value || [])
    } else {
      setPlaylists([])
      setPlaylistErr((plRes.reason && plRes.reason.message) || '推荐歌单加载失败')
    }

    // 最新音乐
    if (nsRes.status === 'fulfilled') {
      const result: NewSongItem[] = ((nsRes.value && nsRes.value.result) || []) as NewSongItem[]
      const songs: Song[] = []
      const pics: Record<number, string> = {}
      for (const it of result) {
        const s = toSong(it)
        if (!s) continue
        songs.push(s)
        const pic = it.picUrl || s.al?.picUrl
        if (pic) pics[s.id] = pic
      }
      setNewSongs(songs)
      setNewSongPics(pics)
    } else {
      setNewSongs([])
      setNewSongPics({})
      setNewSongErr((nsRes.reason && nsRes.reason.message) || '最新音乐加载失败')
    }

    // 两个区块都失败时，整页报错
    if (plRes.status === 'rejected' && nsRes.status === 'rejected') {
      setError(
        (plRes.reason && plRes.reason.message) || (nsRes.reason && nsRes.reason.message) || '加载失败'
      )
    }

    setLoading(false)
  }

  async function playPlaylist(p: Playlist) {
    if (playingId === p.id) return
    setPlayingId(p.id)
    try {
      const tracks = await ncm.playlistTrackAll(p.id, 500)
      if (tracks.length) await playQueue(tracks, 0)
    } catch (e) {
      // 单曲失败不阻断整页，交给播放器错误提示
    } finally {
      setPlayingId(null)
    }
  }

  if (loading) {
    return (
      <div className="content-scroll">
        <div className="loading-wrap">
          <div className="spinner" />
          <div>正在为你准备推荐…</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="content-scroll">
        <div className="page-header">
          <h1 className="page-title">发现音乐</h1>
          <span className="page-sub">{todayText()}</span>
        </div>
        <div className="error-box">{error}</div>
        <button className="btn" onClick={load}>重试</button>
      </div>
    )
  }

  const nickname = user?.nickname || '朋友'

  return (
    <div className="content-scroll">
      {/* 欢迎区 */}
      <div className="page-header" style={{ marginBottom: 8 }}>
        <h1 className="page-title">
          {greeting()}，{nickname}
        </h1>
        <span className="page-sub">{todayText()}</span>
      </div>
      <div
        style={{
          fontSize: 12.5,
          color: 'var(--text-2)',
          marginBottom: 26,
        }}
      >
        今天想听点什么？这里有你可能喜欢的歌单和新歌。
      </div>

      {/* 推荐歌单 */}
      <section className="hero-section">
        <div className="section-title">
          推荐歌单
          <span className="more" onClick={() => navigate('/square')}>更多 ›</span>
        </div>

        {playlistErr ? (
          <div className="error-box">
            {playlistErr}
            <button
              className="btn sm"
              style={{ marginLeft: 10 }}
              onClick={load}
            >
              重试
            </button>
          </div>
        ) : playlists.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">♪</div>
            暂无推荐歌单
          </div>
        ) : (
          <div className="grid-cards">
            {playlists.map((p) => (
              <div className="card" key={p.id} onClick={() => navigate(`/playlist/${p.id}`)}>
                <div className="card-cover-wrap">
                  <img
                    className="card-cover"
                    src={ncm.coverUrl(p.coverImgUrl || p.picUrl, 300)}
                    alt=""
                  />
                  <button
                    className="card-play"
                    title="播放该歌单"
                    onClick={(e) => {
                      e.stopPropagation()
                      playPlaylist(p)
                    }}
                  >
                    <IconPlay size={15} />
                  </button>
                </div>
                <div className="card-title">{p.name}</div>
                <div className="card-sub">
                  {playingId === p.id
                    ? '正在加载…'
                    : `播放 ${ncm.formatCount(ncm.getPlayCount(p))} · ${p.trackCount || 0} 首`}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 最新音乐 */}
      <section>
        <div className="section-title">
          最新音乐
          <span className="more" onClick={() => navigate('/rank')}>更多 ›</span>
        </div>

        {newSongErr ? (
          <div className="error-box">
            {newSongErr}
            <button className="btn sm" style={{ marginLeft: 10 }} onClick={load}>
              重试
            </button>
          </div>
        ) : newSongs.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">♪</div>
            暂无新歌推荐
          </div>
        ) : (
          <div className="grid-cards">
            {newSongs.map((s, i) => {
              const artists = (s.ar || s.artists || []).map((a) => a.name).join(' / ') || '未知歌手'
              const cover = newSongPics[s.id] || s.al?.picUrl
              const album = s.al?.name || s.album?.name || ''
              return (
                <div
                  className="card"
                  key={s.id}
                  title={`${s.name} - ${artists}`}
                  onClick={() => playQueue(newSongs, i)}
                >
                  <div className="card-cover-wrap">
                    <img className="card-cover" src={ncm.coverUrl(cover, 300)} alt="" />
                    <button
                      className="card-play"
                      title="播放"
                      onClick={(e) => {
                        e.stopPropagation()
                        playQueue(newSongs, i)
                      }}
                    >
                      <IconPlay size={15} />
                    </button>
                  </div>
                  <div className="card-title">{s.name}</div>
                  <div className="card-sub">{artists}</div>
                  {album && (
                    <div className="card-sub" style={{ color: 'var(--text-3)' }}>{album}</div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
