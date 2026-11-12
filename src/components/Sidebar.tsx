import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '@/store/auth'
import {
  IconHome, IconSearch, IconCompass, IconRadar, IconHeartMode, IconRoam,
  IconPlaylist, IconRank, IconHeart, IconStar, IconCloud, IconUser, IconMusic, IconSettings,
} from './Icons'
import { coverUrl } from '@/api/ncm'

export function Sidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const items = [
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
    <NavLink to={to} className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>
      <span className="ico">{icon}</span>
      <span>{label}</span>
    </NavLink>
  )

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-mark">云</div>
        <div className="brand-name">云娘音乐</div>
      </div>

      <div className="sidebar-group">
        {items.map((i) => <NavItem key={i.to} {...i} />)}
      </div>

      <div className="sidebar-group">
        <div className="sidebar-group-title">推荐</div>
        {recommend.map((i) => <NavItem key={i.to} {...i} />)}
      </div>

      <div className="sidebar-group">
        <div className="sidebar-group-title">我的音乐</div>
        {library.map((i) => <NavItem key={i.to} {...i} />)}
      </div>

      <div className="sidebar-group">
        <NavItem to="/settings" label="设置" icon={<IconSettings />} />
      </div>

      <div style={{ marginTop: 'auto', padding: '10px 12px 4px' }}>
        {user && (
          <div
            onClick={() => navigate('/settings')}
            style={{
              display: 'flex', alignItems: 'center', gap: 9, padding: '8px 8px',
              borderRadius: 8, cursor: 'pointer',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            title="点击进入设置"
          >
            <img
              src={coverUrl(user.avatarUrl, 60)}
              alt=""
              style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', background: 'var(--bg-3)' }}
            />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="text-ellipsis" style={{ fontSize: 12.5 }}>{user.nickname}</div>
              <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>
                {user.vipType && user.vipType > 0 ? '黑胶 VIP' : '普通用户'}
              </div>
            </div>
            <span style={{ color: 'var(--text-3)', display: 'grid', placeItems: 'center' }}>
              <IconSettings size={15} />
            </span>
          </div>
        )}
      </div>
    </aside>
  )
}
