import React, { useEffect, useRef, useState } from 'react'
import type { Song } from '@/types'
import * as ncm from '@/api/ncm'
import { SongList } from '@/components/SongRow'
import { IconPlay } from '@/components/Icons'
import { usePlayer } from '@/store/player'
import { useLibrary } from '@/store/library'
import { useSongMenu } from '@/components/SongContextMenu'

/** 封面地址兜底：无图时返回 undefined，避免空 src 触发无效请求 */
function cover(src?: string, size = 300): string | undefined {
  return src ? ncm.coverUrl(src, size) : undefined
}

interface RankItem {
  id: number
  name: string
  coverImgUrl?: string
  updateFrequency?: string
  trackCount?: number
  playCount?: number
  description?: string
}

export function RankPage() {
  const { playQueue, addToQueue, queue, currentIndex } = usePlayer()
  const { likedIds, toggleLike } = useLibrary()

  const [ranks, setRanks] = useState<RankItem[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [songs, setSongs] = useState<Song[]>([])
  const [rankLoading, setRankLoading] = useState(true)
  const [songLoading, setSongLoading] = useState(false)
  const [rankError, setRankError] = useState<string | null>(null)
  const [songError, setSongError] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)

  const songSeq = useRef(0)

  useEffect(() => {
    void loadRanks()
    return () => {
      songSeq.current++
    }
  }, [])

  useEffect(() => {
    if (!hint) return
    const t = setTimeout(() => setHint(null), 2600)
    return () => clearTimeout(t)
  }, [hint])

  async function loadRanks() {
    setRankLoading(true)
    setRankError(null)
    try {
      const raw: any[] = await ncm.toplist()
      const list: RankItem[] = raw
        .filter((r) => r && r.id && r.name)
        .map((r) => ({
          id: r.id,
          name: r.name,
          coverImgUrl: r.coverImgUrl,
          updateFrequency: r.updateFrequency,
          trackCount: r.trackCount,
          playCount: ncm.getPlayCount(r),
          description: r.description,
        }))
      setRanks(list)
      if (list.length) {
        const prev = activeId
        const keep = prev && list.some((x) => x.id === prev) ? prev : list[0].id
        setActiveId(keep)
        void loadSongs(keep)
      } else {
        setRankLoading(false)
      }
    } catch (e: any) {
      setRankError(e?.message || '排行榜加载失败，请稍后重试')
      setRankLoading(false)
    }
  }

  async function loadSongs(id: number) {
    const my = ++songSeq.current
    setSongLoading(true)
    setSongError(null)
    setSongs([])
    try {
      // 优先用完整歌曲列表接口，失败再退回榜单详情（tracks 可能为 null）
      let list: Song[] = []
      try {
        list = await ncm.playlistTrackAll(id)
      } catch (e) {
        list = []
      }
      if (!list.length) {
        const pl: any = await ncm.toplistDetail(id)
        list = (pl?.tracks || []) as Song[]
      }
      if (my !== songSeq.current) return
      setSongs(list)
    } catch (e: any) {
      if (my !== songSeq.current) return
      setSongError(e?.message || '歌曲列表加载失败')
    } finally {
      if (my === songSeq.current) {
        setSongLoading(false)
        setRankLoading(false)
      }
    }
  }

  function selectRank(id: number) {
    if (id === activeId) return
    setActiveId(id)
    void loadSongs(id)
  }

  const active = ranks.find((r) => r.id === activeId) || null

  if (rankLoading && !ranks.length) {
    return (
      <div className="content-scroll">
        <div className="page-header">
          <h1 className="page-title">排行榜</h1>
          <span className="page-sub">网易云官方榜单一览</span>
        </div>
        <div className="loading-wrap">
          <div className="spinner" />
          <div>加载榜单中…</div>
        </div>
      </div>
    )
  }

  if (rankError) {
    return (
      <div className="content-scroll">
        <div className="page-header">
          <h1 className="page-title">排行榜</h1>
          <span className="page-sub">网易云官方榜单一览</span>
        </div>
        <div className="error-box">{rankError}</div>
        <div style={{ marginTop: 12 }}>
          <button className="btn" onClick={loadRanks}>
            重试
          </button>
        </div>
      </div>
    )
  }

  if (!ranks.length) {
    return (
      <div className="content-scroll">
        <div className="page-header">
          <h1 className="page-title">排行榜</h1>
          <span className="page-sub">网易云官方榜单一览</span>
        </div>
        <div className="empty">
          <div className="empty-icon">♪</div>
          暂无可用榜单
        </div>
      </div>
    )
  }

  return (
    <div className="content-scroll">
      <div className="page-header">
        <h1 className="page-title">排行榜</h1>
        <span className="page-sub">共 {ranks.length} 个官方榜单</span>
      </div>

      {hint && (
        <div className="notice-box" style={{ marginBottom: 14 }}>
          {hint}
        </div>
      )}

      <div style={{ display: 'flex', gap: 22, alignItems: 'flex-start' }}>
        {/* 榜单选择 */}
        <div
          style={{
            width: 232,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            maxHeight: 'calc(100vh - 230px)',
            overflowY: 'auto',
            paddingRight: 4,
          }}
        >
          {ranks.map((r, i) => {
            const on = r.id === activeId
            return (
              <div
                key={r.id}
                onClick={() => selectRank(r.id)}
                title={r.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '7px 9px',
                  borderRadius: 'var(--radius)',
                  cursor: 'pointer',
                  background: on ? 'var(--bg-2)' : 'transparent',
                  transition: '0.14s',
                }}
              >
                <span
                  className="small"
                  style={{
                    width: 16,
                    textAlign: 'center',
                    color: on ? 'var(--accent)' : 'var(--text-3)',
                    flexShrink: 0,
                  }}
                >
                  {i + 1}
                </span>
                <img
                  src={cover(r.coverImgUrl, 90)}
                  alt=""
                  loading="lazy"
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 8,
                    objectFit: 'cover',
                    background: 'var(--bg-3)',
                    flexShrink: 0,
                  }}
                />
                <div className="grow">
                  <div
                    className="text-ellipsis"
                    style={{
                      fontSize: 13,
                      color: on ? 'var(--accent)' : 'var(--text-0)',
                    }}
                  >
                    {r.name}
                  </div>
                  <div className="small muted text-ellipsis">
                    {r.updateFrequency || '定期更新'}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* 榜单详情 */}
        <div className="grow" style={{ minWidth: 0 }}>
          {active && (
            <div className="row-between" style={{ marginBottom: 16, gap: 14 }}>
              <div className="row" style={{ gap: 14, minWidth: 0 }}>
                <img
                  src={cover(active.coverImgUrl, 160)}
                  alt=""
                  style={{
                    width: 78,
                    height: 78,
                    borderRadius: 'var(--radius-lg)',
                    objectFit: 'cover',
                    background: 'var(--bg-3)',
                    flexShrink: 0,
                    boxShadow: '0 3px 14px rgba(0,0,0,0.35)',
                  }}
                />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 600 }} className="text-ellipsis">
                    {active.name}
                  </div>
                  <div className="small muted" style={{ marginTop: 3 }}>
                    {active.updateFrequency || '定期更新'}
                    {songs.length ? ` · ${songs.length} 首` : ''}
                    {active.playCount ? ` · ${ncm.formatCount(active.playCount)} 次播放` : ''}
                  </div>
                </div>
              </div>
              <button
                className="btn primary"
                disabled={!songs.length || songLoading}
                onClick={() => {
                  if (!songs.length) return
                  void playQueue(songs, 0)
                  setHint(`开始播放「${active.name}」`)
                }}
              >
                <IconPlay size={14} /> 播放全部
              </button>
            </div>
          )}

          {songLoading ? (
            <div className="loading-wrap">
              <div className="spinner" />
              <div>加载歌曲中…</div>
            </div>
          ) : songError ? (
            <div>
              <div className="error-box">{songError}</div>
              <div style={{ marginTop: 12 }}>
                <button className="btn" onClick={() => activeId && loadSongs(activeId)}>
                  重试
                </button>
              </div>
            </div>
          ) : (
            <SongList
              songs={songs}
              currentId={queue[currentIndex]?.id}
              likedIds={likedIds}
              emptyText="该榜单暂无歌曲"
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
      </div>
    </div>
  )
}
