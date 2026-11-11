import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { Song } from '@/types'
import * as ncm from '@/api/ncm'
import { usePlayer } from '@/store/player'
import { useLibrary } from '@/store/library'
import { useAuth } from '@/store/auth'
import { SongList } from '@/components/SongRow'
import { useSongMenu } from '@/components/SongContextMenu'
import { IconPlay, IconHeart, IconNext, IconClose, IconRoam, IconMusic } from '@/components/Icons'

// 漫游模式
type FmMode = 'DEFAULT' | 'FAMILIAR' | 'EXPLORE' | 'SCENE_RCMD'

const MODES: { key: FmMode; label: string }[] = [
  { key: 'DEFAULT', label: '默认' },
  { key: 'FAMILIAR', label: '熟悉' },
  { key: 'EXPLORE', label: '探索' },
  { key: 'SCENE_RCMD', label: '场景推荐' },
]

const MODE_DESC: Record<FmMode, string> = {
  DEFAULT: '根据你的听歌口味均衡推荐',
  FAMILIAR: '多给你一些听过、熟悉的旋律',
  EXPLORE: '多推荐没听过的新歌，帮你发现音乐',
  SCENE_RCMD: '结合当前时段与场景的推荐',
}

function artistNames(s: Song) {
  const list = s.ar || s.artists || []
  return list.map((a) => a.name).join(' / ') || '未知歌手'
}

/** 拉取漫游歌曲：默认模式走 personalFm()，其它模式走 personalFmMode() */
async function fetchFm(mode: FmMode): Promise<Song[]> {
  if (mode === 'DEFAULT') {
    const list = await ncm.personalFm()
    if (list.length) return list
    return await ncm.personalFmMode('DEFAULT', 10)
  }
  return await ncm.personalFmMode(mode, 10)
}

export function RoamPage() {
  const { user } = useAuth()
  const { playSong, playQueue, addToQueue, queue, currentIndex } = usePlayer()
  const { likedIds, toggleLike, loadLikes } = useLibrary()

  const [mode, setMode] = useState<FmMode>('DEFAULT')
  const [tab, setTab] = useState<'single' | 'batch'>('single')

  // 单曲卡片模式
  const [songs, setSongs] = useState<Song[]>([])
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'next' | 'trash' | null>(null)

  // 批量模式
  const [batch, setBatch] = useState<Song[]>([])
  const [batchLoading, setBatchLoading] = useState(false)
  const [batchError, setBatchError] = useState<string | null>(null)

  const alive = useRef(true)
  const reqId = useRef(0)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  /** 首次进入 / 切换模式 / 重试：展示 loading */
  const loadCard = async (m: FmMode) => {
    const my = ++reqId.current
    setLoading(true)
    setError(null)
    try {
      const list = await fetchFm(m)
      if (!alive.current || my !== reqId.current) return
      if (!list.length) {
        setSongs([])
        setError('漫游暂时没有返回歌曲，可能听歌记录还太少，稍后再试试')
      } else {
        setSongs(list)
        setIndex(0)
      }
    } catch (e: any) {
      if (alive.current && my === reqId.current) setError(e?.message || '漫游加载失败')
    } finally {
      if (alive.current && my === reqId.current) setLoading(false)
    }
  }

  /** 换一首 / 不感兴趣：不整页 loading，只把卡片置灰 */
  const refreshQueue = async (m: FmMode, kind: 'next' | 'trash') => {
    const my = ++reqId.current
    setBusy(kind)
    setError(null)
    try {
      const list = await fetchFm(m)
      if (!alive.current || my !== reqId.current) return
      if (!list.length) {
        setError('没有拉到新的推荐，稍后再试')
      } else {
        setSongs(list)
        setIndex(0)
      }
    } catch (e: any) {
      if (alive.current && my === reqId.current) setError(e?.message || '换一首失败')
    } finally {
      if (alive.current && my === reqId.current) setBusy(null)
    }
  }

  const loadBatch = async (m: FmMode) => {
    setBatchLoading(true)
    setBatchError(null)
    try {
      const list = await ncm.personalFmMode(m, 10)
      if (!alive.current) return
      setBatch(list)
      if (!list.length) setBatchError('这批推荐是空的，换一批试试')
    } catch (e: any) {
      if (alive.current) setBatchError(e?.message || '批量推荐加载失败')
    } finally {
      if (alive.current) setBatchLoading(false)
    }
  }

  // 喜欢集合可能还没被别的页面加载过，这里兜底同步一次（用于红心状态显示）
  useEffect(() => {
    if (user && likedIds.size === 0) void loadLikes(user.userId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.userId])

  // 切换模式或切换展示方式时重新取数
  // 合并成单个 effect，避免 setBatch([]) 与取数判断读到同一轮渲染的旧值而漏拉
  const lastMode = useRef<FmMode | null>(null)
  useEffect(() => {
    const modeChanged = lastMode.current !== mode
    lastMode.current = mode

    if (tab === 'batch') {
      if (modeChanged) {
        // 换了模式：丢弃旧的批量结果并重新拉
        setBatch([])
        void loadBatch(mode)
      } else if (!batch.length) {
        // 首次切到批量页：按需拉取
        void loadBatch(mode)
      }
    } else {
      // 单曲模式：仅在没有卡片时补拉，切 tab 回来时保留当前这首歌
      if (!songs.length) void loadCard(mode)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, tab])

  const cur = songs[index]
  const rest = useMemo(() => songs.slice(index + 1, index + 6), [songs, index])
  const cover = cur ? ncm.songCoverUrl(cur, 400) : ''
  const currentId = queue[currentIndex]?.id
  const liked = cur ? likedIds.has(cur.id) : false

  const handleTrash = async () => {
    if (!cur) return
    try {
      await ncm.fmTrash(cur.id)
    } catch (e: any) {
      setError('操作失败：' + (e?.message || '未知错误'))
      return
    }
    await refreshQueue(mode, 'trash')
  }

  const handleLike = async () => {
    if (!cur) return
    try {
      await toggleLike(cur.id)
    } catch (e) {
      /* 忽略，store 已回滚 */
    }
  }

  return (
    <div className="content-scroll">
      <div className="page-header">
        <h1 className="page-title">私人漫游</h1>
        <span className="page-sub">
          {MODE_DESC[mode]} · 越听越懂你
        </span>
        <button
          className="btn sm ghost"
          style={{ marginLeft: 'auto' }}
          onClick={() => (tab === 'single' ? loadCard(mode) : loadBatch(mode))}
          disabled={tab === 'single' ? loading || !!busy : batchLoading}
        >
          {tab === 'single' ? '重新加载' : '换一批'}
        </button>
      </div>

      {!user && (
        <div className="notice-box" style={{ marginBottom: 16 }}>
          <IconRoam size={15} /> 私人漫游需要登录后使用，请先在设置中登录账号。
        </div>
      )}

      {/* 漫游模式 */}
      <div className="tabs">
        {MODES.map((m) => (
          <button
            key={m.key}
            className={`chip ${mode === m.key ? 'active' : ''}`}
            onClick={() => setMode(m.key)}
            title={MODE_DESC[m.key]}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* 展示方式 */}
      <div className="toolbar">
        <span className="small muted" style={{ marginRight: 2 }}>播放方式</span>
        <button className={`chip ${tab === 'single' ? 'active' : ''}`} onClick={() => setTab('single')}>
          单曲漫游
        </button>
        <button className={`chip ${tab === 'batch' ? 'active' : ''}`} onClick={() => setTab('batch')}>
          批量推荐
        </button>
        <span className="small muted" style={{ marginLeft: 'auto' }}>
          {tab === 'single' ? `队列剩余 ${Math.max(0, songs.length - index)} 首` : `${batch.length} 首`}
        </span>
      </div>

      {tab === 'single' ? (
        loading ? (
          <div className="loading-wrap">
            <div className="spinner" />
            <div>正在为你挑选歌曲…</div>
          </div>
        ) : error && !cur ? (
          <>
            <div className="error-box">{error}</div>
            <button className="btn" onClick={() => loadCard(mode)}>重试</button>
          </>
        ) : !cur ? (
          <div className="empty">
            <div className="empty-icon">♪</div>
            暂时没有漫游歌曲，换一首试试
          </div>
        ) : (
          <>
            {error && <div className="error-box" style={{ marginBottom: 14 }}>{error}</div>}

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 28,
                padding: '24px 26px',
                borderRadius: 16,
                border: '1px solid var(--border)',
                background:
                  'radial-gradient(120% 140% at 0% 0%, rgba(236,65,65,0.16), rgba(22,22,31,0.9) 55%, var(--bg-1))',
                opacity: busy ? 0.55 : 1,
                transition: 'opacity 0.18s',
              }}
            >
              {cover ? (
                <img
                  src={cover}
                  alt={cur.name}
                  style={{
                    width: 216,
                    height: 216,
                    borderRadius: 14,
                    objectFit: 'cover',
                    background: 'var(--bg-3)',
                    boxShadow: '0 14px 38px rgba(0,0,0,0.5)',
                    flexShrink: 0,
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 216,
                    height: 216,
                    borderRadius: 14,
                    background: 'var(--bg-3)',
                    display: 'grid',
                    placeItems: 'center',
                    color: 'var(--text-3)',
                    flexShrink: 0,
                  }}
                >
                  <IconMusic size={48} />
                </div>
              )}

              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  className="chip"
                  style={{ cursor: 'default', display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 12 }}
                >
                  <IconRoam size={13} /> 私人漫游 · {MODES.find((m) => m.key === mode)?.label}
                </div>

                <div
                  className="text-ellipsis"
                  style={{ fontSize: 25, fontWeight: 650, letterSpacing: 0.2, marginBottom: 6 }}
                  title={cur.name}
                >
                  {cur.name}
                </div>

                <div className="text-ellipsis" style={{ fontSize: 14, color: 'var(--text-1)', marginBottom: 4 }}>
                  {artistNames(cur)}
                </div>

                <div className="text-ellipsis" style={{ fontSize: 12.5, color: 'var(--text-2)', marginBottom: 22 }}>
                  {cur.al?.name || cur.album?.name || '未知专辑'}
                  {cur.dt ? ` · ${ncm.formatDuration(cur.dt)}` : ''}
                </div>

                <div className="row" style={{ flexWrap: 'wrap' }}>
                  <button className="btn primary" onClick={() => void playSong(cur, songs)} disabled={!!busy}>
                    <IconPlay size={14} /> 播放
                  </button>
                  <button className="btn" onClick={() => refreshQueue(mode, 'next')} disabled={!!busy}>
                    <IconNext size={14} /> {busy === 'next' ? '换歌中…' : '换一首'}
                  </button>
                  <button className="btn ghost" onClick={handleTrash} disabled={!!busy}>
                    <IconClose size={14} /> {busy === 'trash' ? '处理中…' : '不感兴趣'}
                  </button>
                  <button
                    className="btn ghost"
                    onClick={handleLike}
                    style={liked ? { color: 'var(--accent)', borderColor: 'rgba(236,65,65,0.5)' } : undefined}
                  >
                    <IconHeart size={14} filled={liked} /> {liked ? '已喜欢' : '喜欢'}
                  </button>
                </div>
              </div>
            </div>

            {/* 接下来的歌 */}
            {rest.length > 0 && (
              <div style={{ marginTop: 26 }}>
                <div className="section-title">接下来</div>
                {rest.map((s, i) => (
                  <div
                    key={`${s.id}-${i}`}
                    className="song-row"
                    style={{ gridTemplateColumns: '28px 36px 1fr 72px', cursor: 'pointer' }}
                    onClick={() => setIndex(index + 1 + i)}
                    title="切换到这首歌"
                  >
                    <div
                      style={{
                        textAlign: 'center',
                        color: 'var(--text-3)',
                        fontSize: 12,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {i + 1}
                    </div>
                    {ncm.songCoverUrl(s, 80) ? (
                      <img
                        src={ncm.songCoverUrl(s, 80)}
                        alt=""
                        style={{ width: 34, height: 34, borderRadius: 6, objectFit: 'cover', background: 'var(--bg-3)' }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 6,
                          background: 'var(--bg-3)',
                          display: 'grid',
                          placeItems: 'center',
                          color: 'var(--text-3)',
                        }}
                      >
                        <IconMusic size={15} />
                      </div>
                    )}
                    <div className="song-main">
                      <div className="song-name text-ellipsis">{s.name}</div>
                      <div className="song-album">{artistNames(s)}</div>
                    </div>
                    <div className="song-dur">{ncm.formatDuration(s.dt)}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )
      ) : batchLoading ? (
        <div className="loading-wrap">
          <div className="spinner" />
          <div>正在拉取一批推荐…</div>
        </div>
      ) : batchError ? (
        <>
          <div className="error-box">{batchError}</div>
          <button className="btn" onClick={() => loadBatch(mode)}>重试</button>
        </>
      ) : (
        <SongList
          songs={batch}
          currentId={currentId}
          likedIds={likedIds}
          onPlay={(song, i) => void playQueue(batch, i)}
          onLike={(song) => toggleLike(song.id).catch(() => {})}
          onAddQueue={addToQueue}
          onContextMenu={(e, song) => useSongMenu.getState().show(e.clientX, e.clientY, song)}
          emptyText="还没有拿到推荐歌曲，换一批试试"
        />
      )}
    </div>
  )
}
