// 性能抽查：玻璃 / 光学折射是否拖累滚动
//
// 关键前提：故意 disableHardwareAcceleration —— 这是最坏情况。
// 有 GPU 加速时 backdrop-filter 与 feDisplacementMap 都走合成器，
// 无 GPU 时才真正考验 CPU 光栅化，才可能暴露问题。
//
// 判据：p95 帧间隔 ≤ 20ms（60fps = 16.67ms，留一点余量）。
const { app, BrowserWindow } = require('electron')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')

app.commandLine.appendSwitch('no-sandbox')
app.disableHardwareAcceleration()
app.setPath('userData', path.join(require('os').tmpdir(), 'yunniang-shot-profile'))

const FRAME_BUDGET_MS = 20

// 在页面上下文执行：滚动 800px，采集每帧间隔
const SCROLL_MEASURE = `
  new Promise((resolve) => {
    const sc = document.querySelector('.content-scroll')
    if (!sc) return resolve({ err: 'no scroll container' })
    const frames = []
    let last = performance.now()
    let running = true
    const tick = (t) => {
      frames.push(t - last); last = t
      if (running) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    let y = 0
    const step = () => {
      y += 40
      sc.scrollTop = y
      if (y < 800) requestAnimationFrame(step)
      else {
        running = false
        const sorted = [...frames].sort((a, b) => a - b)
        resolve({
          frames: frames.length,
          avgMs: Math.round(frames.reduce((a, b) => a + b, 0) / frames.length * 10) / 10,
          p95Ms: Math.round(sorted[Math.floor(sorted.length * 0.95)] * 10) / 10,
          maxMs: Math.round(Math.max(...frames) * 10) / 10,
        })
      }
    }
    requestAnimationFrame(step)
  })
`

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
  const js = (c) => win.webContents.executeJavaScript(c)

  let failed = 0
  for (const theme of ['light', 'dark']) {
    await win.loadURL(url + '#/like')
    await js(`localStorage.setItem('yun-theme', ${JSON.stringify(theme)})`)
    await win.webContents.reload()
    await wait(2600)

    // 预热：先空跑一次滚动。
    // 首轮包含「首次进入该路由」的布局与合成开销（实测会多出一帧 ~33ms），
    // 那是冷启动噪声，不是玻璃/折射的常态成本。不排除会造成假阳性。
    await js(`(() => { const sc = document.querySelector('.content-scroll')
      if (sc) { sc.scrollTop = 400; sc.scrollTop = 0 } return true })()`)
    await wait(500)

    // 取 3 轮的中位数。
    // 实测：单轮采样仅 ~20 帧，偶发丢一帧就会把 p95 抬到 33/66ms
    // （深色主题曾在 6 次连测中出现过 1 次 66.7ms，其余全是 16.7ms）。
    // 这种抖动与玻璃/折射无关，取「最差」只会放大噪声，
    // 取中位数才能反映常态成本。
    const runs = []
    for (let i = 0; i < 3; i++) {
      runs.push(await js(SCROLL_MEASURE))
      await wait(350)
    }
    const p95s = runs.map((r) => r.p95Ms).filter((v) => typeof v === 'number').sort((a, b) => a - b)
    const median = p95s[Math.floor(p95s.length / 2)]
    const ok = p95s.length > 0 && median <= FRAME_BUDGET_MS
    const tag = ok ? '[PASS]' : '[FAIL]'
    console.log(tag + ' ' + theme + ' 滚动  p95 样本=[' + p95s.join(', ') +
      '] → 中位数 ' + median + 'ms')
    if (!ok) failed++
  }

  console.log('')
  console.log(failed === 0
    ? '✅ 性能达标（无 GPU 加速，p95 ≤ ' + FRAME_BUDGET_MS + 'ms）'
    : '❌ ' + failed + ' 个主题掉帧')
  app.exit(failed ? 1 : 0)
})
