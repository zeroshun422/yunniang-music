import React, { useEffect, useState } from 'react'
import { usePlayer } from '@/store/player'
import { useLibrary } from '@/store/library'
import { useUi } from '@/store/ui'
import { useAuth } from '@/store/auth'
import { formatDuration, songCoverUrl } from '@/api/ncm'
import { QualityMenu } from './QualityMenu'
import {
  IconPlay, IconPause, IconNext, IconPrev, IconVolume, IconVolumeMute,
  IconRepeat, IconRepeatOne, IconShuffle, IconLyric, IconQueue, IconHeart, IconClose,
} from './Icons'
import { QueuePanel } from './QueuePanel'
import { LyricPanel } from './LyricPanel'

/**
 * 播放栏（iOS 26 风格）
 *
 * 视觉：浮在内容之上的玻璃条（.player + ::before 承载模糊），
 * 内容从它背后滚过 -> 能透见底层文字。
 *
 * 结构：左（当前曲目）/ 中（控制 + 进度）/ 右（音质、歌词、队列、音量）。
 * 布局与材质全在 ui.css，本组件只保留状态与交互逻辑。
 */
export function PlayerBar({ onToggleDesktopLyric }: { onToggleDesktopLyric: () => void }) {
  const {
    queue, currentIndex, playing, currentTime, duration, volume, muted,
    repeat, shuffle, loading, loadError, qualityNotice,
    toggle, next, prev, seek, setVolume, toggleMute, setRepeat, toggleShuffle,
  } = usePlayer()

  const { likedIds, toggleLike, loadLikes } = useLibrary()
  const { user } = useAuth()

  // 抽屉状态提升到 ui store：App 层需要感知它以推挤主内容区
  const queueOpen = useUi((st) => st.drawer === 'queue')
  const lyricOpen = useUi((st) => st.drawer === 'lyric')
  const toggleDrawer = useUi((st) => st.toggleDrawer)
  const closeDrawer = useUi((st) => st.closeDrawer)
  const [likeBusy, setLikeBusy] = useState(false)

  // 首次进入时同步一次「喜欢」列表，保证红心状态准确
  useEffect(() => {
    if (user?.userId && likedIds.size === 0) loadLikes(user.userId).catch(() => {})
  }, [user?.userId])

  const song = queue[currentIndex]
  const isLiked = !!(song && likedIds.has(song.id))

  const handleToggleLike = async () => {
    if (!song || !user || likeBusy) return
    setLikeBusy(true)
    try {
      await toggleLike(song.id)
    } catch (e) {
      // 失败时静默回滚（toggleLike 内部已回滚状态）
    } finally {
      setLikeBusy(false)
    }
  }

  const [dragging, setDragging] = useState(false)
  const [dragVal, setDragVal] = useState(0)

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

  const artistText = song
    ? (song.ar || song.artists || []).map((a) => a.name).join(' / ') || '未知歌手'
    : ''

  return (
    <div className="player">
      {/* ---------- 左：当前曲目 ---------- */}
      <div className="player__now">
        {song ? (
          <>
            <img
              className="player__cover"
              src={songCoverUrl(song, 160)}
              alt=""
              onClick={() => toggleDrawer('lyric')}
              onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.2' }}
            />
            <div className="player__meta">
              <div
                className="player__title u-ellipsis"
                title={song.name}
                onClick={() => toggleDrawer('lyric')}
              >
                {song.name}
              </div>
              <div className="player__artist u-ellipsis">{artistText}</div>
            </div>
            <button
              className={`u-icon-btn${isLiked ? ' is-active' : ''}`}
              title={!user ? '登录后可收藏' : isLiked ? '取消喜欢' : '喜欢'}
              disabled={!user || likeBusy}
              onClick={handleToggleLike}
            >
              <IconHeart size={18} filled={isLiked} />
            </button>
          </>
        ) : (
          <div className="player__meta">
            <div className="player__title u-muted">未在播放</div>
            <div className="player__artist">选择一首歌曲开始</div>
          </div>
        )}
      </div>

      {/* ---------- 中：控制 + 进度 ---------- */}
      <div className="player__center">
        <div className="player__controls">
          <button
            className={`u-icon-btn${shuffle ? ' is-active' : ''}`}
            title={shuffle ? '随机播放：开' : '随机播放：关'}
            onClick={toggleShuffle}
          >
            <IconShuffle size={16} />
          </button>

          <button className="u-icon-btn" title="上一首" onClick={() => prev()} disabled={!queue.length}>
            <IconPrev size={18} />
          </button>

          <button
            className="u-play-btn"
            onClick={toggle}
            disabled={!queue.length || loading}
            title={playing ? '暂停' : '播放'}
          >
            {loading ? (
              <span className="u-spinner u-spinner--sm" />
            ) : playing ? (
              <IconPause size={18} />
            ) : (
              <IconPlay size={18} />
            )}
          </button>

          <button className="u-icon-btn" title="下一首" onClick={() => next(true)} disabled={!queue.length}>
            <IconNext size={18} />
          </button>

          <button
            className={`u-icon-btn${repeat !== 'off' ? ' is-active' : ''}`}
            title={repeat === 'off' ? '循环：关' : repeat === 'all' ? '列表循环' : '单曲循环'}
            onClick={() => setRepeat(repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off')}
          >
            {repeat === 'one' ? <IconRepeatOne size={16} /> : <IconRepeat size={16} />}
          </button>
        </div>

        <div className="player__progress">
          <span className="player__time">{formatDuration(displayTime * 1000)}</span>
          <input
            className="u-slider"
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
            aria-label="播放进度"
          />
          <span className="player__time">{formatDuration(duration * 1000)}</span>
        </div>
      </div>

      {/* ---------- 右：音质 / 歌词 / 队列 / 音量 ---------- */}
      <div className="player__tools">
        <QualityMenu />

        <button className="u-icon-btn" title="桌面歌词" onClick={onToggleDesktopLyric}>
          <IconLyric size={18} />
        </button>

        <button
          className={`u-icon-btn${queueOpen ? ' is-active' : ''}`}
          title="播放队列"
          onClick={() => toggleDrawer('queue')}
        >
          <IconQueue size={18} />
        </button>

        <div className="volume">
          <button className="u-icon-btn" onClick={toggleMute} title={muted ? '取消静音' : '静音'}>
            {muted || volume === 0 ? <IconVolumeMute size={18} /> : <IconVolume size={18} />}
          </button>
          <input
            className="u-slider"
            type="range"
            min={0} max={100}
            value={muted ? 0 : Math.round(volume * 100)}
            onChange={(e) => setVolume(Number(e.target.value) / 100)}
            aria-label="音量"
          />
        </div>
      </div>

      {/* ---------- 错误 / 音质提示 ---------- */}
      {(loadError || qualityNotice) && (
        loadError ? (
          <div className="u-toast u-toast--error" role="alert" title={loadError}>
            <span className="u-toast__label">播放失败</span>
            <span className="u-toast__text">{loadError}</span>
          </div>
        ) : (
          <div className="u-toast u-toast--notice" role="status" title={qualityNotice || ''}>
            <span className="u-toast__label">音质</span>
            <span className="u-toast__text">{qualityNotice}</span>
          </div>
        )
      )}

      {/* ---------- 抽屉 ---------- */}
      {lyricOpen && (
        <aside className="u-drawer" aria-label="歌词">
          <div className="u-drawer__head">
            <div className="u-drawer__title">歌词</div>
            <button className="u-icon-btn" onClick={closeDrawer} title="关闭歌词">
              <IconClose size={16} />
            </button>
          </div>
          <div className="u-drawer__body">
            <LyricPanel />
          </div>
        </aside>
      )}

      {queueOpen && <QueuePanel onClose={closeDrawer} />}
    </div>
  )
}
