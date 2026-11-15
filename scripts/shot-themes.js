// Liquid Glass 视觉验证：按主题逐个路由截图
//
// 与 visual-test.js 的分工：
//   visual-test.js 是冒烟测试（只看页面非空 + 无控制台错误），进 CI；
//   本脚本是视觉比对工具，输出浅色/深色两套截图，人工或后续自动 diff 使用。
//
// 用法：node_modules/.bin/electron scripts/shot-themes.js
//   环境变量 SHOT_DIR 指定输出目录（默认 /tmp/shots-glass）
//   ROUTES 环境变量可覆盖路由列表，逗号分隔，如 "home,like,settings"

const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')

const ROOT = path.resolve(__dirname, '..')
const OUT = process.env.SHOT_DIR || path.join(require('os').tmpdir(), 'shots-glass')
fs.mkdirSync(OUT, { recursive: true })

app.commandLine.appendSwitch('no-sandbox')
app.disableHardwareAcceleration()

// 隔离 userData：否则脚本会读写用户真实的 ~/.config/yunniang-music
// （包括登录凭据与已保存主题），既污染用户数据也让截图结果依赖用户设置。
app.setPath('userData', path.join(require('os').tmpdir(), 'yunniang-shot-profile'))

const ALL_ROUTES = [
  ['home', '/home'],
  ['search', '/search'],
  ['daily', '/daily'],
  ['radar', '/radar'],
  ['heart', '/heart'],
  ['roam', '/roam'],
  ['square', '/square'],
  ['rank', '/rank'],
  ['like', '/like'],
  ['subscribed', '/subscribed'],
  ['cloud', '/cloud'],
  ['playlist', '/playlist/101'],
  ['artist', '/artist/1'],
  ['settings', '/settings'],
]

const ROUTES = process.env.ROUTES
  ? ALL_ROUTES.filter(([n]) => process.env.ROUTES.split(',').includes(n))
  : ALL_ROUTES

const THEMES = (process.env.THEMES || 'light,dark').split(',')

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1360, height: 900, show: false,
    webPreferences: {
      preload: path.join(ROOT, 'scripts/test-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  const indexUrl = 'file://' + path.join(ROOT, 'dist/index.html')
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))

  const errors = []
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2 && !message.includes('Download the React DevTools')) {
      errors.push(message.slice(0, 300))
    }
  })

  // 先落地一次，让 localStorage 属于本页 origin
  await win.loadURL(indexUrl + '#/home')
  await wait(2500)

  for (const theme of THEMES) {
    // 主题存在 localStorage（key: yun-theme），由 useTheme.init() 在模块加载时读取。
    // ⚠️ 仅改 hash 属于同文档内导航，模块不会重新执行、主题不会重读；
    //    因此写完 localStorage 后必须强制整页 reload 才能让新主题生效。
    for (const [name, route] of ROUTES) {
      await win.loadURL(indexUrl + '#' + route)
      await win.webContents.executeJavaScript(
        `localStorage.setItem('yun-theme', ${JSON.stringify(theme)}); true`
      )
      await win.webContents.reload()
      await wait(2400)
      // capturePage 抓的是合成后的视口，固定层（标题栏/播放栏）一并包含
      const img = await win.webContents.capturePage()
      const file = path.join(OUT, `${theme}-${name}.png`)
      fs.writeFileSync(file, img.toPNG())
      const txt = await win.webContents.executeJavaScript(
        `(document.querySelector('.content-scroll')||document.body).innerText.slice(0,80)`
      )
      const applied = await win.webContents.executeJavaScript(
        `document.documentElement.getAttribute('data-theme')`
      )
      const clean = String(txt).replace(/\s+/g, ' ').trim()
      const ok = clean && applied === theme
      console.log(`[SHOT] ${theme.padEnd(5)} ${name.padEnd(11)} ${ok ? 'ok' : `MISMATCH(applied=${applied})`}`)
    }
  }

  if (errors.length) {
    console.log('\n=== CONSOLE ERRORS ===')
    ;[...new Set(errors)].slice(0, 15).forEach((e) => console.log(' -', e))
  } else {
    console.log('\n=== 无控制台错误 ===')
  }
  console.log(`\n输出目录: ${OUT}`)
  app.exit(errors.length ? 1 : 0)
})
