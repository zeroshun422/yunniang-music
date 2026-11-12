import React, { useState } from 'react'
import { usePlayer } from '@/store/player'
import { songCoverUrl, formatDuration } from '@/api/ncm'
import { IconClose } from './Icons'

/**
 * 播放队列抽屉
 *
 * P0 改造：由「fixed 浮层」改为「右侧抽屉 + 推挤主内容区」，
 * 避免覆盖页面内容（此前在设置页会盖住音质选项，导致无法点击）。
 * 结构与样式见 global.css 的 .side-drawer / .queue-row。
 */
export function QueuePanel({ onClose }: { onClose: () => void }) {
  const {
    queue, currentIndex, playing, playQueue, removeFromQueue, clearQueue, moveInQueue,
  } = usePlayer()

  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [overIdx, setOverIdx] = useState<number | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)

  const onDrop = (to: number) => {
    if (dragIdx !== null && dragIdx !== to) moveInQueue(dragIdx, to)
    setDragIdx(null)
    setOverIdx(null)
  }

  const handleClear = () => {
    if (!confirmClear) {
      setConfirmClear(true)
      // 3 秒内未确认则自动复原，避免误触
      window.setTimeout(() => setConfirmClear(false), 3000)
      return
    }
    setConfirmClear(false)
    clearQueue()
  }

  return (
    <aside className="side-drawer" aria-label="播放队列">
      <div className="side-drawer__head">
        <div className="side-drawer__title">
          播放队列
          <span className="muted small" style={{ marginLeft: 6 }}>({queue.length})</span>
        </div>
        <div className="row" style={{ gap: 4 }}>
          {queue.length > 0 && (
            <button
              className={`btn sm ${confirmClear ? 'primary' : 'ghost'}`}
              onClick={handleClear}
              title={confirmClear ? '再次点击确认清空' : '清空播放队列'}
            >
              {confirmClear ? '确认清空?' : '清空'}
            </button>
          )}
          <button className="pb-btn" onClick={onClose} title="关闭队列" aria-label="关闭播放队列">
            <IconClose size={15} />
          </button>
        </div>
      </div>

      <div className="side-drawer__body" style={{ padding: 6 }}>
        {queue.length === 0 && (
          <div className="empty" style={{ padding: '48px 0' }}>
            <div className="empty-icon">♫</div>
            队列是空的
          </div>
        )}

        {queue.map((s, i) => {
          const isCurrent = i === currentIndex
          const isDragging = dragIdx === i
          const isOver = overIdx === i && dragIdx !== null && dragIdx !== i
          return (
            <div
              key={`${s.id}-${i}`}
              className={`queue-row${isCurrent ? ' is-current' : ''}${isDragging ? ' is-dragging' : ''}`}
              draggable
              onDragStart={() => setDragIdx(i)}
              onDragOver={(e) => { e.preventDefault(); setOverIdx(i) }}
              onDragLeave={() => setOverIdx((v) => (v === i ? null : v))}
              onDrop={() => onDrop(i)}
              onDragEnd={() => { setDragIdx(null); setOverIdx(null) }}
              onClick={() => playQueue(queue, i)}
              // 拖拽落点提示：目标行加一条高亮插入线，替代原先只靠 opacity 的无反馈
              style={
                isOver
                  ? {
                      boxShadow: dragIdx! < i
                        ? 'inset 0 -2px 0 0 var(--accent)'
                        : 'inset 0 2px 0 0 var(--accent)',
                      background: 'var(--bg-hover)',
                    }
                  : undefined
              }
            >
              <span
                className="drag-handle"
                aria-hidden="true"
                style={{ fontSize: 11 }}
                onClick={(e) => e.stopPropagation()}
              >
                ⠿
              </span>

              <span className="queue-row__idx" aria-hidden="true">
                {isCurrent ? (playing ? '▶' : '❚❚') : i + 1}
              </span>

              <img className="queue-row__cover" src={songCoverUrl(s, 60)} alt="" loading="lazy" />

              <div className="queue-row__main">
                <div className="queue-row__name">{s.name}</div>
                <div className="queue-row__artist">
                  {(s.ar || s.artists || []).map((a) => a.name).join(' / ')}
                </div>
              </div>

              <span className="queue-row__dur">{formatDuration(s.dt || s.duration)}</span>

              <button
                className="song-action-btn"
                title="移出队列"
                aria-label={`从队列移除 ${s.name}`}
                onClick={(e) => { e.stopPropagation(); removeFromQueue(i) }}
              >
                <IconClose size={13} />
              </button>
            </div>
          )
        })}
      </div>
    </aside>
  )
}
