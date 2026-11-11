// 共享类型定义
export interface Artist {
  id: number
  name: string
  picUrl?: string
  img1v1Url?: string
}

export interface Album {
  id: number
  name: string
  picUrl?: string
  artists?: Artist[]
  publishTime?: number
}

export interface Song {
  id: number
  name: string
  ar?: Artist[]
  al?: Album
  dt?: number
  fee?: number
  mv?: number
  alia?: string[]
  // 搜索结果里的旧字段
  artists?: Artist[]
  album?: Album
  duration?: number
}

export interface Playlist {
  id: number
  name: string
  coverImgUrl?: string
  picUrl?: string
  description?: string
  trackCount?: number
  playCount?: number
  /** 部分接口（如 /recommend/resource）用小写 playcount */
  playcount?: number
  creator?: { nickname: string; avatarUrl?: string; userId?: number }
  tracks?: Song[]
  subscribed?: boolean
  updateTime?: number
  tags?: string[]
}

export interface UserProfile {
  userId: number
  nickname: string
  avatarUrl: string
  signature?: string
  level?: number
  vipType?: number
}

export type QualityLevel =
  | 'standard'
  | 'higher'
  | 'exhigh'
  | 'lossless'
  | 'hires'
  | 'jyeffect'
  | 'sky'
  | 'jymaster'

export interface QualityOption {
  level: QualityLevel
  label: string
  br: number
  badge?: string
  desc: string
}

export interface LyricLine {
  time: number
  text: string
  trans?: string
}

export interface DownloadTask {
  id: number
  name: string
  artist: string
  percent: number
  status: 'pending' | 'downloading' | 'done' | 'error'
  path?: string
  error?: string
  level?: QualityLevel
}
