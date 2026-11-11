import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Playlist } from '@/types'
import * as ncm from '@/api/ncm'
import { IconPlay } from '@/components/Icons'
import { usePlayer } from '@/store/player'

/** 封面地址兜底：无图时返回 undefined，避免空 src 触发无效请求 */
function cover(src?: string, size = 300): string | undefined {
  return src ? ncm.coverUrl(src, size) : undefined
}

const PAGE_SIZE = 30
const CAT_PREVIEW = 24

type Order = 'hot' | 'new'

function CardGrid({
  list,
  onOpen,
  onPlay,
}: {
  list: Playlist[]
  onOpen: (p: Playlist) => void
  onPlay: (p: Playlist) => void
}) {
  return (
    <div className="grid-cards">
      {list.map((p) => (
        <div className="card" key={`${p.id}-${p.name}`} onClick={() => onOpen(p)}>
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
                onPlay(p)
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
  )
}

export function PlaylistSquarePage() {
  const navigate = useNavigate()
  const { playQueue } = usePlayer()

  const [cats, setCats] = useState<string[]>(['全部'])
  const [cat, setCat] = useState('全部')
  const [showAllCats, setShowAllCats] = useState(false)
  const [order, setOrder] = useState<Order>('hot')

  const [list, setList] = useState<Playlist[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const [hint, setHint] = useState<string | null>(null)

  const [highQuality, setHighQuality] = useState<Playlist[]>([])
  const [hqLoading, setHqLoading] = useState(true)

  const seq = useRef(0)
  // 已请求过的条目数（不能用 list.length，去重后它会比实际 offset 小）
  const fetched = useRef(0)

  // 分类
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const subs: any[] = await ncm.playlistCatlist()
        const names = subs
          .map((s) => (typeof s === 'string' ? s : s?.name))
          .filter((x): x is string => typeof x === 'string' && x.trim() !== '')
        if (!alive) return
        const uniq = Array.from(new Set(names))
        const withAll = uniq.includes('全部') ? uniq : ['全部', ...uniq]
        setCats(withAll)
      } catch (e) {
        // 分类失败时只保留「全部」
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  // 列表
  useEffect(() => {
    void loadFirst()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat, order])

  // 精品歌单（随分类变化）
  useEffect(() => {
    let alive = true
    setHqLoading(true)
    ;(async () => {
      try {
        const q = await ncm.highqualityPlaylist(cat, 12)
        if (alive) setHighQuality(q)
      } catch (e) {
        if (alive) setHighQuality([])
      } finally {
        if (alive) setHqLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [cat])

  useEffect(() => {
    if (!hint) return
    const t = setTimeout(() => setHint(null), 2600)
    return () => clearTimeout(t)
  }, [hint])

  useEffect(() => {
    return () => {
      seq.current++
    }
  }, [])

  async function loadFirst() {
    const my = ++seq.current
    setLoading(true)
    setError(null)
    setList([])
    setHasMore(true)
    fetched.current = 0
    try {
      const page = await ncm.topPlaylist(cat, order, PAGE_SIZE, 0)
      if (my !== seq.current) return
      fetched.current = page.length
      setList(page)
      setHasMore(page.length >= PAGE_SIZE)
    } catch (e: any) {
      if (my !== seq.current) return
      setError(e?.message || '歌单加载失败，请稍后重试')
      setHasMore(false)
    } finally {
      if (my === seq.current) setLoading(false)
    }
  }

  async function loadMore() {
    if (loading || loadingMore || !hasMore) return
    const my = seq.current
    setLoadingMore(true)
    try {
      const page = await ncm.topPlaylist(cat, order, PAGE_SIZE, fetched.current)
      if (my !== seq.current) return
      if (!page.length) {
        setHasMore(false)
        return
      }
      fetched.current += page.length
      setList((prev) => {
        const seen = new Set(prev.map((p) => p.id))
        return [...prev, ...page.filter((p) => !seen.has(p.id))]
      })
      setHasMore(page.length >= PAGE_SIZE)
    } catch (e: any) {
      if (my === seq.current) setHint(e?.message || '加载更多失败')
    } finally {
      if (my === seq.current) setLoadingMore(false)
    }
  }

  async function playPlaylist(p: Playlist) {
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

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) loadMore()
  }

  const visibleCats = showAllCats ? cats : cats.slice(0, CAT_PREVIEW)
  const hiddenCount = Math.max(0, cats.length - CAT_PREVIEW)

  return (
    <div className="content-scroll" onScroll={onScroll}>
      <div className="page-header">
        <h1 className="page-title">歌单广场</h1>
        <span className="page-sub">按心情与场景，找到适合此刻的歌单</span>
      </div>

      {/* 分类 */}
      <div style={{ marginBottom: 14 }}>
        <div className="row" style={{ marginBottom: 9 }}>
          <span className="small muted">分类</span>
          <span className="small" style={{ color: 'var(--text-3)' }}>
            共 {cats.length} 个
          </span>
        </div>
        <div className="tabs" style={{ marginBottom: 0 }}>
          {visibleCats.map((c) => (
            <button
              key={c}
              className={`chip ${cat === c ? 'active' : ''}`}
              onClick={() => {
                if (c === cat) return
                setCat(c)
                setShowAllCats(false)
              }}
            >
              {c}
            </button>
          ))}
          {cats.length > CAT_PREVIEW && (
            <button
              className="chip"
              style={{ border: '1px dashed var(--border-light)' }}
              onClick={() => setShowAllCats((v) => !v)}
            >
              {showAllCats ? '收起' : `更多（+${hiddenCount}）`}
            </button>
          )}
        </div>
      </div>

      {/* 排序 */}
      <div className="row-between" style={{ marginBottom: 18 }}>
        <div className="row" style={{ gap: 6 }}>
          <button
            className={`chip ${order === 'hot' ? 'active' : ''}`}
            onClick={() => setOrder('hot')}
          >
            最热
          </button>
          <button
            className={`chip ${order === 'new' ? 'active' : ''}`}
            onClick={() => setOrder('new')}
          >
            最新
          </button>
        </div>
        <span className="small muted">当前：{cat}</span>
      </div>

      {hint && (
        <div className="notice-box" style={{ marginBottom: 14 }}>
          {hint}
        </div>
      )}

      {/* 精品歌单 */}
      {!error && (hqLoading || highQuality.length > 0) && (
        <div style={{ marginBottom: 26 }}>
          <div className="section-title">
            精品歌单
            <span className="more" style={{ cursor: 'default' }}>
              {cat}
            </span>
          </div>
          {hqLoading ? (
            <div className="loading-wrap" style={{ padding: '18px 0' }}>
              <div className="spinner" />
              <div>加载精品歌单…</div>
            </div>
          ) : (
            <CardGrid
              list={highQuality}
              onOpen={(p) => navigate(`/playlist/${p.id}`)}
              onPlay={(p) => void playPlaylist(p)}
            />
          )}
        </div>
      )}

      {/* 主列表 */}
      <div className="section-title">全部歌单</div>

      {loading ? (
        <div className="loading-wrap">
          <div className="spinner" />
          <div>加载中…</div>
        </div>
      ) : error ? (
        <div>
          <div className="error-box">{error}</div>
          <div style={{ marginTop: 12 }}>
            <button className="btn" onClick={loadFirst}>
              重试
            </button>
          </div>
        </div>
      ) : list.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">♪</div>
          该分类暂无歌单，换一个分类看看吧
        </div>
      ) : (
        <>
          <CardGrid
            list={list}
            onOpen={(p) => navigate(`/playlist/${p.id}`)}
            onPlay={(p) => void playPlaylist(p)}
          />
          <div
            style={{
              marginTop: 20,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
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
        </>
      )}
    </div>
  )
}
