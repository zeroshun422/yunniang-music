import React, { useEffect, useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '@/store/auth'
import { usePlayer } from '@/store/player'
import { Sidebar } from '@/components/Sidebar'
import { PlayerBar } from '@/components/PlayerBar'
import { TitleBar } from '@/components/TitleBar'
import { SongContextMenu } from '@/components/SongContextMenu'
import { useUi } from '@/store/ui'
import { LoginPage } from '@/pages/Login'

/**
 * 应用骨架（iOS 26 风格）
 *
 * 层级：标题栏（固定）-> 主体（侧边栏 + 内容区）-> 播放栏（绝对定位浮于内容之上）
 *
 * 关键：播放栏**不占布局高度**，这样内容可以一直滚到窗口底部，
 * 从播放栏背后经过，实现"透见底层文字"的液态玻璃效果。
 * 内容区用 --content-inset-bottom 预留底部留白，避免最后几行被永久遮挡。
 */
export default function App() {
  const { user, ready, bootstrap } = useAuth()
  const [lyricOn, setLyricOn] = useState(false)
  const drawerOpen = useUi((s) => s.drawer !== null)

  useEffect(() => { bootstrap() }, [])

  const toggleDesktopLyric = async () => {
    const player = usePlayer.getState()
    await player.toggleDesktopLyric()
    setLyricOn(player.showDesktopLyric)
  }

  if (!ready) {
    return (
      <div className="app" style={{ display: 'grid', placeItems: 'center' }}>
        <div className="u-loading">
          <div className="u-spinner" />
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
    <div className="app">
      <TitleBar />

      {/* drawer-open 由 CSS 负责给内容区让位（推挤，不遮挡） */}
      <div className={`app-main${drawerOpen ? ' is-drawer-open' : ''}`}>
        <Sidebar />

        <main className="content">
          <div className="content__scroll">
            <div className="content__inner">
              <Outlet />
            </div>
          </div>
        </main>
      </div>

      {/* 播放栏：绝对定位，浮于内容之上 */}
      <PlayerBar onToggleDesktopLyric={toggleDesktopLyric} />

      <SongContextMenu />
    </div>
  )
}
