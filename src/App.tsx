import React, { useEffect, useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/store/auth'
import { usePlayer } from '@/store/player'
import { Sidebar } from '@/components/Sidebar'
import { PlayerBar } from '@/components/PlayerBar'
import { TitleBar } from '@/components/TitleBar'
import { SongContextMenu } from '@/components/SongContextMenu'
import { useUi } from '@/store/ui'
import { LoginPage } from '@/pages/Login'

export default function App() {
  const { user, ready, bootstrap } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [lyricOn, setLyricOn] = useState(false)
  // 抽屉打开时给主内容区让位，避免面板覆盖页面内容（P0 修复）
  const drawerOpen = useUi((s) => s.drawer !== null)

  useEffect(() => { bootstrap() }, [])

  const toggleDesktopLyric = async () => {
    const player = usePlayer.getState()
    await player.toggleDesktopLyric()
    setLyricOn(player.showDesktopLyric)
  }

  if (!ready) {
    return (
      <div style={{ height: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg-0)' }}>
        <div className="loading-wrap">
          <div className="spinner" />
          <div>正在启动云娘音乐…</div>
        </div>
      </div>
    )
  }

  // 未登录强制到登录页
  if (!user) {
    return <LoginPage />
  }

  return (
    <div className="app-shell">
      <TitleBar />
      <div className={`app-body${drawerOpen ? ' drawer-open' : ''}`}>
        <Sidebar />
        <div className="main-area">
          <Outlet />
        </div>
      </div>
      <PlayerBar onToggleDesktopLyric={toggleDesktopLyric} />
      <SongContextMenu />
    </div>
  )
}
