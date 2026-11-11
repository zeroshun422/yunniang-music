import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Song } from '@/types'
import * as ncm from '@/api/ncm'
import { SongList } from '@/components/SongRow'
import { IconSearch, IconClose, IconPlay } from '@/components/Icons'
import { usePlayer } from '@/store/player'
import { useLibrary } from '@/store/library'
import { useSongMenu } from '@/components/SongContextMenu'

/** 封面地址兜底：无图时返回 undefined，避免空 src 触发无效请求 */
function cover(src?: string, size = 300): string | undefined {
  return src ? ncm.coverUrl(src, size) : undefined
}

const PAGE_SIZE = 30

// 各搜索类型的结果字段名 / 总数统计字段名
const RESULT_KEY: Record<number, string> = {
  1: 'songs',
  1000: 'playlists',
  100: 'artists',
  10: 'albums',
  1002: 'userprofiles',
  1009: 'djRadios',
  1004: 'mvs',
}
const COUNT_KEY: Record<number, string> = {
  1: 'songCount',
  1000: 'playlistCount',
  100: 'artistCount',
  10: 'albumCount',
  1002: 'userprofileCount',
  1009: 'djRadiosCount',
  1004: 'mvCount',
}

function pickList(result: any, type: number): any[] {
  const key = RESULT_KEY[type]
  if (!key) return []
  const list = result?.[key]
  return Array.isArray(list) ? list : []
}

export function SearchPage() {
  const navigate = useNavigate()
  const { playQueue, addToQueue, queue, currentIndex } = usePlayer()
  const { likedIds, toggleLike } = useLibrary()

  const [kw, setKw] = useState('')
  const [query, setQuery] = useState('') // 已提交的关键词
  const [type, setType] = useState<number>(1)
  const [items, setItems] = useState<any[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)

  const [hots, setHots] = useState<string[]>([])
  const [hotLoading, setHotLoading] = useState(true)

  const seq = useRef(0)

  // 热搜
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const r: any = await ncm.hotSearch()
        const raw: any[] = (r?.result?.hots || r?.hots || r?.data || []) as any[]
        const names = raw
          .map((h) =>
            typeof h === 'string' ? h : h?.first || h?.keyword || h?.searchWord || ''
          )
          .filter((x): x is string => typeof x === 'string' && x.trim() !== '')
        if (alive) setHots(Array.from(new Set(names)).slice(0, 20))
      } catch (e) {
        // 热搜失败不影响主流程
      } finally {
        if (alive) setHotLoading(false)
      }
    })()
    return () => {
      alive = false
      seq.current++
    }
  }, [])

  // 提示自动消失
  useEffect(() => {
    if (!hint) return
    const t = setTimeout(() => setHint(null), 2600)
    return () => clearTimeout(t)
  }, [hint])

  async function fetchPage(q: string, tp: number, offset: number, append: boolean) {
    const my = ++seq.current
    if (append) setLoadingMore(true)
    else {
      setLoading(true)
      setError(null)
    }
    try {
      const r = await ncm.search(q, tp, PAGE_SIZE, offset)
      if (my !== seq.current) return
      const result: any = (r && (r as any).result) || {}
      const list = pickList(result, tp)
      setItems((prev) => (append ? [...prev, ...list] : list))

      // 只认「当前搜索类型」对应的计数字段，避免串到其它类型
      const ownKey = COUNT_KEY[tp]
      const ownCount =
        (typeof result[ownKey] === 'number' ? result[ownKey] : undefined) ??
        (typeof (r as any)[ownKey] === 'number' ? (r as any)[ownKey] : undefined)
      // 接口未返回总数时，若本页已满则视为还有更多，用 null 让 UI 不显示具体数字
      setTotal(typeof ownCount === 'number' ? ownCount : null)

      const more =
        typeof result.hasMore === 'boolean' ? result.hasMore : list.length >= PAGE_SIZE
      setHasMore(more)
    } catch (e: any) {
      if (my !== seq.current) return
      if (append) setHint(e?.message || '加载更多失败')
      else {
        setError(e?.message || '搜索失败，请稍后重试')
        setItems([])
        setTotal(null)
        setHasMore(false)
      }
    } finally {
      if (my === seq.current) {
        setLoading(false)
        setLoadingMore(false)
      }
    }
  }

  function runSearch(raw: string, tp: number) {
    const q = raw.trim()
    if (!q) return
    setKw(q)
    setQuery(q)
    setItems([])
    setTotal(null)
    setHasMore(false)
    void fetchPage(q, tp, 0, false)
  }

  function changeType(tp: number) {
    if (tp === type) return
    setType(tp)
    if (query) {
      setItems([])
      setTotal(null)
      setHasMore(false)
      void fetchPage(query, tp, 0, false)
    }
  }

  function loadMore() {
    if (!query || loading || loadingMore || !hasMore) return
    void fetchPage(query, type, items.length, true)
  }

  async function playPlaylist(p: any) {
    try {
      const tracks = await ncm.playlistTrackAll(p.id, 200)
      if (!tracks.length) {
        setHint('该歌单暂无可用歌曲')
        return
      }
      await playQueue(tracks, 0)
    } catch (e: any) {
      setHint(e?.message || '播放失败')
    }
  }

  const activeLabel =
    ncm.SEARCH_TYPES.find((t) => t.type === type)?.label ?? '单曲'

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 180) loadMore()
  }

  return (
    <div className="content-scroll" onScroll={onScroll}>
      <div className="page-header">
        <h1 className="page-title">搜索</h1>
        <span className="page-sub">歌曲 · 歌单 · 歌手 · 专辑 · 用户 · 电台 · MV</span>
      </div>

      <div className="toolbar">
        <div className="search-input-wrap" style={{ flex: 1, maxWidth: 560 }}>
          <IconSearch size={16} />
          <input
            value={kw}
            placeholder="搜索歌曲、歌单、歌手、专辑…"
            onChange={(e) => setKw(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') runSearch(kw, type)
              if (e.key === 'Escape') {
                setKw('')
                setQuery('')
                setItems([])
                setTotal(null)
              }
            }}
          />
          {kw && (
            <button
              title="清空"
              style={{ display: 'flex', color: 'var(--text-3)' }}
              onClick={() => {
                setKw('')
                setQuery('')
                setItems([])
                setTotal(null)
                setHasMore(false)
              }}
            >
              <IconClose size={14} />
            </button>
          )}
        </div>
        <button
          className="btn primary"
          disabled={!kw.trim() || loading}
          onClick={() => runSearch(kw, type)}
        >
          <IconSearch size={14} /> 搜索
        </button>
      </div>

      <div className="tabs">
        {ncm.SEARCH_TYPES.map((t) => (
          <button
            key={t.type}
            className={`chip ${type === t.type ? 'active' : ''}`}
            onClick={() => changeType(t.type)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {hint && (
        <div className="notice-box" style={{ marginBottom: 14 }}>
          {hint}
        </div>
      )}

      {!query ? (
        hotLoading ? (
          <div className="loading-wrap">
            <div className="spinner" />
            <div>正在获取热搜…</div>
          </div>
        ) : hots.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">♪</div>
            暂无热搜，试试直接搜索吧
          </div>
        ) : (
          <div>
            <div className="section-title">热搜榜</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {hots.map((h, i) => (
                <button
                  key={h}
                  className="chip"
                  onClick={() => runSearch(h, type)}
                  title={`搜索「${h}」`}
                >
                  <span
                    style={{
                      color: i < 3 ? 'var(--accent)' : 'var(--text-3)',
                      marginRight: 7,
                      fontWeight: i < 3 ? 600 : 400,
                    }}
                  >
                    {i + 1}
                  </span>
                  {h}
                </button>
              ))}
            </div>
          </div>
        )
      ) : loading ? (
        <div className="loading-wrap">
          <div className="spinner" />
          <div>搜索中…</div>
        </div>
      ) : error ? (
        <div>
          <div className="error-box">{error}</div>
          <div style={{ marginTop: 12 }}>
            <button className="btn" onClick={() => fetchPage(query, type, 0, false)}>
              重试
            </button>
          </div>
        </div>
      ) : items.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">♪</div>
          没有找到「{query}」的{activeLabel}结果
        </div>
      ) : (
        <div>
          <div className="search-meta">
            「{query}」
            {total !== null
              ? ` 共找到 ${ncm.formatCount(total)} 个${activeLabel}结果`
              : ` 的${activeLabel}结果`}
          </div>

          {type === 1 && (
            <SongList
              songs={items as Song[]}
              currentId={queue[currentIndex]?.id}
              likedIds={likedIds}
              onPlay={(_song, i) => {
                void playQueue(items as Song[], i)
              }}
              onLike={(song) => {
                toggleLike(song.id).catch(() => {})
              }}
              onAddQueue={addToQueue}
              onContextMenu={(e: React.MouseEvent, song) => {
                useSongMenu.getState().show(e.clientX, e.clientY, song)
              }}
            />
          )}

          {type === 1000 && (
            <div className="grid-cards">
              {items.map((p) => (
                <div
                  className="card"
                  key={p.id}
                  onClick={() => navigate(`/playlist/${p.id}`)}
                >
                  <div className="card-cover-wrap">
                    <img
                      className="card-cover"
                      src={cover(p.coverImgUrl || p.picUrl, 300)}
                      alt=""
                      loading="lazy"
                    />
                    <button
                      className="card-play"
                      title="播放该歌单"
                      onClick={(e) => {
                        e.stopPropagation()
                        void playPlaylist(p)
                      }}
                    >
                      <IconPlay size={15} />
                    </button>
                  </div>
                  <div className="card-title">{p.name}</div>
                  <div className="card-sub">
                    {ncm.formatCount(ncm.getPlayCount(p))} 次播放
                    {p.creator?.nickname ? ` · ${p.creator.nickname}` : ''}
                  </div>
                </div>
              ))}
            </div>
          )}

          {type === 100 && (
            <div className="grid-cards">
              {items.map((a) => (
                <div
                  className="card"
                  key={a.id}
                  onClick={() => navigate(`/artist/${a.id}`)}
                  title={`查看歌手「${a.name}」`}
                >
                  <div className="card-cover-wrap">
                    <img
                      className="card-cover"
                      style={{ borderRadius: '50%' }}
                      src={cover(a.img1v1Url || a.picUrl, 300)}
                      alt=""
                      loading="lazy"
                    />
                  </div>
                  <div className="card-title" style={{ textAlign: 'center' }}>
                    {a.name}
                  </div>
                  <div className="card-sub" style={{ textAlign: 'center' }}>
                    {Array.isArray(a.alias) && a.alias.length ? a.alias[0] : '歌手'}
                  </div>
                </div>
              ))}
            </div>
          )}

          {type === 10 && (
            <div className="grid-cards">
              {items.map((al) => (
                <div className="card" key={al.id} title={al.name}>
                  <div className="card-cover-wrap">
                    <img
                      className="card-cover"
                      src={cover(al.picUrl, 300)}
                      alt=""
                      loading="lazy"
                    />
                  </div>
                  <div className="card-title">{al.name}</div>
                  <div className="card-sub">
                    {(al.artists || []).map((x: any) => x.name).join(' / ') ||
                      '未知歌手'}
                  </div>
                </div>
              ))}
            </div>
          )}

          {type === 1002 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {items.map((u) => (
                <div
                  key={u.userId}
                  className="row"
                  style={{
                    padding: '8px 12px',
                    borderRadius: 'var(--radius)',
                    background: 'var(--bg-1)',
                  }}
                >
                  <img
                    src={cover(u.avatarUrl, 80)}
                    alt=""
                    loading="lazy"
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: '50%',
                      objectFit: 'cover',
                      background: 'var(--bg-3)',
                      flexShrink: 0,
                    }}
                  />
                  <div className="grow">
                    <div className="text-ellipsis">{u.nickname}</div>
                    <div className="small muted text-ellipsis">
                      {u.signature || '这个用户很懒，什么都没写'}
                    </div>
                  </div>
                  <span className="small muted">用户</span>
                </div>
              ))}
            </div>
          )}

          {(type === 1004 || type === 1009) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {items.map((m) => {
                const coverSrc = m.cover || m.picUrl || m.img1v1Url
                const name = m.name || m.radioName || '未命名'
                const sub =
                  type === 1004
                    ? m.artistName || (m.artists || []).map((x: any) => x.name).join(' / ')
                    : m.dj?.nickname || '电台'
                return (
                  <div
                    key={m.id}
                    className="row"
                    style={{
                      padding: '8px 12px',
                      borderRadius: 'var(--radius)',
                      background: 'var(--bg-1)',
                    }}
                  >
                    <img
                      src={cover(coverSrc, 90)}
                      alt=""
                      loading="lazy"
                      style={{
                        width: 46,
                        height: 46,
                        borderRadius: 'var(--radius)',
                        objectFit: 'cover',
                        background: 'var(--bg-3)',
                        flexShrink: 0,
                      }}
                    />
                    <div className="grow">
                      <div className="text-ellipsis">{name}</div>
                      <div className="small muted text-ellipsis">{sub}</div>
                    </div>
                    <span className="small muted">{type === 1004 ? 'MV' : '电台'}</span>
                  </div>
                )
              })}
            </div>
          )}

          <div
            style={{
              marginTop: 20,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 10,
              minHeight: 34,
            }}
          >
            {hasMore ? (
              <button className="btn" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? '加载中…' : '加载更多'}
              </button>
            ) : (
              <span className="small muted">已经到底啦</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
