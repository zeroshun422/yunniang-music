import React, { useEffect, useState } from 'react'
import { create } from 'zustand'
import type { Song } from '@/types'
import { usePlayer } from '@/store/player'
import { useLibrary } from '@/store/library'
import { useAuth } from '@/store/auth'
import { IconDownload, IconPlus, IconHeart, IconPlaylist } from './Icons'

interface MenuState {
  open: boolean
  x: number
  y: number
  song: Song | null
  show: (x: number, y: number, song: Song) => void
  hide: () => void
}

export const useSongMenu = create<MenuState>((set) => ({
  open: false,
  x: 0,
  y: 0,
  song: null,
  show: (x, y, song) => set({ open: true, x, y, song }),
  hide: () => set({ open: false, song: null }),
}))

export function SongContextMenu() {
  const { open, x, y, song, hide } = useSongMenu()
  const { playSong, addToQueue, addNext } = usePlayer()
  const { toggleLike, isLiked } = useLibrary()
  const { user } = useAuth()
  const [downloading, setDownloading] = useState(false)
  const [msg, setMsg] = useState('')
  const quality = usePlayer((s) => s.quality)

  useEffect(() => {
    if (!open) return
    const close = () => hide()
    document.addEventListener('click', close)
    document.addEventListener('contextmenu', close)
    window.addEventListener('blur', close)
    return () => {
      document.removeEventListener('click', close)
      document.removeEventListener('contextmenu', close)
      window.removeEventListener('blur', close)
    }
  }, [open])

  useEffect(() => {
    const off = window.yun.onDownloadProgress((d) => {
      if (d.id === song?.id) setMsg(`下载中 ${d.percent}%`)
    })
    return off
  }, [song])

  if (!open || !song) return null

  const handleDownload = async () => {
    if (downloading) return
    setDownloading(true)
    setMsg('准备下载…')
    try {
      const r = await window.yun.download({
        id: song.id,
        name: song.name,
        artist: (song.ar || song.artists || []).map((a) => a.name).join(','),
        level: quality,
      })
      if (r.ok) {
        setMsg(`已保存 (${r.level})`)
        setTimeout(() => { hide(); setMsg(''); setDownloading(false) }, 1400)
      } else {
        setMsg('下载失败：' + r.error)
        setDownloading(false)
      }
    } catch (e: any) {
      setMsg('下载失败：' + e.message)
      setDownloading(false)
    }
  }

  return (
    <div
      className="menu glass-refract"
      style={{
        left: Math.min(x, window.innerWidth - 210),
        top: Math.min(y, window.innerHeight - 300),
        minWidth: 200,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <button className="menu-item" onClick={() => { playSong(song, usePlayer.getState().queue); hide() }}>
        立即播放
      </button>
      <button className="menu-item" onClick={() => { addNext(song); hide() }}>
        下一首播放
      </button>
      <button className="menu-item" onClick={() => { addToQueue(song); hide() }}>
        <IconPlus size={14} /> 加入播放队列
      </button>

      <div className="menu-sep" />

      {user && (
        <button
          className="menu-item"
          onClick={async () => {
            try { await toggleLike(song.id) } catch (e) {}
            hide()
          }}
        >
          <IconHeart size={14} filled={isLiked(song.id)} />
          {isLiked(song.id) ? '取消喜欢' : '喜欢'}
        </button>
      )}

      <button className="menu-item" onClick={handleDownload} disabled={downloading}>
        <IconDownload size={14} /> {downloading ? msg || '下载中…' : '下载当前音质'}
      </button>

      {msg && !downloading && (
        <div style={{ padding: '4px 11px 6px', fontSize: 11, color: 'var(--text-2)' }}>{msg}</div>
      )}
    </div>
  )
}
