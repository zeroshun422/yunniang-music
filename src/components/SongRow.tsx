import React from 'react'
import type { Song } from '@/types'
import { formatDuration, songCoverUrl } from '@/api/ncm'
import { VirtualList } from './VirtualList'
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

/**
 * 单曲行（iOS 26 风格）
 *
 * 视觉：整张列表是一个圆角卡片，行间是内缩分割线（由 CSS 的 ::before 画），
 * 行本身不画边框。hover 才显出操作按钮。
 */
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
      className={`u-row${isCurrent ? ' is-current' : ''}${selected ? ' is-selected' : ''}`}
      onDoubleClick={() => onPlay(song)}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e, song) }}
    >
      {/* 序号 / 播放按钮 / 勾选框 */}
      <div className="u-row__idx" onClick={() => onPlay(song)}>
        {onSelect ? (
          <input
            type="checkbox"
            checked={!!selected}
            onChange={(e) => onSelect(song, e.target.checked)}
            onClick={(e) => e.stopPropagation()}
            aria-label={`选择 ${song.name}`}
          />
        ) : (
          <>
            <span className="u-row__num">{String(index + 1).padStart(2, '0')}</span>
            <span className="u-row__play-ico"><IconPlay size={14} /></span>
          </>
        )}
      </div>

      {/* 封面 + 歌名 + 专辑 */}
      <div className="u-row__main">
        <img
          className="u-row__cover"
          src={songCoverUrl(song, 96)}
          alt=""
          loading="lazy"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden' }}
        />
        <div className="u-row__text">
          <div className="u-row__name">
            <span className="u-ellipsis">{song.name}</span>
            {isVip && <span className="u-tag">VIP</span>}
            {song.mv ? <span className="u-tag u-tag--mv">MV</span> : null}
          </div>
          {showAlbum && album && <div className="u-row__album">{album}</div>}
        </div>
      </div>

      {/* 歌手 */}
      <div className="u-row__artist" title={artists}>{artists}</div>

      {/* 时长 */}
      <div className="u-row__dur">{formatDuration(dur)}</div>

      {/* 操作（hover 才显形） */}
      <div className="u-row__actions">
        {onLike && (
          <button
            className={`u-icon-btn${liked ? ' is-active' : ''}`}
            title={liked ? '取消喜欢' : '喜欢'}
            onClick={(e) => { e.stopPropagation(); onLike(song) }}
          >
            <IconHeart size={15} filled={!!liked} />
          </button>
        )}
        {onAddQueue && (
          <button
            className="u-icon-btn"
            title="加入播放队列"
            onClick={(e) => { e.stopPropagation(); onAddQueue(song) }}
          >
            <IconPlus size={15} />
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

/** 超过该阈值启用虚拟滚动 */
const VIRTUAL_THRESHOLD = 200

/** 单行高度，需与 ui.css 的 .u-row min-height 一致 */
const ROW_HEIGHT = 56

/**
 * 歌曲列表
 *
 * 视觉：整张列表是**一个**圆角玻璃卡片（.u-list），而不是每行独立卡片。
 * 这是 iOS grouped list 与旧版裸表格的核心差别。
 */
export function SongList({
  songs, currentId, likedIds, onPlay, onLike, onAddQueue, onContextMenu,
  showAlbum = true, emptyText = '暂无歌曲',
}: SongListProps) {
  if (!songs.length) {
    return (
      <div className="u-empty">
        <div className="u-empty__icon">♪</div>
        {emptyText}
      </div>
    )
  }

  const head = (
    <div className="u-list__head">
      <div>#</div>
      <div>标题</div>
      <div>歌手</div>
      <div>时长</div>
      <div />
    </div>
  )

  const renderRow = (s: Song, i: number) => (
    <SongRow
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
  )

  // 大列表：虚拟滚动，只渲染可视区域
  if (songs.length > VIRTUAL_THRESHOLD) {
    return (
      <div className="u-list">
        {head}
        <div className="u-list__virtual">
          <VirtualList items={songs} itemHeight={ROW_HEIGHT} renderItem={renderRow} />
        </div>
      </div>
    )
  }

  return (
    <div className="u-list">
      {head}
      {songs.map((s, i) => (
        <React.Fragment key={`${s.id}-${i}`}>{renderRow(s, i)}</React.Fragment>
      ))}
    </div>
  )
}
