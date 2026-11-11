import React, { useState } from 'react'
import { usePlayer } from '@/store/player'
import { songCoverUrl, formatDuration } from '@/api/ncm'
import { IconClose, IconPlay, IconPause } from './Icons'

export function QueuePanel({ onClose }: { onClose: () => void }) {
  const {
    queue, currentIndex, playing, toggle, playQueue, removeFromQueue, clearQueue, moveInQueue, seek,
  } = usePlayer()

  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [overIdx, setOverIdx] = useState<number | null>(null)

  const onDrop = (to: number) => {
    if (dragIdx !== null && dragIdx !== to) moveInQueue(dragIdx, to)
    setDragIdx(null); setOverIdx(null)
  }

  return (
    <div
      style={{
        position: 'fixed', right: 14, bottom: 'calc(var(--player-h) + 10px)',
        width: 400, maxHeight: '58vh',
        background: 'var(--bg-2)', border: '1px solid var(--border-light)',
        borderRadius: 12, boxShadow: 'var(--shadow-2)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden', zIndex: 200,
      }}
    >
      <div className="row-between" style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 13.5, fontWeight: 550 }}>
          播放队列 <span className="muted small">({queue.length})</span>
        </div>
        <div className="row" style={{ gap: 4 }}>
          {queue.length > 0 && (
            <button className="btn sm ghost" onClick={clearQueue}>清空</button>
          )}
          <button className="pb-btn" onClick={onClose} title="关闭"><IconClose size={15} /></button>
        </div>
      </div>

      <div style={{ overflowY: 'auto', flex: 1, padding: 6 }}>
        {queue.length === 0 && (
          <div className="empty" style={{ padding: '40px 0' }}>
            <div className="empty-icon">♫</div>
            队列是空的
          </div>
        )}
        {queue.map((s, i) => (
          <div
            key={`${s.id}-${i}`}
            draggable
            onDragStart={() => setDragIdx(i)}
            onDragOver={(e) => { e.preventDefault(); setOverIdx(i) }}
            onDragLeave={() => setOverIdx((v) => (v === i ? null : v))}
            onDrop={() => onDrop(i)}
            onDragEnd={() => { setDragIdx(null); setOverIdx(null) }}
            onClick={() => playQueue(queue, i)}
            style={{
              display: 'flex', alignItems: 'center', gap: 9,
              padding: '6px 8px', borderRadius: 7, cursor: 'pointer',
              background: i === currentIndex ? 'var(--accent-soft)' : overIdx === i ? 'var(--bg-hover)' : 'transparent',
              opacity: dragIdx === i ? 0.4 : 1,
            }}
          >
            <span className="drag-handle" style={{ fontSize: 11 }} onClick={(e) => e.stopPropagation()}>⠿</span>
            <span style={{ width: 16, color: i === currentIndex ? 'var(--accent)' : 'var(--text-3)', fontSize: 11.5, textAlign: 'center' }}>
              {i === currentIndex ? (playing ? '▶' : '❚❚') : i + 1}
            </span>
            <img
              src={songCoverUrl(s, 60)}
              style={{ width: 32, height: 32, borderRadius: 5, objectFit: 'cover', background: 'var(--bg-3)' }}
              alt=""
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="text-ellipsis" style={{ fontSize: 12.5, color: i === currentIndex ? 'var(--accent)' : 'var(--text-0)' }}>
                {s.name}
              </div>
              <div className="text-ellipsis" style={{ fontSize: 11, color: 'var(--text-2)' }}>
                {(s.ar || s.artists || []).map((a) => a.name).join(' / ')}
              </div>
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
              {formatDuration(s.dt || s.duration)}
            </span>
            <button
              className="song-action-btn"
              title="移出队列"
              onClick={(e) => { e.stopPropagation(); removeFromQueue(i) }}
            >
              <IconClose size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
