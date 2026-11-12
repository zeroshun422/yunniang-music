import React from 'react'
import type { Song } from '@/types'
import { formatDuration, songCoverUrl } from '@/api/ncm'
import { IconPlay, IconHeart, IconPlus } from './Icons'

export interface SongRowProps {
  song: Song
  index: number
  isPlaying?: boolean
  isCurrent?: boolean
  liked?: boolean
  showAlbum?: boolean
  onPlay: (song: Song) => void
  onLike?: (song: Song) => void
  onAddQueue?: (song: Song) => void
  onContextMenu?: (e: React.MouseEvent, song: Song) => void
  selected?: boolean
  onSelect?: (song: Song, checked: boolean) => void
}

export function SongRow({
  song, index, isCurrent, liked, showAlbum = true,
  onPlay, onLike, onAddQueue, onContextMenu, selected, onSelect,
}: SongRowProps) {
  const artists = (song.ar || song.artists || []).map((a) => a.name).join(' / ') || '未知歌手'
  const album = song.al?.name || song.album?.name || ''
  const dur = song.dt || song.duration || 0
  const isVip = song.fee === 1

  return (
    <div
      className={`song-row ${isCurrent ? 'playing' : ''}`}
      onDoubleClick={() => onPlay(song)}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e, song) }}
      style={selected ? { background: 'var(--accent-soft)' } : undefined}
    >
      <div className="song-idx" onClick={() => onPlay(song)} style={{ cursor: 'pointer' }}>
        {onSelect ? (
          <input
            type="checkbox"
            checked={!!selected}
            onChange={(e) => onSelect(song, e.target.checked)}
            style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <>
            <span className="num">{String(index + 1).padStart(2, '0')}</span>
            <span className="play-ico"><IconPlay size={13} /></span>
          </>
        )}
      </div>

      <div className="song-main">
        <img
          className="song-cover"
          src={songCoverUrl(song, 80)}
          alt=""
          loading="lazy"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden' }}
        />
        <div className="song-main-text">
        <div className="song-name">
          {song.name}
          {isVip && <span className="song-tag">VIP</span>}
          {song.mv ? <span className="song-tag" style={{ borderColor: 'var(--tag-mv)', color: 'var(--tag-mv)' }}>MV</span> : null}
        </div>
        {showAlbum && <div className="song-album">{album}</div>}
        </div>
      </div>

      <div className="song-artist" title={artists}>{artists}</div>
      <div className="song-dur">{formatDuration(dur)}</div>

      <div className="song-actions">
        {onLike && (
          <button
            className={`song-action-btn ${liked ? 'liked' : ''}`}
            title={liked ? '取消喜欢' : '喜欢'}
            onClick={(e) => { e.stopPropagation(); onLike(song) }}
          >
            <IconHeart size={14} filled={!!liked} />
          </button>
        )}
        {onAddQueue && (
          <button
            className="song-action-btn"
            title="加入播放队列"
            onClick={(e) => { e.stopPropagation(); onAddQueue(song) }}
          >
            <IconPlus size={14} />
          </button>
        )}
      </div>
    </div>
  )
}

interface SongListProps {
  songs: Song[]
  currentId?: number
  likedIds?: Set<number>
  onPlay: (song: Song, index: number) => void
  onLike?: (song: Song) => void
  onAddQueue?: (song: Song) => void
  onContextMenu?: (e: React.MouseEvent, song: Song) => void
  showAlbum?: boolean
  emptyText?: string
}

export function SongList({
  songs, currentId, likedIds, onPlay, onLike, onAddQueue, onContextMenu, showAlbum = true, emptyText = '暂无歌曲',
}: SongListProps) {
  if (!songs.length) {
    return <div className="empty"><div className="empty-icon">♪</div>{emptyText}</div>
  }
  return (
    <div>
      <div className="table-head">
        <div>#</div>
        <div>标题</div>
        <div>歌手</div>
        <div>时长</div>
        <div />
      </div>
      {songs.map((s, i) => (
        <SongRow
          key={`${s.id}-${i}`}
          song={s}
          index={i}
          isCurrent={s.id === currentId}
          liked={likedIds?.has(s.id)}
          showAlbum={showAlbum}
          onPlay={() => onPlay(s, i)}
          onLike={onLike}
          onAddQueue={onAddQueue}
          onContextMenu={onContextMenu}
        />
      ))}
    </div>
  )
}
