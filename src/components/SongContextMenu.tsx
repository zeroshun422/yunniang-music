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

    // ⚠️ 关闭逻辑要避开"正在打开新菜单"的那一次右击。
    //
    // 背景：歌曲行的 onContextMenu 是 React 合成事件（挂在根容器冒泡），
    // 这里的 document 监听也在冒泡阶段，两者顺序不稳定。
    // 症状（已实测复现）：连续右键时菜单"交替失效" ——
    // 第一次弹出、第二次什么都不弹、第三次又正常，
    // 因为上一次右键的 close 把这次刚 show 的状态抹掉了。
    //
    // 修法：在捕获阶段判断这次右击的落点。
    //   · 落在 .song-row 内 -> 行的 handler 会打开新菜单，这里不关闭
    //   · 落在其它地方       -> 关闭当前菜单（点到空白处应该收起）
    // 捕获阶段先于冒泡，因此能拿到 event.target 且不受 React 顺序影响。
    const onDocContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (target && target.closest('.song-row')) return
      close()
    }
    // 点击菜单项时不要立刻关：菜单项自己的 onClick 会调用 hide()，
    // 这里只负责"点别处收起"。用 closest 判断是否点在菜单内部。
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (target && target.closest('.menu')) return
      close()
    }

    document.addEventListener('contextmenu', onDocContextMenu, true)
    document.addEventListener('click', onDocClick)
    window.addEventListener('blur', close)

    return () => {
      document.removeEventListener('contextmenu', onDocContextMenu, true)
      document.removeEventListener('click', onDocClick)
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
