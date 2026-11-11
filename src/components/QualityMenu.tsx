import React, { useEffect, useRef, useState } from 'react'
import { QUALITIES } from '@/api/bridge'
import type { QualityLevel } from '@/types'
import { usePlayer } from '@/store/player'
import { IconChevronDown } from './Icons'

/**
 * 音质选择器 —— 折叠在播放栏右侧
 * 显示当前选中音质；播放中显示实际音质（若降级会提示）
 */
export function QualityMenu() {
  const quality = usePlayer((s) => s.quality)
  const actualQuality = usePlayer((s) => s.actualQuality)
  const actualBr = usePlayer((s) => s.actualBr)
  const qualityNotice = usePlayer((s) => s.qualityNotice)
  const setQuality = usePlayer((s) => s.setQuality)

  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const current = QUALITIES.find((q) => q.level === quality)
  const isLossless = quality === 'lossless' || quality === 'hires' || quality === 'jymaster'

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className={`quality-pill ${isLossless ? 'sq' : ''}`}
        onClick={() => setOpen((o) => !o)}
        title={qualityNotice || current?.desc}
      >
        {current?.badge || current?.label || quality}
        {actualQuality && actualQuality !== quality && (
          <span style={{ opacity: 0.65, marginLeft: 4 }}>
            → {QUALITIES.find((q) => q.level === actualQuality)?.label || actualQuality}
          </span>
        )}
        <IconChevronDown size={11} />
      </button>

      {open && (
        <div
          className="menu quality-panel"
          style={{ position: 'absolute', bottom: '100%', right: 0, marginBottom: 8 }}
        >
          <div style={{ padding: '6px 11px 8px', fontSize: 11, color: 'var(--text-3)' }}>
            播放音质
          </div>
          {QUALITIES.map((q) => {
            const active = q.level === quality
            const actual = q.level === actualQuality
            return (
              <button
                key={q.level}
                className={`menu-item quality-item ${active ? 'active' : ''}`}
                onClick={() => { setQuality(q.level as QualityLevel); setOpen(false) }}
              >
                <span style={{ display: 'flex', flexDirection: 'column', gap: 1, textAlign: 'left' }}>
                  <span>{q.label}{q.badge ? ` · ${q.badge}` : ''}</span>
                  <span className="quality-sub">{q.desc}</span>
                </span>
                {active && <span className="check">✓</span>}
                {!active && actual && <span className="quality-sub">当前</span>}
              </button>
            )
          })}
          {actualBr > 0 && (
            <div style={{ borderTop: '1px solid var(--border)', marginTop: 5, padding: '7px 11px 4px', fontSize: 11, color: 'var(--text-3)' }}>
              正在播放：{Math.round(actualBr / 1000)} kbps
            </div>
          )}
        </div>
      )}
    </div>
  )
}
