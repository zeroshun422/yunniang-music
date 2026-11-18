import React, { useState } from 'react'
import { usePlayer } from '@/store/player'
import { songCoverUrl, formatDuration } from '@/api/ncm'
import { IconClose } from './Icons'

/**
 * 播放队列抽屉（iOS 26 风格）
 *
 * 视觉：右侧浮起的玻璃板（.u-drawer），推挤内容而非遮挡。
 * 行为：支持拖拽排序（HTML5 DnD）、二次确认清空、逐条移除。
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
    <aside className="u-drawer" aria-label="播放队列">
      <div className="u-drawer__head">
        <div className="u-drawer__title">
          播放队列
          <span className="u-caption u-muted queue-count">{queue.length}</span>
        </div>

        <div className="u-row-flex">
          {queue.length > 0 && (
            <button
              className={`u-btn u-btn--sm ${confirmClear ? 'u-btn--fill' : 'u-btn--gray'}`}
              onClick={handleClear}
              title={confirmClear ? '再次点击确认清空' : '清空播放队列'}
            >
              {confirmClear ? '确认清空?' : '清空'}
            </button>
          )}
          <button className="u-icon-btn" onClick={onClose} title="关闭队列" aria-label="关闭播放队列">
            <IconClose size={16} />
          </button>
        </div>
      </div>

      <div className="u-drawer__body">
        {queue.length === 0 && (
          <div className="u-empty">
            <div className="u-empty__icon">♫</div>
            队列是空的
          </div>
        )}

        {queue.map((s, i) => {
          const isCurrent = i === currentIndex
          const isDragging = dragIdx === i
          const isOver = overIdx === i && dragIdx !== null && dragIdx !== i
          const artist = (s.ar || s.artists || []).map((a) => a.name).join(' / ')

          return (
            <div
              key={`${s.id}-${i}`}
              className={[
                'u-queue-row',
                isCurrent ? 'is-current' : '',
                isDragging ? 'is-dragging' : '',
                isOver ? 'is-drag-over' : '',
              ].filter(Boolean).join(' ')}
              draggable
              onDragStart={() => setDragIdx(i)}
              onDragOver={(e) => { e.preventDefault(); setOverIdx(i) }}
              onDragLeave={() => setOverIdx((v) => (v === i ? null : v))}
              onDrop={() => onDrop(i)}
              onDragEnd={() => { setDragIdx(null); setOverIdx(null) }}
              onClick={() => playQueue(queue, i)}
            >
              <span
                className="queue-drag"
                aria-hidden="true"
                onClick={(e) => e.stopPropagation()}
              >
                ⠿
              </span>

              <span className="u-caption u-muted queue-idx" aria-hidden="true">
                {isCurrent ? (playing ? '▶' : '❚❚') : i + 1}
              </span>

              <img className="u-queue-row__cover" src={songCoverUrl(s, 80)} alt="" loading="lazy" />

              <div className="u-queue-row__main">
                <div className="u-queue-row__name">{s.name}</div>
                <div className="u-queue-row__artist">{artist}</div>
              </div>

              <span className="u-queue-row__dur">{formatDuration(s.dt || s.duration)}</span>

              <button
                className="u-icon-btn"
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
