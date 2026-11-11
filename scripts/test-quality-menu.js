// 验证音质菜单：模拟点击后检查菜单是否在视口内可见
const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')

const ROOT = '/home/zeroshun/workspace/yunniang-music'
app.commandLine.appendSwitch('no-sandbox')
app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1360, height: 860, show: false,
    webPreferences: {
      preload: path.join(ROOT, 'scripts/test-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  await win.loadURL('file://' + path.join(ROOT, 'dist/index.html') + '#/home')
  await wait(3500)

  const result = await win.webContents.executeJavaScript(`
    (async () => {
      const out = {}
      const sleep = (ms) => new Promise(r => setTimeout(r, ms))

      // 找到音质按钮
      const pill = document.querySelector('.quality-pill')
      if (!pill) return { error: '找不到 .quality-pill 按钮' }
      const pr = pill.getBoundingClientRect()
      out.pillRect = { x: Math.round(pr.x), y: Math.round(pr.y), w: Math.round(pr.width), h: Math.round(pr.height) }
      out.pillText = pill.textContent.trim()

      // 点击打开菜单
      pill.click()
      await sleep(400)

      const menu = document.querySelector('.menu.quality-panel')
      if (!menu) return { error: '点击后菜单未出现', ...out }

      const mr = menu.getBoundingClientRect()
      out.menuRect = { x: Math.round(mr.x), y: Math.round(mr.y), w: Math.round(mr.width), h: Math.round(mr.height) }
      out.viewport = { w: window.innerWidth, h: window.innerHeight }

      // 关键判定：菜单是否在视口内
      out.visibleInViewport = mr.y >= 0 && mr.y + mr.height <= window.innerHeight && mr.width > 0
      out.offScreenTop = mr.y + mr.height < 0
      out.offScreenBottom = mr.y > window.innerHeight

      // 统计可点击项
      const items = menu.querySelectorAll('.menu-item')
      out.itemCount = items.length
      out.itemLabels = Array.from(items).map(i => i.textContent.trim().slice(0, 20))

      return out
    })()
  `).catch(e => ({ error: e.message }))

  console.log('RESULT_JSON=' + JSON.stringify(result, null, 2))
  app.quit()
})
