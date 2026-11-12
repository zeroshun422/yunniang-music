// 轻量 SVG 图标集（避免引入图标库依赖）
import React from 'react'

interface P { size?: number; className?: string; strokeWidth?: number }
const base = (size: number) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
})

export const IconSearch = ({ size = 18, strokeWidth = 2 }: P) => (
  <svg {...base(size)} strokeWidth={strokeWidth}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
)
export const IconPlay = ({ size = 18 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 001.5.87l10-6.5a1 1 0 000-1.74l-10-6.5A1 1 0 008 5.5z" /></svg>
)
export const IconPause = ({ size = 18 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><rect x="6.5" y="5" width="4" height="14" rx="1.4" /><rect x="13.5" y="5" width="4" height="14" rx="1.4" /></svg>
)
export const IconNext = ({ size = 18 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M6 5.6v12.8a1 1 0 001.52.85l9.2-6.4a1 1 0 000-1.7l-9.2-6.4A1 1 0 006 5.6z" /><rect x="17.2" y="5" width="2.6" height="14" rx="1.3" /></svg>
)
export const IconPrev = ({ size = 18 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M18 5.6v12.8a1 1 0 01-1.52.85l-9.2-6.4a1 1 0 010-1.7l9.2-6.4A1 1 0 0118 5.6z" /><rect x="4.2" y="5" width="2.6" height="14" rx="1.3" /></svg>
)
export const IconVolume = ({ size = 18 }: P) => (
  <svg {...base(size)} strokeWidth={1.9}><path d="M11 5L6.5 9H3v6h3.5L11 19V5z" /><path d="M15.5 8.5a5 5 0 010 7" /></svg>
)
export const IconVolumeMute = ({ size = 18 }: P) => (
  <svg {...base(size)} strokeWidth={1.9}><path d="M11 5L6.5 9H3v6h3.5L11 19V5z" /><path d="M16 9.5l5 5M21 9.5l-5 5" /></svg>
)
export const IconHeart = ({ size = 18, filled = false }: P & { filled?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20.3l-1.2-1.1C6 14.9 3 12.1 3 8.6 3 5.9 5.1 4 7.7 4c1.6 0 3.1.8 4.3 2.2C13.2 4.8 14.7 4 16.3 4 18.9 4 21 5.9 21 8.6c0 3.5-3 6.3-7.8 10.6L12 20.3z" />
  </svg>
)
export const IconPlus = ({ size = 18 }: P) => (
  <svg {...base(size)} strokeWidth={2}><path d="M12 5v14M5 12h14" /></svg>
)
export const IconClose = ({ size = 18 }: P) => (
  <svg {...base(size)} strokeWidth={2}><path d="M6 6l12 12M18 6L6 18" /></svg>
)
export const IconMin = ({ size = 18 }: P) => (
  <svg {...base(size)} strokeWidth={1.6}><path d="M5 12h14" /></svg>
)
export const IconMax = ({ size = 18 }: P) => (
  <svg {...base(size)} strokeWidth={1.6}><rect x="6" y="6" width="12" height="12" rx="1.6" /></svg>
)
export const IconRestore = ({ size = 18 }: P) => (
  <svg {...base(size)} strokeWidth={1.6}><rect x="8" y="4" width="12" height="12" rx="1.6" /><path d="M16 16v2.4A1.6 1.6 0 0114.4 20H5.6A1.6 1.6 0 014 18.4V9.6A1.6 1.6 0 015.6 8H8" /></svg>
)
export const IconBack = ({ size = 18 }: P) => (
  <svg {...base(size)} strokeWidth={2}><path d="M15 5l-7 7 7 7" /></svg>
)
export const IconForward = ({ size = 18 }: P) => (
  <svg {...base(size)} strokeWidth={2}><path d="M9 5l7 7-7 7" /></svg>
)
export const IconHome = ({ size = 17 }: P) => (
  <svg {...base(size)} strokeWidth={1.8}><path d="M4 10.5L12 4l8 6.5" /><path d="M6 10v9h12v-9" /></svg>
)
export const IconCompass = ({ size = 17 }: P) => (
  <svg {...base(size)} strokeWidth={1.8}><circle cx="12" cy="12" r="8.5" /><path d="M15.5 8.5l-2 5-5 2 2-5 5-2z" /></svg>
)
export const IconRadar = ({ size = 17 }: P) => (
  <svg {...base(size)} strokeWidth={1.8}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4" /><path d="M12 12l5.5-5.5" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /></svg>
)
export const IconHeartMode = ({ size = 17 }: P) => (
  <svg {...base(size)} strokeWidth={1.8}><path d="M12 19.5l-1-.9C6.5 14.9 4 12.5 4 9.6 4 7.3 5.8 5.5 8.1 5.5c1.4 0 2.8.7 3.9 2 1.1-1.3 2.5-2 3.9-2 2.3 0 4.1 1.8 4.1 4.1 0 2.9-2.5 5.3-7 9.2l-1 .7z" /></svg>
)
export const IconRoam = ({ size = 17 }: P) => (
  <svg {...base(size)} strokeWidth={1.8}><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.2 2.3 3.3 5.3 3.3 8.5s-1.1 6.2-3.3 8.5c-2.2-2.3-3.3-5.3-3.3-8.5S9.8 5.8 12 3.5z" /></svg>
)
export const IconPlaylist = ({ size = 17 }: P) => (
  <svg {...base(size)} strokeWidth={1.8}><path d="M4 7h11M4 12h11M4 17h7" /><circle cx="18" cy="16" r="2.6" /><path d="M20.6 16V8.5" /></svg>
)
export const IconRank = ({ size = 17 }: P) => (
  <svg {...base(size)} strokeWidth={1.8}><path d="M5 20V11M12 20V4M19 20v-6" /></svg>
)
export const IconCloud = ({ size = 17 }: P) => (
  <svg {...base(size)} strokeWidth={1.8}><path d="M7.5 18.5A4 4 0 017 10.6 5.5 5.5 0 0117.6 12a3.3 3.3 0 01-.6 6.5H7.5z" /></svg>
)
export const IconStar = ({ size = 17 }: P) => (
  <svg {...base(size)} strokeWidth={1.8}><path d="M12 4.5l2.3 4.7 5.2.75-3.75 3.65.9 5.2-4.65-2.45-4.65 2.45.9-5.2L4.5 9.95l5.2-.75L12 4.5z" /></svg>
)
export const IconLyric = ({ size = 17 }: P) => (
  <svg {...base(size)} strokeWidth={1.8}><path d="M4 6h16M4 11h10M4 16h13M4 21h7" /></svg>
)
export const IconDownload = ({ size = 17 }: P) => (
  <svg {...base(size)} strokeWidth={1.8}><path d="M12 4v11M12 15l-4-4M12 15l4-4" /><path d="M4 19h16" /></svg>
)
export const IconQueue = ({ size = 17 }: P) => (
  <svg {...base(size)} strokeWidth={1.8}><path d="M4 6h12M4 12h12M4 18h8" /><path d="M20 8v10" /><circle cx="18.5" cy="18" r="1.6" /></svg>
)
export const IconRepeat = ({ size = 17 }: P) => (
  <svg {...base(size)} strokeWidth={1.9}><path d="M17 3.5l2.5 2.5L17 8.5" /><path d="M19.5 6H7a3.5 3.5 0 00-3.5 3.5v1" /><path d="M7 20.5L4.5 18 7 15.5" /><path d="M4.5 18H17a3.5 3.5 0 003.5-3.5v-1" /></svg>
)
export const IconRepeatOne = ({ size = 17 }: P) => (
  <svg {...base(size)} strokeWidth={1.9}><path d="M17 3.5l2.5 2.5L17 8.5" /><path d="M19.5 6H7a3.5 3.5 0 00-3.5 3.5v1" /><path d="M7 20.5L4.5 18 7 15.5" /><path d="M4.5 18H17a3.5 3.5 0 003.5-3.5v-1" /><path d="M11 10.5h1.5V14" strokeWidth={1.6} /></svg>
)
export const IconShuffle = ({ size = 17 }: P) => (
  <svg {...base(size)} strokeWidth={1.9}><path d="M17 4l2.5 2.5L17 9" /><path d="M17 15l2.5 2.5L17 20" /><path d="M3.5 6.5h3.2c1.3 0 2.5.7 3.2 1.8l4.2 6.4c.7 1.1 1.9 1.8 3.2 1.8h2.2" /><path d="M3.5 17.5h3.2c1.3 0 2.5-.7 3.2-1.8l.9-1.4" /><path d="M14.6 9.2l1.7-2.6c.7-1.1 1.9-1.8 3.2-1.8" /></svg>
)
export const IconChevronDown = ({ size = 16 }: P) => (
  <svg {...base(size)} strokeWidth={2}><path d="M6 9.5l6 6 6-6" /></svg>
)
export const IconUser = ({ size = 17 }: P) => (
  <svg {...base(size)} strokeWidth={1.8}><circle cx="12" cy="8" r="4" /><path d="M4.5 20c1.2-3.6 4.1-5.5 7.5-5.5s6.3 1.9 7.5 5.5" /></svg>
)
export const IconMusic = ({ size = 17 }: P) => (
  <svg {...base(size)} strokeWidth={1.8}><circle cx="7" cy="17.5" r="2.8" /><circle cx="17.5" cy="15" r="2.8" /><path d="M9.8 17.5V7l10.5-2.5v10.5" /></svg>
)
export const IconFolder = ({ size = 17 }: P) => (
  <svg {...base(size)} strokeWidth={1.8}><path d="M3.5 6.5A1.5 1.5 0 015 5h4l2 2.5h8A1.5 1.5 0 0120.5 9v8a1.5 1.5 0 01-1.5 1.5H5A1.5 1.5 0 013.5 17V6.5z" /></svg>
)

export const IconSettings = ({ size = 17 }: P) => (
  <svg {...base(size)} strokeWidth={1.8}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.4 14.5a1.6 1.6 0 00.32 1.77l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.6 1.6 0 00-1.77-.32 1.6 1.6 0 00-.97 1.46V20.5a2 2 0 11-4 0v-.1a1.6 1.6 0 00-1.05-1.46 1.6 1.6 0 00-1.77.32l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.6 1.6 0 00.32-1.77 1.6 1.6 0 00-1.46-.97H3.5a2 2 0 110-4h.1a1.6 1.6 0 001.46-1.05 1.6 1.6 0 00-.32-1.77l-.06-.06a2 2 0 112.83-2.83l.06.06a1.6 1.6 0 001.77.32H9.4a1.6 1.6 0 00.97-1.46V3.5a2 2 0 114 0v.1a1.6 1.6 0 00.97 1.46 1.6 1.6 0 001.77-.32l.06-.06a2 2 0 112.83 2.83l-.06.06a1.6 1.6 0 00-.32 1.77v.05a1.6 1.6 0 001.46.97h.1a2 2 0 110 4h-.1a1.6 1.6 0 00-1.46.97z" />
  </svg>
)
