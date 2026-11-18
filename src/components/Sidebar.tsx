import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '@/store/auth'
import {
  IconHome, IconSearch, IconCompass, IconRadar, IconHeartMode, IconRoam,
  IconPlaylist, IconRank, IconHeart, IconStar, IconCloud, IconSettings,
  IconSun, IconMoon,
} from './Icons'
import { coverUrl } from '@/api/ncm'
import { useTheme } from '@/store/theme'

/**
 * 侧边栏（iOS 26 风格）
 *
 * 视觉：浮起的玻璃板 —— 四周有外边距、大圆角、独立阴影，
 * 与内容区之间留缝。这是 iOS 26 与旧版"贴边实心条"最大的差别。
 *
 * 结构：品牌 -> 三组导航 -> 底部用户区。
 * 类名全部走 ui.css 的 .sidebar / .nav-item，不再写内联样式。
 */
export function Sidebar() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const theme = useTheme((st) => st.theme)
  const toggleTheme = useTheme((st) => st.toggle)

  const primary = [
    { to: '/home', label: '发现音乐', icon: <IconHome /> },
    { to: '/search', label: '搜索', icon: <IconSearch /> },
  ]

  const recommend = [
    { to: '/daily', label: '每日推荐', icon: <IconCompass /> },
    { to: '/radar', label: '私人雷达', icon: <IconRadar /> },
    { to: '/heart', label: '心动模式', icon: <IconHeartMode /> },
    { to: '/roam', label: '私人漫游', icon: <IconRoam /> },
  ]

  const library = [
    { to: '/square', label: '歌单广场', icon: <IconPlaylist /> },
    { to: '/rank', label: '排行榜', icon: <IconRank /> },
    { to: '/like', label: '我喜欢的音乐', icon: <IconHeart /> },
    { to: '/subscribed', label: '收藏的歌单', icon: <IconStar /> },
    { to: '/cloud', label: '音乐网盘', icon: <IconCloud /> },
  ]

  const NavItem = ({ to, label, icon }: { to: string; label: string; icon: React.ReactNode }) => (
    <NavLink
      to={to}
      className={({ isActive }) => `nav-item${isActive ? ' is-active' : ''}`}
    >
      <span className="nav-item__icon">{icon}</span>
      <span>{label}</span>
    </NavLink>
  )

  return (
    <aside className="sidebar">
      {/* 品牌 */}
      <div className="sidebar__brand">
        <div className="brand-mark">云</div>
        <div className="brand-name">云娘音乐</div>
      </div>

      {/* 主导航 */}
      <nav className="sidebar__group">
        {primary.map((i) => <NavItem key={i.to} {...i} />)}
      </nav>

      {/* 推荐 */}
      <nav className="sidebar__group">
        <div className="sidebar__group-title">推荐</div>
        {recommend.map((i) => <NavItem key={i.to} {...i} />)}
      </nav>

      {/* 我的音乐 */}
      <nav className="sidebar__group">
        <div className="sidebar__group-title">我的音乐</div>
        {library.map((i) => <NavItem key={i.to} {...i} />)}

        {/* 主题切换：与导航项同形，但用 button */}
        <button
          className="nav-item"
          onClick={toggleTheme}
          title={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
        >
          <span className="nav-item__icon">
            {theme === 'dark' ? <IconSun /> : <IconMoon />}
          </span>
          <span>{theme === 'dark' ? '浅色模式' : '深色模式'}</span>
        </button>
      </nav>

      {/* 设置 */}
      <nav className="sidebar__group">
        <NavItem to="/settings" label="设置" icon={<IconSettings />} />
      </nav>

      {/* 用户区 */}
      <div className="sidebar__footer">
        {user && (
          <button className="user-chip" onClick={() => navigate('/settings')} title="账号设置">
            <img
              className="user-chip__avatar"
              src={coverUrl(user.avatarUrl, 80)}
              alt=""
            />
            <div className="user-chip__meta">
              <div className="user-chip__name">{user.nickname}</div>
              <div className="user-chip__sub">
                {user.vipType && user.vipType > 0 ? '黑胶 VIP' : '普通用户'}
              </div>
            </div>
            <span className="nav-item__icon"><IconSettings size={15} /></span>
          </button>
        )}
      </div>
    </aside>
  )
}
