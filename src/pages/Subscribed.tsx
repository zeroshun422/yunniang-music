import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Playlist } from '@/types'
import * as ncm from '@/api/ncm'
import { useAuth } from '@/store/auth'
import { usePlayer } from '@/store/player'
import { IconStar, IconFolder, IconSearch, IconPlay, IconMusic, IconClose } from '@/components/Icons'

type Tab = 'subscribed' | 'created'

const collator = new Intl.Collator('zh-Hans-CN', { sensitivity: 'base', numeric: true })

export function SubscribedPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [list, setList] = useState<Playlist[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('subscribed')
  const [keyword, setKeyword] = useState('')
  const [sortByName, setSortByName] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [hoverId, setHoverId] = useState<number | null>(null)

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
      const all = await ncm.userSubscribedPlaylists(uid)
      setList(all)
    } catch (e: any) {
      setError(e?.message || '加载歌单失败')
    } finally {
      setLoading(false)
    }
  }

  const created = useMemo(() => list.filter((p) => p.creator?.userId === uid), [list, uid])
  const subscribed = useMemo(() => list.filter((p) => p.creator?.userId !== uid), [list, uid])

  const base = tab === 'subscribed' ? subscribed : created

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    let arr = base
    if (kw) arr = arr.filter((p) => (p.name || '').toLowerCase().includes(kw) || (p.creator?.nickname || '').toLowerCase().includes(kw))
    if (sortByName) arr = [...arr].sort((a, b) => collator.compare(a.name || '', b.name || ''))
    return arr
  }, [base, keyword, sortByName])

  const unsubscribe = async (p: Playlist) => {
    if (busyId !== null) return
    const ok = window.confirm(`确定要取消收藏「${p.name}」吗？`)
    if (!ok) return
    setBusyId(p.id)
    try {
      await ncm.subscribePlaylist(p.id, false)
      setList((prev) => prev.filter((x) => x.id !== p.id))
    } catch (e: any) {
      setError('取消收藏失败：' + (e?.message || '未知错误'))
    } finally {
      setBusyId(null)
    }
  }

  const playFirst = async (e: React.MouseEvent, p: Playlist) => {
    e.stopPropagation()
    try {
      const tracks = await ncm.playlistTrackAll(p.id, 1000)
      if (!tracks.length) {
        setError(`「${p.name}」里还没有歌曲`)
        return
      }
      const { playQueue } = usePlayer.getState()
      await playQueue(tracks, 0)
    } catch (err: any) {
      setError('播放失败：' + (err?.message || '未知错误'))
    }
  }

  const header = (
    <div className="page-header">
      <h1 className="page-title">收藏的歌单</h1>
      <span className="page-sub">
        {loading
          ? '正在同步…'
          : `收藏 ${subscribed.length} 个 · 创建 ${created.length} 个`}
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
        <div className="notice-box">需要登录后才能查看收藏的歌单。</div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="content-scroll">
        {header}
        <div className="loading-wrap">
          <div className="spinner" />
          <div>正在同步歌单…</div>
        </div>
      </div>
    )
  }

  if (error && !list.length) {
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

      <div className="tabs">
        <button
          className={`chip ${tab === 'subscribed' ? 'active' : ''}`}
          onClick={() => setTab('subscribed')}
        >
          <span className="row" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <IconStar size={14} /> 收藏的歌单 ({subscribed.length})
          </span>
        </button>
        <button
          className={`chip ${tab === 'created' ? 'active' : ''}`}
          onClick={() => setTab('created')}
        >
          <span className="row" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <IconFolder size={14} /> 创建的歌单 ({created.length})
          </span>
        </button>
      </div>

      <div className="toolbar">
        <div className="search-input-wrap" style={{ width: 250 }}>
          <IconSearch size={15} />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索歌单名称"
          />
        </div>
        <button
          className={`chip ${sortByName ? 'active' : ''}`}
          onClick={() => setSortByName((v) => !v)}
          title="切换按名称排序"
        >
          按名称排序
        </button>
        {keyword && <button className="btn sm ghost" onClick={() => setKeyword('')}>清除</button>}
        <span className="small muted" style={{ marginLeft: 'auto' }}>{filtered.length} 个歌单</span>
      </div>

      {error && <div className="error-box" style={{ marginBottom: 14 }}>{error}</div>}

      {!base.length ? (
        <div className="empty">
          <div className="empty-icon">{tab === 'subscribed' ? '☆' : '⌘'}</div>
          {tab === 'subscribed' ? '还没有收藏的歌单' : '还没有创建的歌单'}
          <div className="small" style={{ color: 'var(--text-3)' }}>
            {tab === 'subscribed'
              ? '在歌单广场遇到喜欢的歌单，点收藏就会出现在这里'
              : '在网易云客户端创建歌单后会同步到这里'}
          </div>
        </div>
      ) : !filtered.length ? (
        <div className="empty">
          <div className="empty-icon">♪</div>
          没有匹配「{keyword}」的歌单
        </div>
      ) : (
        <div className="grid-cards">
          {filtered.map((p) => {
            const isOwn = p.creator?.userId === uid
            const cover = ncm.coverUrl(p.coverImgUrl || p.picUrl, 300)
            const busy = busyId === p.id
            return (
              <div
                className="card"
                key={p.id}
                onClick={() => navigate(`/playlist/${p.id}`)}
                onMouseEnter={() => setHoverId(p.id)}
                onMouseLeave={() => setHoverId(null)}
                style={{ opacity: busy ? 0.5 : 1 }}
                title={p.name}
              >
                <div className="card-cover-wrap">
                  {cover ? (
                    <img className="card-cover" src={cover} alt="" loading="lazy" />
                  ) : (
                    <div
                      className="card-cover"
                      style={{ display: 'grid', placeItems: 'center', color: 'var(--text-3)' }}
                    >
                      <IconMusic size={34} />
                    </div>
                  )}
                  <button
                    className="card-play"
                    title="播放这个歌单"
                    onClick={(e) => void playFirst(e, p)}
                  >
                    <IconPlay size={15} />
                  </button>
                  {!isOwn && (
                    <button
                      title="取消收藏"
                      onClick={(e) => { e.stopPropagation(); void unsubscribe(p) }}
                      disabled={busy}
                      style={{
                        position: 'absolute',
                        left: 9,
                        top: 9,
                        width: 26,
                        height: 26,
                        borderRadius: '50%',
                        background: 'var(--fixed-media-scrim)',
                        color: 'var(--fixed-on-media)',
                        display: 'grid',
                        placeItems: 'center',
                        opacity: hoverId === p.id ? 1 : 0,
                        transition: '0.16s',
                        pointerEvents: hoverId === p.id ? 'auto' : 'none',
                      }}
                    >
                      <IconClose size={13} />
                    </button>
                  )}
                </div>
                <div className="card-title">{p.name}</div>
                <div className="card-sub">
                  {p.trackCount ?? 0} 首
                  {p.creator?.nickname ? ` · ${p.creator.nickname}` : ''}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
