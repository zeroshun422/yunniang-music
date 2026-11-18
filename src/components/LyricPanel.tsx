import React from 'react'
import { usePlayer } from '@/store/player'

/**
 * 歌词视图（iOS 26 风格）
 *
 * 视觉：居中滚动、当前行加粗放大、非当前行淡出。
 * 用 mask 做上下渐隐，让歌词"从雾里浮现"而不是硬切边界 —— 这是 iOS 常见手法。
 */
export function LyricPanel() {
  const { lyrics, currentLine, hasTrans } = usePlayer()
  const containerRef = React.useRef<HTMLDivElement>(null)
  const activeRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!activeRef.current || !containerRef.current) return
    const c = containerRef.current
    const a = activeRef.current
    const target = a.offsetTop - c.clientHeight / 2 + a.clientHeight / 2
    c.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
  }, [currentLine])

  if (!lyrics.length) {
    return (
      <div className="u-empty">
        <div className="u-empty__icon">♪</div>
        暂无歌词
      </div>
    )
  }

  return (
    <div ref={containerRef} className="lyrics">
      <div className="lyrics__spacer" aria-hidden="true" />
      {lyrics.map((l, i) => (
        <div
          key={i}
          ref={i === currentLine ? activeRef : undefined}
          className={`lyrics__line${i === currentLine ? ' is-active' : ''}`}
        >
          <span className="lyrics__text">{l.text}</span>
          {hasTrans && l.trans && <span className="lyrics__trans">{l.trans}</span>}
        </div>
      ))}
      <div className="lyrics__spacer" aria-hidden="true" />
    </div>
  )
}
