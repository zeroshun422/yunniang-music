// 登录页截图（明暗两套）
// 登录页是应用内最大的一块玻璃，也是折射效果最明显的验证载体。
// 用 mock preload 渲染真实组件，隔离 userData 不碰用户配置。
const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')

const ROOT = path.resolve(__dirname, '..')
const OUT = process.env.SHOT_DIR || path.join(require('os').tmpdir(), 'shots-login')
fs.mkdirSync(OUT, { recursive: true })

app.commandLine.appendSwitch('no-sandbox')
app.disableHardwareAcceleration()
app.setPath('userData', path.join(require('os').tmpdir(), 'yunniang-shot-profile'))

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1360, height: 900, show: true,
    webPreferences: {
      preload: path.join(ROOT, 'scripts/test-preload.js'),
      contextIsolation: true, nodeIntegration: false,
    },
  })
  const url = 'file://' + path.join(ROOT, 'dist/index.html')
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))

  for (const theme of ['light', 'dark']) {
    await win.loadURL(url + '#/login')
    await win.webContents.executeJavaScript(
      `localStorage.setItem('yun-theme', ${JSON.stringify(theme)}); true`
    )
    await win.webContents.reload()
    await wait(2800)
    const img = await win.webContents.capturePage()
    fs.writeFileSync(path.join(OUT, `login-${theme}.png`), img.toPNG())
    const applied = await win.webContents.executeJavaScript(
      `document.documentElement.getAttribute('data-theme')`
    )
    console.log(`[SHOT] login-${theme} applied=${applied}`)
  }
  console.log('输出:', OUT)
  app.exit(0)
})
