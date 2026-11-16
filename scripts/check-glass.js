// 交互回归验证：抽屉定位、层级、主题过渡
//
// 对应 Liquid Glass 改造中最容易出问题的三处：
//  1. .player-bar 用 ::before 承载 backdrop-filter —— 需确认抽屉仍是「贴视口右侧」
//  2. 抽屉 z-index / 推挤主内容区 —— 需确认没被播放栏裁切或盖住
//  3. 主题切换过渡 —— backdrop-filter 在过渡期间的插值是否正常（不闪黑）

const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')

const ROOT = path.resolve(__dirname, '..')
const OUT = process.env.SHOT_DIR || path.join(require('os').tmpdir(), 'shots-interaction')
fs.mkdirSync(OUT, { recursive: true })

app.commandLine.appendSwitch('no-sandbox')
app.disableHardwareAcceleration()
app.setPath('userData', path.join(require('os').tmpdir(), 'yunniang-shot-profile'))

const results = []
const check = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log(`${ok ? '[PASS]' : '[FAIL]'} ${name}${detail ? ' — ' + detail : ''}`)
}

app.whenReady().then(async () => {
  // ⚠️ 必须 show: true。隐藏窗口会冻结 CSS 动画与过渡：
  //    .side-drawer 的 drawerIn 会停在 from 帧（translateX(12px)），
  //    .main-area 的 margin-right 过渡也会停在 0，
  //    从而把「定位正确」误判成「越界 12px」「未推挤」。
  const win = new BrowserWindow({
    width: 1360, height: 900, show: true,
    webPreferences: {
      preload: path.join(ROOT, 'scripts/test-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  const indexUrl = 'file://' + path.join(ROOT, 'dist/index.html')
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const js = (code) => win.webContents.executeJavaScript(code)

  await win.loadURL(indexUrl + '#/like')
  await js(`localStorage.setItem('yun-theme','dark')`)
  await win.webContents.reload()
  await wait(2600)

  // ---- 1. 打开播放队列抽屉（走真实的 UI 路径：点击播放栏队列按钮）----
  const opened = await js(`
    (() => {
      const btns = [...document.querySelectorAll('.player-bar .pb-btn')]
      const q = btns.find(b => (b.getAttribute('title') || '') === '播放队列')
      if (!q) return false
      // 队列为空时抽屉仍应能打开（显示空态），这里先入队再开
      return true
    })()
  `)
  // 通过 context menu 之外的方式入队：直接用 store 不可行（无全局），
  // 所以先点「我喜欢的音乐」里的第一行播放，制造队列内容
  await js(`
    (() => {
      const row = document.querySelector('.song-row')
      if (row) row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
      return !!row
    })()
  `)
  await wait(1800)
  await js(`
    (() => {
      const btns = [...document.querySelectorAll('.player-bar .pb-btn')]
      const q = btns.find(b => (b.getAttribute('title') || '') === '播放队列')
      if (q) q.click()
      return !!q
    })()
  `)
  await wait(900)

  const drawer = await js(`
    (() => {
      const d = document.querySelector('.side-drawer')
      if (!d) return { found: false }
      const r = d.getBoundingClientRect()
      const cs = getComputedStyle(d)
      const mainArea = document.querySelector('.main-area')
      const mr = mainArea ? parseFloat(getComputedStyle(mainArea).marginRight) : -1
      return {
        found: true,
        right: Math.round(r.right), width: Math.round(r.width),
        top: Math.round(r.top), bottom: Math.round(r.bottom),
        vw: window.innerWidth, vh: window.innerHeight,
        zIndex: cs.zIndex,
        backdrop: cs.backdropFilter || cs.webkitBackdropFilter,
        mainMarginRight: Math.round(mr),
        drawerW: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--drawer-w')),
      }
    })()
  `)

  check('抽屉已渲染', drawer.found)
  if (drawer.found) {
    // 核心断言：抽屉必须贴视口右缘。若 .player-bar 成了包含块，right 会变成 != vw
    check('抽屉贴视口右侧（未被播放栏当包含块）',
      Math.abs(drawer.right - drawer.vw) <= 1,
      `right=${drawer.right} vw=${drawer.vw}`)
    // 抽屉高度应约等于 vh - titlebar - playerbar
    check('抽屉高度覆盖内容区（未被 78px 播放栏裁切）',
      drawer.bottom - drawer.top > 400,
      `h=${drawer.bottom - drawer.top}`)
    check('主内容区被推挤（margin-right = 抽屉宽）',
      Math.abs(drawer.mainMarginRight - drawer.drawerW) <= 1,
      `margin=${drawer.mainMarginRight} drawerW=${drawer.drawerW}`)
    check('抽屉有背景模糊',
      /blur/.test(drawer.backdrop || ''),
      drawer.backdrop)
  }
  await win.webContents.capturePage().then((img) =>
    fs.writeFileSync(path.join(OUT, 'dark-queue-open.png'), img.toPNG()))

  // ---- 2. 菜单层级：右键歌曲行，确认菜单在玻璃之上 ----
  await js(`
    (() => {
      const row = document.querySelector('.song-row')
      if (!row) return false
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 400, clientY: 300 }))
      return true
    })()
  `)
  await wait(600)
  const menu = await js(`
    (() => {
      const m = document.querySelector('.menu')
      if (!m) return { found: false }
      const cs = getComputedStyle(m)
      const r = m.getBoundingClientRect()
      // 菜单中心点命中的元素应当是菜单自己或其后代
      const hit = document.elementFromPoint(Math.round(r.left + r.width/2), Math.round(r.top + 12))
      // 光学折射模式下，材质（半透明底 + 模糊 + 位移）由 ::before 承载，
      // 元素自身的 background/backdrop-filter 是空的 —— 必须查伪元素。
      const before = getComputedStyle(m, '::before')
      return {
        found: true,
        zIndex: cs.zIndex,
        refract: m.classList.contains('glass-refract'),
        // 元素自身与伪元素两处都查，兼容两种材质实现
        backdrop: cs.backdropFilter || cs.webkitBackdropFilter,
        beforeBackdrop: before.backdropFilter || before.webkitBackdropFilter,
        beforeFilter: before.filter,
        beforeBg: before.backgroundColor,
        onTop: !!hit && (m === hit || m.contains(hit)),
        bg: cs.backgroundColor,
      }
    })()
  `)
  check('右键菜单已渲染', menu.found)
  if (menu.found) {
    check('菜单浮在最上层（未被玻璃层遮挡）', menu.onTop)
    // 材质要么在元素自身，要么在 ::before 伪元素上（折射模式）
    const blurSrc = /blur/.test(menu.backdrop || '') ? menu.backdrop : menu.beforeBackdrop
    check('菜单有背景模糊', /blur/.test(blurSrc || ''), blurSrc)
    // 折射模式还要确认位移滤镜真的挂上了
    if (menu.refract) {
      // Chromium 会把 id 加上引号：url("#lg-refract")
      check('菜单挂载了折射滤镜', /lg-refract/.test(menu.beforeFilter || ''),
        menu.beforeFilter)
    }
    // 菜单底色必须是半透明（rgba 且 alpha < 1），否则失去玻璃感
    const bgSrc = menu.refract ? menu.beforeBg : menu.bg
    const alpha = /rgba?\(([^)]+)\)/.exec(bgSrc || '')
    const parts = alpha ? alpha[1].split(',').map((x) => parseFloat(x)) : []
    const a = parts.length === 4 ? parts[3] : 1
    check('菜单底色为半透明（玻璃）', a < 1, `bg=${bgSrc}`)
  }
  await win.webContents.capturePage().then((img) =>
    fs.writeFileSync(path.join(OUT, 'dark-menu-open.png'), img.toPNG()))

  // ---- 3. 主题切换过渡：切换过程中 backdrop-filter 不应消失 ----
  await js(`document.body.click()`)
  await wait(300)
  await js(`
    (() => {
      const btn = [...document.querySelectorAll('.sidebar-item')]
        .find(b => (b.textContent || '').includes('浅色模式'))
      if (btn) btn.click()
      return !!btn
    })()
  `)
  await wait(120)   // 过渡中段
  const mid = await js(`
    (() => {
      const bar = document.querySelector('.player-bar')
      const cs = bar ? getComputedStyle(bar, '::before') : null
      return {
        animating: document.documentElement.hasAttribute('data-theme-animating'),
        theme: document.documentElement.getAttribute('data-theme'),
        barBackdrop: cs ? (cs.backdropFilter || cs.webkitBackdropFilter) : '',
      }
    })()
  `)
  check('过渡期间 data-theme-animating 已挂上', mid.animating, `theme=${mid.theme}`)
  check('过渡期间播放栏玻璃仍生效（未闪成纯色）',
    /blur/.test(mid.barBackdrop || ''), mid.barBackdrop)

  await wait(1200)
  const after = await js(`
    (() => ({
      animating: document.documentElement.hasAttribute('data-theme-animating'),
      theme: document.documentElement.getAttribute('data-theme'),
    }))()
  `)
  check('过渡结束后 animating 已清除', !after.animating, `theme=${after.theme}`)
  check('主题已切到浅色', after.theme === 'light', after.theme)

  await win.webContents.capturePage().then((img) =>
    fs.writeFileSync(path.join(OUT, 'light-after-toggle.png'), img.toPNG()))

  // ---- 4. 明暗模式下的文本对比度抽样 ----
  const contrast = await js(`
    (() => {
      const lum = (c) => {
        const [r,g,b] = c.map(v => { v/=255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4) })
        return 0.2126*r + 0.7152*g + 0.0722*b
      }
      const parse = (s) => {
        const m = s.match(/rgba?\\(([^)]+)\\)/)
        if (!m) return null
        return m[1].split(',').slice(0,3).map(x => parseFloat(x))
      }
      // 取内容区最上层的实际合成底色（玻璃 + 环境光近似）
      const el = document.querySelector('.content-scroll')
      const cs = getComputedStyle(document.body)
      const bgc = parse(cs.backgroundColor) || [255,255,255]
      const out = {}
      const sample = (sel, label) => {
        const n = document.querySelector(sel)
        if (!n) return
        const fg = parse(getComputedStyle(n).color)
        if (!fg) return
        const L1 = lum(fg), L2 = lum(bgc)
        const ratio = (Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05)
        out[label] = Math.round(ratio*100)/100
      }
      sample('.page-title', 'pageTitle')
      sample('.card-title', 'cardTitle')
      sample('.card-sub', 'cardSub')
      sample('.small.muted', 'muted')
      return out
    })()
  `)
  console.log('  对比度抽样（浅色）:', JSON.stringify(contrast))
  const lowContrast = Object.entries(contrast).filter(([, v]) => v < 3)
  check('浅色主要文本对比度 >= 3:1', lowContrast.length === 0,
    lowContrast.map(([k,v]) => `${k}=${v}`).join(' ') || 'all ok')

  const failed = results.filter((r) => !r.ok)
  console.log('')
  console.log(failed.length === 0
    ? `✅ 交互回归全部通过（${results.length} 项）`
    : `❌ ${failed.length}/${results.length} 项失败`)
  console.log(`截图: ${OUT}`)
  app.exit(failed.length ? 1 : 0)
})
