import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import App from './App'
import { LoginPage } from './pages/Login'
import { HomePage } from './pages/Home'
import { SearchPage } from './pages/Search'
import { DailyPage } from './pages/Daily'
import { RadarPage } from './pages/Radar'
import { HeartModePage } from './pages/HeartMode'
import { RoamPage } from './pages/Roam'
import { PlaylistSquarePage } from './pages/PlaylistSquare'
import { RankPage } from './pages/Rank'
import { LikePage } from './pages/Like'
import { SubscribedPage } from './pages/Subscribed'
import { CloudPage } from './pages/Cloud'
import { PlaylistDetailPage } from './pages/PlaylistDetail'
import { ArtistPage } from './pages/Artist'
import { SettingsPage } from './pages/Settings'
import { DesktopLyric } from './pages/DesktopLyric'
import './styles/global.css'

const root = ReactDOM.createRoot(document.getElementById('root')!)

// 桌面歌词是独立透明窗口，走单独路由
if (window.location.hash.includes('desktop-lyric')) {
  document.body.classList.add('desktop-lyric-body')
  root.render(<DesktopLyric />)
} else {
  root.render(
    <HashRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<App />}>
          <Route index element={<Navigate to="/home" replace />} />
          <Route path="home" element={<HomePage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="daily" element={<DailyPage />} />
          <Route path="radar" element={<RadarPage />} />
          <Route path="heart" element={<HeartModePage />} />
          <Route path="roam" element={<RoamPage />} />
          <Route path="square" element={<PlaylistSquarePage />} />
          <Route path="rank" element={<RankPage />} />
          <Route path="like" element={<LikePage />} />
          <Route path="subscribed" element={<SubscribedPage />} />
          <Route path="cloud" element={<CloudPage />} />
          <Route path="playlist/:id" element={<PlaylistDetailPage />} />
          <Route path="artist/:id" element={<ArtistPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
