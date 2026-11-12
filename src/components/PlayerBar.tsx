import React, { useEffect, useRef, useState } from 'react'
import { usePlayer } from '@/store/player'
import { useLibrary } from '@/store/library'
import { useAuth } from '@/store/auth'
import { formatDuration, songCoverUrl } from '@/api/ncm'
import { QualityMenu } from './QualityMenu'
import {
  IconPlay, IconPause, IconNext, IconPrev, IconVolume, IconVolumeMute,
  IconRepeat, IconRepeatOne, IconShuffle, IconLyric, IconQueue, IconHeart, IconClose,
} from './Icons'
import { QueuePanel } from './QueuePanel'
import { LyricPanel } from './LyricPanel'

export function PlayerBar({ onToggleDesktopLyric }: { onToggleDesktopLyric: () => void }) {
  const {
    queue, currentIndex, playing, currentTime, duration, volume, muted,
    repeat, shuffle, loading, loadError, qualityNotice,
    toggle, next, prev, seek, setVolume, toggleMute, setRepeat, toggleShuffle,
  } = usePlayer()

  const { likedIds, toggleLike, loadLikes } = useLibrary()
  const { user } = useAuth()

  const [queueOpen, setQueueOpen] = useState(false)
  const [lyricOpen, setLyricOpen] = useState(false)
  const [likeBusy, setLikeBusy] = useState(false)

  // 首次进入时同步一次「喜欢」列表，保证红心状态准确
  useEffect(() => {
    if (user?.userId && likedIds.size === 0) loadLikes(user.userId).catch(() => {})
  }, [user?.userId])

  const currentSong = queue[currentIndex]
  const isLiked = !!(currentSong && likedIds.has(currentSong.id))

  const handleToggleLike = async () => {
    if (!currentSong || !user || likeBusy) return
    setLikeBusy(true)
    try {
      await toggleLike(currentSong.id)
    } catch (e) {
      // 失败时静默回滚（toggleLike 内部已回滚状态）
    } finally {
      setLikeBusy(false)
    }
  }
  const [dragging, setDragging] = useState(false)
  const [dragVal, setDragVal] = useState(0)

  const song = queue[currentIndex]
  // 拖动期间用 dragVal 渲染，避免 timeupdate 把进度条拉回去
  const displayTime = dragging ? dragVal : currentTime
  const progress = duration > 0 ? (displayTime / duration) * 100 : 0

  const onSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value)
    setDragVal((v / 100) * duration)
    // 拖动过程中只更新预览值，不立即 seek：
    // 否则每个 change 事件都会触发浏览器 seek，音频会卡顿、进度条也会跳。
    // 松手时（onMouseUp）才真正跳转。
    if (!dragging) seek((v / 100) * duration)
  }



  return (
    <div className="player-bar">
      {/* 左：当前歌曲 */}
      <div className="pb-left">
        {song ? (
          <>
            <img
              className="pb-cover"
              src={songCoverUrl(song, 120)}
              alt=""
              style={{ cursor: 'pointer' }}
              onClick={() => setLyricOpen((o) => !o)}
              onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.2' }}
            />
            <div className="pb-meta">
              <div className="pb-title" title={song.name} style={{ cursor: 'pointer' }} onClick={() => setLyricOpen((o) => !o)}>{song.name}</div>
              <div className="pb-artist">
                {(song.ar || song.artists || []).map((a) => a.name).join(' / ') || '未知歌手'}
              </div>
            </div>
            <button
              className={`pb-like ${isLiked ? 'liked' : ''}`}
              title={!user ? '登录后可收藏' : isLiked ? '取消喜欢' : '喜欢'}
              disabled={!user || likeBusy}
              onClick={handleToggleLike}
            >
              <IconHeart size={18} filled={isLiked} />
            </button>
          </>
        ) : (
          <div className="pb-meta">
            <div className="pb-title" style={{ color: 'var(--text-3)' }}>未在播放</div>
            <div className="pb-artist">选择一首歌曲开始</div>
          </div>
        )}
      </div>

      {/* 中：控制 + 进度 */}
      <div className="pb-center">
        <div className="pb-controls">
          <button
            className={`pb-btn ${shuffle ? 'active' : ''}`}
            title={shuffle ? '随机播放：开' : '随机播放：关'}
            onClick={toggleShuffle}
          >
            <IconShuffle size={16} />
          </button>
          <button className="pb-btn" title="上一首" onClick={() => prev()} disabled={!queue.length}>
            <IconPrev size={17} />
          </button>
          <button className="pb-play" onClick={toggle} disabled={!queue.length || loading} title={playing ? '暂停' : '播放'}>
            {loading ? (
              <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
            ) : playing ? (
              <IconPause size={17} />
            ) : (
              <IconPlay size={17} />
            )}
          </button>
          <button className="pb-btn" title="下一首" onClick={() => next(true)} disabled={!queue.length}>
            <IconNext size={17} />
          </button>
          <button
            className={`pb-btn ${repeat !== 'off' ? 'active' : ''}`}
            title={repeat === 'off' ? '循环：关' : repeat === 'all' ? '列表循环' : '单曲循环'}
            onClick={() => setRepeat(repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off')}
          >
            {repeat === 'one' ? <IconRepeatOne size={16} /> : <IconRepeat size={16} />}
          </button>
        </div>

        <div className="pb-progress">
          <span className="pb-time">{formatDuration(displayTime * 1000)}</span>
          <input
            className="slider"
            type="range"
            min={0} max={100} step={0.2}
            value={progress}
            disabled={!song || !duration}
            onChange={onSeekChange}
            onMouseDown={() => { setDragging(true); setDragVal(currentTime) }}
            onMouseUp={(e) => {
              const v = Number((e.target as HTMLInputElement).value)
              seek((v / 100) * duration)
              setDragging(false)
            }}
          />
          <span className="pb-time">{formatDuration(duration * 1000)}</span>
        </div>
      </div>

      {/* 右：音质 / 歌词 / 队列 / 音量 */}
      <div className="pb-right">
        <QualityMenu />

        <button className="pb-btn" title="桌面歌词" onClick={onToggleDesktopLyric}>
          <IconLyric size={17} />
        </button>

        <button
          className={`pb-btn ${queueOpen ? 'active' : ''}`}
          title="播放队列"
          onClick={() => setQueueOpen((o) => !o)}
        >
          <IconQueue size={17} />
        </button>

        <div className="volume-wrap">
          <button className="pb-btn" onClick={toggleMute} title={muted ? '取消静音' : '静音'}>
            {muted || volume === 0 ? <IconVolumeMute size={17} /> : <IconVolume size={17} />}
          </button>
          <input
            className="slider volume-slider"
            type="range"
            min={0} max={100}
            value={muted ? 0 : Math.round(volume * 100)}
            onChange={(e) => setVolume(Number(e.target.value) / 100)}
          />
        </div>
      </div>

      {/* 错误 / 音质提示 */}
      {(loadError || qualityNotice) && (
        <div style={{
          position: 'absolute', bottom: '100%', left: 16, right: 16, marginBottom: 6,
          display: 'flex', gap: 8, flexDirection: 'column',
        }}>
          {loadError && <div className="error-box" style={{ margin: 0 }}>⚠ {loadError}</div>}
          {qualityNotice && !loadError && <div className="notice-box">♪ {qualityNotice}</div>}
        </div>
      )}

      {lyricOpen && (
        <div style={{
          position: 'fixed', right: 14, bottom: 'calc(var(--player-h) + 10px)',
          width: 380, height: '52vh',
          background: 'var(--bg-2)', border: '1px solid var(--border-light)',
          borderRadius: 12, boxShadow: 'var(--shadow-2)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden', zIndex: 200,
        }}>
          <div className="row-between" style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 13.5, fontWeight: 550 }}>歌词</div>
            <button className="pb-btn" onClick={() => setLyricOpen(false)} title="关闭"><IconClose size={15} /></button>
          </div>
          <div style={{ flex: 1, minHeight: 0, padding: '0 6px' }}>
            <div style={{ height: '100%', overflow: 'hidden' }}>
              <LyricPanel />
            </div>
          </div>
        </div>
      )}

      {queueOpen && <QueuePanel onClose={() => setQueueOpen(false)} />}
    </div>
  )
}
