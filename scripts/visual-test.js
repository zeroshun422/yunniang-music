// 视觉验证：用 mock preload 逐个路由截图，检查 10 个页面真实渲染
const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')

// ROOT 基于 __dirname 解析，使脚本在任何机器/CI 上都可用（不再硬编码绝对路径）
const ROOT = path.resolve(__dirname, '..')
const OUT = process.env.UI_SHOT_DIR || path.join(require('os').tmpdir(), 'ui-shots')
fs.mkdirSync(OUT, { recursive: true })

app.commandLine.appendSwitch('no-sandbox')
app.disableHardwareAcceleration()

const ROUTES = [
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
  ['settings', '/settings'],
]

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
  win.webContents.on('did-fail-load', (_e, code, desc) => {
    errors.push(`LOAD FAIL ${code} ${desc}`)
  })

  await win.loadURL(indexUrl + '#/home')
  await wait(3500)

  const failedRoutes = []
  for (const [name, route] of ROUTES) {
    try {
      await win.loadURL(indexUrl + '#' + route)
      await wait(2600)
      const img = await win.webContents.capturePage()
      fs.writeFileSync(path.join(OUT, `${name}.png`), img.toPNG())
      // 抓页面可见文本，判断是否空白/报错
      const txt = await win.webContents.executeJavaScript(
        `(document.querySelector('.content-scroll')||document.body).innerText.slice(0,160)`
      )
      const clean = String(txt).replace(/\s+/g, ' ').trim()
      // 空白页面视为渲染失败（冒烟测试的核心判据）
      if (!clean) {
        failedRoutes.push(name)
        console.log(`[FAIL] ${name.padEnd(11)} ${route.padEnd(16)} 页面内容为空`)
        continue
      }
      console.log(`[SHOT] ${name.padEnd(11)} ${route.padEnd(16)} text="${clean.slice(0, 90)}"`)
    } catch (e) {
      failedRoutes.push(name)
      console.log(`[FAIL] ${name} ${e.message}`)
    }
  }

  if (errors.length) {
    console.log('\n=== CONSOLE ERRORS ===')
    ;[...new Set(errors)].slice(0, 15).forEach((e) => console.log(' -', e))
  } else {
    console.log('\n=== 无控制台错误 ===')
  }

  // 冒烟结论：任一页面空白/加载失败/控制台报错 => 非零退出，便于 CI 判定
  const ok = failedRoutes.length === 0 && errors.length === 0
  console.log('')
  if (ok) {
    console.log(`✅ SMOKE PASS — ${ROUTES.length} 个路由全部渲染成功`)
  } else {
    console.log(`❌ SMOKE FAIL — 失败路由: ${failedRoutes.join(', ') || '(无)'} | 控制台错误: ${errors.length}`)
  }
  console.log(`截图输出: ${OUT}`)
  app.exit(ok ? 0 : 1)
})
