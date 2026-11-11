import { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage } from 'electron'
import path from 'node:path'
import http from 'node:http'
import net from 'node:net'
import fs from 'node:fs'
import crypto from 'node:crypto'

// ---------------------------------------------------------------------------
// 云娘音乐 — Electron 主进程
// 负责：内嵌网易云 API 服务、Cookie 安全持久化、音质代理、缓存下载、桌面歌词窗口
// ---------------------------------------------------------------------------

// 仅当显式提供了 Vite dev server 地址时才走开发模式；
// 否则一律加载已构建的 dist/，这样 `npm start`（未打包）也能正常运行。
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || ''
const isDev = !!DEV_SERVER_URL
const PROXY_PORT_MIN = 47100
const PROXY_PORT_MAX = 47140
const NCM_API_PORT_MIN = 47200
const NCM_API_PORT_MAX = 47240

// Chromium 在部分 Linux (特别是无沙箱的 AppImage / 旧内核) 需要放宽
if (process.env.YUNNIANG_DISABLE_SANDBOX !== '1') {
  app.commandLine.appendSwitch('no-sandbox')
}

// 关键：显式设置 WM_CLASS，让桌面环境能把窗口与 .desktop 条目/图标正确关联。
// 若不同步设置，Cinnamon/GNOME 任务栏会显示默认占位图标。
app.setName('yunniang-music')
if (process.platform === 'linux') {
  // Linux 下 WM_CLASS 由 app name 推导，需在 ready 之前固定
  app.commandLine.appendSwitch('class', 'yunniang-music')
}
app.commandLine.appendSwitch('disable-gpu-sandbox')
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

// 单实例锁
if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

let mainWindow = null
let lyricWindow = null
let tray = null
let apiBaseUrl = ''
let apiServer = null

// userData 路径：登录 Cookie、缓存、下载都放在这里
const userDataDir = app.getPath('userData')
const cookieFile = path.join(userDataDir, 'login-session.bin')
const downloadDir = path.join(app.getPath('music'), '云娘音乐下载')
const cacheDir = path.join(userDataDir, 'audio-cache')

for (const d of [downloadDir, cacheDir]) {
  try { fs.mkdirSync(d, { recursive: true }) } catch (e) { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Cookie 加密持久化（不落明文，密钥由机器信息派生）
// ---------------------------------------------------------------------------
function deriveKey() {
  const seed = [
    'yunniang-music-v1',
    app.getPath('userData'),
    process.env.HOME || '',
    require('node:os').hostname(),
  ].join('|')
  return crypto.createHash('sha256').update(seed).digest()
}

function saveCookie(cookieStr) {
  try {
    const key = deriveKey()
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
    const enc = Buffer.concat([cipher.update(cookieStr, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    const payload = Buffer.concat([iv, tag, enc]).toString('base64')
    fs.writeFileSync(cookieFile, payload, { mode: 0o600 })
    return true
  } catch (e) {
    console.error('[cookie] save failed', e)
    return false
  }
}

function loadCookie() {
  try {
    if (!fs.existsSync(cookieFile)) return ''
    const raw = Buffer.from(fs.readFileSync(cookieFile, 'utf8'), 'base64')
    const iv = raw.subarray(0, 12)
    const tag = raw.subarray(12, 28)
    const enc = raw.subarray(28)
    const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(), iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
  } catch (e) {
    console.error('[cookie] load failed', e)
    return ''
  }
}

function clearCookie() {
  try { fs.unlinkSync(cookieFile) } catch (e) { /* ignore */ }
}

// ---------------------------------------------------------------------------
// 内嵌 NeteaseCloudMusicApi
// ---------------------------------------------------------------------------
function findFreePort(start, end) {
  return new Promise((resolve) => {
    let port = start
    const tryPort = () => {
      if (port > end) return resolve(0)
      const srv = net.createServer()
      srv.once('error', () => { port++; tryPort() })
      srv.once('listening', () => srv.close(() => resolve(port)))
      srv.listen(port, '127.0.0.1')
    }
    tryPort()
  })
}

async function startEmbeddedApi() {
  // 打包后 API 模块位于 resources/NeteaseCloudMusicApi
  // 开发时位于 <project>/node_modules/NeteaseCloudMusicApi
  const candidates = [
    // 打包后：模块在 asar 内的 node_modules 中
    path.join(app.getAppPath(), 'node_modules', 'NeteaseCloudMusicApi'),
    path.join(process.resourcesPath || '', 'app.asar', 'node_modules', 'NeteaseCloudMusicApi'),
    // 兼容旧布局（extraResources）
    path.join(process.resourcesPath || '', 'NeteaseCloudMusicApi'),
    path.join(app.getAppPath(), 'node_modules', 'NeteaseCloudMusicApi'),
    path.join(app.getAppPath(), '..', 'node_modules', 'NeteaseCloudMusicApi'),
    path.join(__dirname, '..', 'node_modules', 'NeteaseCloudMusicApi'),
    path.join(process.cwd(), 'node_modules', 'NeteaseCloudMusicApi'),
  ]

  const apiRoot = candidates.find((p) => p && fs.existsSync(path.join(p, 'server.js')))
  if (!apiRoot) {
    throw new Error(
      '内嵌 API 模块缺失，已尝试以下路径：\n' + candidates.join('\n')
    )
  }
  console.log('[api] 模块路径:', apiRoot)

  process.env.NETEASE_API_ROOT = apiRoot

  // 关键：NeteaseCloudMusicApi/util/request.js 在「被 require 时」就会同步读取
  // <tmpdir>/anonymous_token，若文件不存在会直接抛 ENOENT 导致应用启动崩溃。
  // 因此必须在 require 之前确保该文件存在（全新系统首次启动时它并不存在）。
  const anonTokenPath = path.resolve(require('node:os').tmpdir(), 'anonymous_token')
  if (!fs.existsSync(anonTokenPath)) {
    try {
      fs.writeFileSync(anonTokenPath, '', { encoding: 'utf-8', mode: 0o600 })
      console.log('[api] 已创建 anonymous_token:', anonTokenPath)
    } catch (e) {
      console.warn('[api] 无法创建 anonymous_token:', e.message)
    }
  }

  const serverJs = path.join(apiRoot, "server.js")
  const { serveNcmApi } = require(serverJs)
  const generateConfig = require(path.join(apiRoot, 'generateConfig.js'))

  try { await generateConfig() } catch (e) { console.warn('[api] generateConfig warn', e.message) }

  // 关键修复：generateConfig 会生成一个「随机中国 IP」写入 global.cnIp，
  // 服务端把来自 ::1 的请求的 X-Real-IP 替换成该随机 IP，
  // 而网易云服务端会因 IP 与真实出口 IP 不符触发风控（code -460）。
  // 清空它，让请求不携带伪造的 X-Real-IP。
  global.cnIp = ''

  const port = await findFreePort(NCM_API_PORT_MIN, NCM_API_PORT_MAX)
  if (!port) throw new Error('找不到可用端口启动内嵌 API')

  await serveNcmApi({ port, host: '127.0.0.1', checkVersion: false })
  apiBaseUrl = `http://127.0.0.1:${port}`
  console.log('[api] embedded server at', apiBaseUrl)
  return apiBaseUrl
}

// ---------------------------------------------------------------------------
// 音频代理：解决防盗链 Referer、跨域、音质回退，并做本地缓存
// ---------------------------------------------------------------------------
const QUALITY_CHAIN = {
  // 请求音质 -> 允许回退的顺序（高到低）
  jymaster: ['jymaster', 'hires', 'lossless', 'exhigh', 'higher', 'standard'],
  hires: ['hires', 'lossless', 'exhigh', 'higher', 'standard'],
  lossless: ['lossless', 'exhigh', 'higher', 'standard'],
  exhigh: ['exhigh', 'higher', 'standard'],
  higher: ['higher', 'standard'],
  standard: ['standard'],
}

const BR_TO_LEVEL = {
  128000: 'standard',
  192000: 'higher',
  320000: 'exhigh',
  999000: 'lossless',
}

function levelToBr(level) {
  switch (level) {
    case 'standard': return 128000
    case 'higher': return 192000
    case 'exhigh': return 320000
    case 'lossless': return 999000
    case 'hires': return 1900000
    case 'jymaster': return 1999000
    default: return 320000
  }
}

async function ncmGet(apiPath, cookie, timeoutMs = 15000) {
  const url = apiBaseUrl + apiPath
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const headers = {}
    if (cookie) headers['cookie'] = cookie
    const res = await fetch(url, { headers, signal: controller.signal })
    const text = await res.text()
    try { return JSON.parse(text) } catch (e) { return { code: -1, raw: text } }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 依据返回的码率与格式反推真实音质档位。
 * 网易云在账号无权限时会「静默降级」——照样返回 200，
 * 但 br 只有 128000/320000 且 type 是 MP3，此时不能标称无损。
 */
function inferRealLevel(requested, br, type) {
  const t = String(type || '').toLowerCase()
  const isFlacLike = t.includes('flac') || t.includes('ape') || t.includes('wav')
  const kbps = Math.round((Number(br) || 0) / 1000)

  // 无损类档位必须以无损格式 + 高码率为准
  if (requested === 'lossless' || requested === 'hires' || requested === 'jymaster') {
    if (isFlacLike && kbps >= 700) return requested
    if (isFlacLike && kbps >= 500) return 'lossless'
    if (kbps >= 320) return 'exhigh'
    if (kbps >= 192) return 'higher'
    return 'standard'
  }
  if (requested === 'exhigh') {
    if (isFlacLike && kbps >= 700) return 'lossless'
    return kbps >= 300 ? 'exhigh' : kbps >= 180 ? 'higher' : 'standard'
  }
  if (requested === 'higher') {
    if (kbps >= 300) return 'exhigh'
    return kbps >= 180 ? 'higher' : 'standard'
  }
  if (isFlacLike && kbps >= 700) return 'lossless'
  return 'standard'
}

/**
 * 获取歌曲播放地址。
 * 网易云对 /song/url/v1 有随机风控（返回 -460），实测概率约 40–60%，
 * 因此同一音质档位需要短间隔重试；全部档位都失败才判定失败。
 * 返回 { url, br, type, size, level, fee }
 */
async function resolveSongUrl(songId, wantedLevel, cookie) {
  const chain = QUALITY_CHAIN[wantedLevel] || QUALITY_CHAIN.exhigh
  let lastErr = null
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

  for (const level of chain) {
    // 每个档位最多试 5 次，短随机退避绕开风控
    for (let attempt = 0; attempt < 5; attempt++) {
      if (attempt > 0) await sleep(160 + Math.random() * 240)

      try {
        const r = await ncmGet(
          `/song/url/v1?id=${encodeURIComponent(songId)}&level=${level}&encodeType=flac`,
          cookie
        )
        const item = r && r.data && r.data[0]
        if (r.code === 200 && item && item.url) {
          // 服务端可能悄悄降级：返回 128k MP3 却声称 lossless。
          // 以实际 br/type 反推真实档位，避免 UI 虚标「无损」。
          const realLevel = inferRealLevel(level, item.br, item.type)
          return { url: item.url, br: item.br, type: item.type, size: item.size, level: realLevel, requestedLevel: level, fee: item.fee }
        }
        lastErr = (r && (r.message || r.msg)) || `v1 level=${level} 无链接`
        // 非风控类错误（如无版权 -200/-447）无需重试，直接换档
        if (r && r.code !== -460 && r.code !== -462) break
      } catch (e) {
        lastErr = e.message
      }
    }

    // 旧接口兜底（encodeType 不参与，成功率更高但音质上限较低）
    try {
      const br = levelToBr(level)
      const r2 = await ncmGet(`/song/url?id=${encodeURIComponent(songId)}&br=${br}`, cookie)
      const item2 = r2 && r2.data && r2.data[0]
      if (r2.code === 200 && item2 && item2.url) {
        const realLevel = inferRealLevel(level, item2.br, item2.type)
        return { url: item2.url, br: item2.br, type: item2.type, size: item2.size, level: realLevel, requestedLevel: level, fee: item2.fee }
      }
    } catch (e) { /* continue */ }
  }
  return { url: null, error: lastErr || '无法获取播放地址' }
}

function startAudioProxy() {
  return new Promise(async (resolve) => {
    const port = await findFreePort(PROXY_PORT_MIN, PROXY_PORT_MAX)
    if (!port) return resolve('')

    const server = http.createServer(async (req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1')
      res.setHeader('Access-Control-Allow-Origin', '*')

      // /audio?id=xxx&level=lossless
      if (u.pathname === '/audio') {
        const id = u.searchParams.get('id')
        const level = u.searchParams.get('level') || 'exhigh'
        const cookie = loadCookie()
        if (!id) { res.writeHead(400); return res.end(JSON.stringify({ code: 400, msg: 'missing id' })) }

        const info = await resolveSongUrl(id, level, cookie)
        if (!info.url) {
          res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' })
          return res.end(JSON.stringify({ code: 404, msg: info.error, level }))
        }

        // 让前端能通过 HEAD 拿到真实音质信息
        if (req.method === 'HEAD') {
          res.writeHead(200, {
            'content-type': 'application/json; charset=utf-8',
            'x-audio-br': String(info.br || 0),
            'x-audio-type': String(info.type || ''),
            'x-audio-level': String(info.level || ''),
          })
          return res.end()
        }

        try {
          const r = await fetch(info.url, {
            headers: {
              'Referer': 'https://music.163.com/',
              'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
              ...(req.headers.range ? { Range: req.headers.range } : {}),
            },
          })
          res.writeHead(r.status === 206 ? 206 : 200, {
            'content-type': r.headers.get('content-type') || 'audio/mpeg',
            'x-audio-br': String(info.br || 0),
            'x-audio-type': String(info.type || ''),
            'x-audio-level': String(info.level || ''),
            'accept-ranges': 'bytes',
            ...(r.headers.get('content-range') ? { 'content-range': r.headers.get('content-range') } : {}),
            ...(r.headers.get('content-length') ? { 'content-length': r.headers.get('content-length') } : {}),
          })
          const buf = Buffer.from(await r.arrayBuffer())
          res.end(buf)
        } catch (e) {
          res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ code: 502, msg: 'proxy fetch failed: ' + e.message }))
        }
        return
      }

      // /info?id=xxx&level=lossless — 只查音质信息，不下载音频
      if (u.pathname === '/info') {
        const id = u.searchParams.get('id')
        const level = u.searchParams.get('level') || 'lossless'
        const info = await resolveSongUrl(id, level, loadCookie())
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
        return res.end(JSON.stringify({
          code: info.url ? 200 : 404,
          requested: level,
          actualLevel: info.level || null,
          downgraded: !!(info.requestedLevel && info.level && info.level !== info.requestedLevel),
          br: info.br || 0,
          type: info.type || null,
          size: info.size || 0,
          fee: info.fee ?? null,
          error: info.error || null,
        }))
      }

      res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ code: 404 }))
    })

    server.listen(port, '127.0.0.1', () => {
      console.log('[proxy] audio proxy at http://127.0.0.1:' + port)
      resolve(`http://127.0.0.1:${port}`)
    })
  })
}

export function getProxyBase() { return proxyBase || '' }
let proxyBase = ''

// ---------------------------------------------------------------------------
// 下载（无损缓存到磁盘）
// ---------------------------------------------------------------------------
async function downloadSong({ id, name, artist, level }, onProgress) {
  const info = await resolveSongUrl(id, level || 'lossless', loadCookie())
  if (!info.url) throw new Error(info.error || '无法获取下载地址')

  const safe = (s) => String(s || '').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80)
  const ext = (info.type || 'mp3').toLowerCase().includes('flac') ? 'flac' : (info.type || 'mp3').toLowerCase()
  const filename = `${safe(name)} - ${safe(artist)}.${ext}`
  const dest = path.join(downloadDir, filename)

  const r = await fetch(info.url, {
    headers: { Referer: 'https://music.163.com/', 'User-Agent': 'Mozilla/5.0' },
  })
  if (!r.ok) throw new Error('下载失败 HTTP ' + r.status)

  const total = Number(r.headers.get('content-length') || 0)
  const chunks = []
  let received = 0
  const reader = r.body.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(Buffer.from(value))
    received += value.length
    if (onProgress && total) onProgress({ received, total, percent: Math.round(received / total * 100) })
  }
  fs.writeFileSync(dest, Buffer.concat(chunks))
  return { path: dest, size: received, level: info.level, br: info.br, ext }
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------
function setupIPC() {
  ipcMain.handle('app:getConfig', () => ({
    apiBase: apiBaseUrl,
    proxyBase,
    downloadDir,
    cacheDir,
    version: app.getVersion(),
    isDev,
  }))

  ipcMain.handle('app:getPlatform', () => ({
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  }))

  // --- 登录态 ---
  ipcMain.handle('auth:saveCookie', (_e, cookie) => saveCookie(cookie))
  ipcMain.handle('auth:loadCookie', () => loadCookie())
  ipcMain.handle('auth:clearCookie', () => { clearCookie(); return true })

  // --- 网易云接口透传（带上登录 Cookie） ---
  ipcMain.handle('ncm:request', async (_e, { path: apiPath, method = 'GET', body }) => {
    const cookie = loadCookie()
    // 不注入 realIP：伪造的来源 IP 会触发网易云风控（code -460）
    const url = apiBaseUrl + apiPath
    try {
      const headers = { 'content-type': 'application/json' }
      if (cookie) headers['cookie'] = cookie
      const res = await fetch(url, {
        method,
        headers,
        body: method === 'POST' && body ? JSON.stringify(body) : undefined,
      })
      const text = await res.text()
      let data
      try { data = JSON.parse(text) } catch (e) { data = { code: -1, raw: text } }

      // 捕获刷新后的 Cookie（登录接口会 Set-Cookie）
      const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []
      if (setCookies.length) {
        const merged = mergeCookie(cookie, setCookies)
        saveCookie(merged)
      }
      return data
    } catch (e) {
      return { code: -1, msg: '请求失败: ' + e.message }
    }
  })

  // 允许前端直接指定 cookie（登录流程中）
  ipcMain.handle('ncm:requestWithCookie', async (_e, { path: apiPath, cookie }) => {
    const url = apiBaseUrl + apiPath
    try {
      const res = await fetch(url, { headers: { cookie: cookie || '' } })
      const text = await res.text()
      try { return JSON.parse(text) } catch (e) { return { code: -1, raw: text } }
    } catch (e) {
      return { code: -1, msg: e.message }
    }
  })

  // --- 音质探测 ---
  ipcMain.handle('audio:probe', async (_e, { id, level }) => {
    if (!proxyBase) return { code: -1, msg: '代理未启动' }
    try {
      const r = await fetch(`${proxyBase}/info?id=${encodeURIComponent(id)}&level=${level}`)
      return await r.json()
    } catch (e) { return { code: -1, msg: e.message } }
  })

  // --- 下载 ---
  ipcMain.handle('audio:download', async (e, payload) => {
    const sender = e.sender
    try {
      const result = await downloadSong(payload, (p) => {
        sender.send('audio:downloadProgress', { id: payload.id, ...p })
      })
      return { ok: true, ...result }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('audio:openDownloadDir', () => shell.openPath(downloadDir))

  // --- 桌面歌词窗口 ---
  ipcMain.handle('lyric:show', (_e, text) => {
    if (!lyricWindow) createLyricWindow()
    if (lyricWindow) {
      lyricWindow.show()
      lyricWindow.webContents.send('lyric:update', text)
    }
    return true
  })
  ipcMain.handle('lyric:update', (_e, payload) => {
    if (lyricWindow && !lyricWindow.isDestroyed()) lyricWindow.webContents.send('lyric:update', payload)
    return true
  })
  ipcMain.handle('lyric:hide', () => { if (lyricWindow) lyricWindow.hide(); return true })
  ipcMain.handle('lyric:toggle', () => {
    if (lyricWindow && lyricWindow.isVisible()) { lyricWindow.hide(); return false }
    if (!lyricWindow) createLyricWindow()
    lyricWindow.show(); return true
  })
  ipcMain.handle('lyric:setIgnoreMouse', (_e, ignore) => {
    if (lyricWindow) lyricWindow.setIgnoreMouseEvents(!!ignore, { forward: true })
    return true
  })

  // --- 窗口控制 ---
  ipcMain.handle('win:minimize', () => mainWindow?.minimize())
  ipcMain.handle('win:maximize', () => {
    if (!mainWindow) return false
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()
    return mainWindow.isMaximized()
  })
  ipcMain.handle('win:close', () => mainWindow?.close())
  ipcMain.handle('win:isMaximized', () => mainWindow?.isMaximized() ?? false)
}

function mergeCookie(oldCookie, setCookieArray) {
  const map = new Map()
  const pushPair = (pair) => {
    const idx = pair.indexOf('=')
    if (idx < 1) return
    const k = pair.slice(0, idx).trim()
    const v = pair.slice(idx + 1).trim()
    if (k) map.set(k, v)
  }
  if (oldCookie) oldCookie.split(/;\s*/).forEach(pushPair)
  for (const c of setCookieArray) {
    const first = c.split(';')[0]
    pushPair(first)
  }
  return Array.from(map.entries()).map(([k, v]) => `${k}=${v}`).join('; ')
}

// ---------------------------------------------------------------------------
// 窗口
// ---------------------------------------------------------------------------

/**
 * 加载应用图标。
 * Electron 从 asar 内按路径加载 PNG 作为窗口图标时经常失败，
 * 因此显式读成 Buffer 再 createFromBuffer，确保 _NET_WM_ICON 被正确设置。
 */
function loadAppIcon(): Electron.NativeImage {
  const candidates = [
    path.join(__dirname, '../resources/icon.png'),
    path.join(process.resourcesPath || '', 'app.asar', 'resources', 'icon.png'),
    path.join(process.resourcesPath || '', 'resources', 'icon.png'),
    path.join(process.resourcesPath || '', 'icon.png'),
  ]
  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p)) {
        const buf = fs.readFileSync(p)
        const img = nativeImage.createFromBuffer(buf)
        if (!img.isEmpty()) return img
      }
    } catch (e) { /* try next */ }
  }
  return nativeImage.createEmpty()
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    frame: false,
    backgroundColor: '#0b0b12',
    show: false,
    icon: loadAppIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      autoplayPolicy: 'no-user-gesture-required',
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())

  if (isDev) {
    mainWindow.loadURL(DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('maximize', () => mainWindow.webContents.send('win:maximized', true))
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('win:maximized', false))
  mainWindow.on('closed', () => { mainWindow = null })

  // 外链用系统浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

function createLyricWindow() {
  lyricWindow = new BrowserWindow({
    width: 900,
    height: 160,
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  lyricWindow.setIgnoreMouseEvents(true, { forward: true })
  lyricWindow.setAlwaysOnTop(true, 'screen-saver')

  if (isDev) {
    lyricWindow.loadURL(DEV_SERVER_URL + '#/desktop-lyric')
  } else {
    lyricWindow.loadFile(path.join(__dirname, '../dist/index.html'), { hash: '/desktop-lyric' })
  }
  lyricWindow.on('closed', () => { lyricWindow = null })
}

function createTray() {
  try {
    const iconPath = path.join(__dirname, '../resources/tray.png')
    let img = nativeImage.createFromPath(iconPath)
    if (img.isEmpty()) img = nativeImage.createEmpty()
    tray = new Tray(img)
    tray.setToolTip('云娘音乐')
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: '显示主窗口', click: () => mainWindow?.show() },
      { label: '桌面歌词', click: () => { if (!lyricWindow) createLyricWindow(); lyricWindow.show() } },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() },
    ]))
    tray.on('click', () => mainWindow?.show())
  } catch (e) {
    console.warn('[tray] init failed', e.message)
  }
}

// ---------------------------------------------------------------------------
// 启动流程
// ---------------------------------------------------------------------------
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }
})

app.whenReady().then(async () => {
  try {
    await startEmbeddedApi()
  } catch (e) {
    console.error('[api] 启动失败', e)
    dialog.showErrorBox('云娘音乐启动失败', '内嵌音乐接口服务无法启动：\n' + e.message)
    app.quit()
    return
  }

  try {
    proxyBase = await startAudioProxy()
  } catch (e) {
    console.error('[proxy] 启动失败', e)
  }

  setupIPC()
  createMainWindow()
  createTray()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  if (apiServer && apiServer.close) { try { apiServer.close() } catch (e) {} }
})
