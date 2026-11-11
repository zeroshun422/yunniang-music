import React from 'react'
import { usePlayer } from '@/store/player'
import { formatDuration, songCoverUrl } from '@/api/ncm'
import { IconLyric } from '@/components/Icons'

/**
 * 歌词视图 —— 嵌入式滚动歌词（播放页/右侧抽屉）
 */
export function LyricPanel() {
  const { lyrics, currentLine, hasTrans, currentTime, duration } = usePlayer()
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
      <div className="empty" style={{ padding: '60px 0' }}>
        <div className="empty-icon">♪</div>
        暂无歌词
      </div>
    )
  }

  return (
    <div ref={containerRef} className="lyric-view" style={{ height: '100%' }}>
      {lyrics.map((l, i) => (
        <div
          key={i}
          ref={i === currentLine ? activeRef : undefined}
          className={`lyric-line ${i === currentLine ? 'active' : ''}`}
        >
          {l.text}
          {hasTrans && l.trans && <span className="trans">{l.trans}</span>}
        </div>
      ))}
    </div>
  )
}

/** 播放详情页（全屏歌词 + 封面） */
export function NowPlayingPage() {
  const { queue, currentIndex, currentTime, duration, lyrics } = usePlayer()
  const song = queue[currentIndex]
  if (!song) {
    return (
      <div className="content-scroll">
        <div className="empty"><div className="empty-icon">♪</div>还没有在播放的歌曲</div>
      </div>
    )
  }
  return (
    <div className="content-scroll">
      <div className="page-header"><h1 className="page-title">正在播放</h1></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 30, height: 'calc(100vh - 260px)' }}>
        <div>
          <img
            src={songCoverUrl(song, 400)}
            alt=""
            style={{ width: '100%', maxWidth: 340, aspectRatio: 1, borderRadius: 14, objectFit: 'cover', background: 'var(--bg-3)', boxShadow: 'var(--shadow-2)' }}
          />
          <h2 style={{ marginTop: 18, fontSize: 20 }}>{song.name}</h2>
          <div className="muted small mt-8">
            {(song.ar || song.artists || []).map((a) => a.name).join(' / ')}
            {song.al?.name ? ` · ${song.al.name}` : ''}
          </div>
        </div>
        <LyricPanel />
      </div>
    </div>
  )
}
