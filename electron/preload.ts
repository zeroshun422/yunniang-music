import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // 配置
  getConfig: () => ipcRenderer.invoke('app:getConfig'),
  getPlatform: () => ipcRenderer.invoke('app:getPlatform'),

  // 登录态
  saveCookie: (c) => ipcRenderer.invoke('auth:saveCookie', c),
  loadCookie: () => ipcRenderer.invoke('auth:loadCookie'),
  clearCookie: () => ipcRenderer.invoke('auth:clearCookie'),

  // 网易云接口（自动带 Cookie）
  ncm: (path, opts) => ipcRenderer.invoke('ncm:request', { path, ...(opts || {}) }),
  ncmWithCookie: (path, cookie) => ipcRenderer.invoke('ncm:requestWithCookie', { path, cookie }),

  // 音质
  probeAudio: (id, level) => ipcRenderer.invoke('audio:probe', { id, level }),

  // 下载
  download: (payload) => ipcRenderer.invoke('audio:download', payload),
  onDownloadProgress: (cb) => {
    const h = (_e, data) => cb(data)
    ipcRenderer.on('audio:downloadProgress', h)
    return () => ipcRenderer.removeListener('audio:downloadProgress', h)
  },
  openDownloadDir: () => ipcRenderer.invoke('audio:openDownloadDir'),

  // 桌面歌词
  lyricShow: (text) => ipcRenderer.invoke('lyric:show', text),
  lyricUpdate: (payload) => ipcRenderer.invoke('lyric:update', payload),
  lyricHide: () => ipcRenderer.invoke('lyric:hide'),
  lyricToggle: () => ipcRenderer.invoke('lyric:toggle'),
  lyricSetIgnoreMouse: (v) => ipcRenderer.invoke('lyric:setIgnoreMouse', v),
  onLyricUpdate: (cb) => {
    const h = (_e, data) => cb(data)
    ipcRenderer.on('lyric:update', h)
    return () => ipcRenderer.removeListener('lyric:update', h)
  },

  // 自动更新
  getUpdateInfo: () => ipcRenderer.invoke('update:info'),
  getUpdateStatus: () => ipcRenderer.invoke('update:status'),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  openReleasePage: () => ipcRenderer.invoke('update:openReleasePage'),
  onUpdateStatus: (cb) => {
    const h = (_e, data) => cb(data)
    ipcRenderer.on('update:status', h)
    return () => ipcRenderer.removeListener('update:status', h)
  },

  // 窗口
  winMinimize: () => ipcRenderer.invoke('win:minimize'),
  winMaximize: () => ipcRenderer.invoke('win:maximize'),
  winClose: () => ipcRenderer.invoke('win:close'),
  winIsMaximized: () => ipcRenderer.invoke('win:isMaximized'),
  onMaximized: (cb) => {
    const h = (_e, v) => cb(v)
    ipcRenderer.on('win:maximized', h)
    return () => ipcRenderer.removeListener('win:maximized', h)
  },
}

contextBridge.exposeInMainWorld('yun', api)
