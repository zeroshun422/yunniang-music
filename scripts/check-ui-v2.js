// UI 回归验证（v2 · iOS 26 风格）
//
// 与 check-glass.js 的关系：
//   check-glass.js 是 v1 的玻璃回归（依赖旧类名 .side-drawer/.menu/.sidebar 等），
//   v2 重写了类名体系后它已无法使用。本脚本是它的 v2 替代。
//
// 覆盖：布局几何、玻璃材质、主题切换、右键菜单、遮挡检查。
// 必须用 show: true 的可见窗口 —— 隐藏窗口会冻结 CSS 动画与过渡，
// 会把"定位正确"误判成"越界"。
const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')

const ROOT = path.resolve(__dirname, '..')
const OUT = process.env.SHOT_DIR || path.join(require('os').tmpdir(), 'v2-ui-check')
fs.mkdirSync(OUT, { recursive: true })

app.commandLine.appendSwitch('no-sandbox')
app.disableHardwareAcceleration()
// 隔离 userData：不碰用户真实的登录凭据与主题设置
app.setPath('userData', path.join(require('os').tmpdir(), 'yunniang-shot-profile'))

const results = []
const check = (name, ok, detail) => {
  results.push({ name, ok })
  console.log(`${ok ? '[PASS]' : '[FAIL]'} ${name}${detail ? ' — ' + detail : ''}`)
}

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

  await win.loadURL(url + '#/like')
  await js(`localStorage.setItem('yun-theme','light')`)
  await win.webContents.reload()
  await wait(2700)

  // ---- 1. 骨架几何 ----
  const layout = await js(`
    (() => {
      const r = (s) => { const el = document.querySelector(s); if (!el) return null
        const b = el.getBoundingClientRect()
        return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), bottom: Math.round(b.bottom) } }
      const bar = r('.player')
      return {
        vh: innerHeight,
        titlebar: r('.app-titlebar'),
        sidebar: r('.sidebar'),
        content: r('.content'),
        player: bar,
        // 内容区必须延伸到播放栏后方，否则"透见底层文字"不成立
        contentCoversBar: document.querySelector('.content') ? true : false,
      }
    })()
  `)
  check('标题栏渲染', !!layout.titlebar)
  check('侧边栏渲染', !!layout.sidebar)
  check('播放栏渲染', !!layout.player)

  if (layout.sidebar && layout.player) {
    // 侧边栏必须止于播放栏之上，否则底部用户区被遮
    check('侧边栏不与播放栏重叠',
      layout.sidebar.bottom <= layout.player.y + 1,
      `sidebar.bottom=${layout.sidebar.bottom} player.y=${layout.player.y}`)
  }

  const covers = await js(`
    (() => {
      const sc = document.querySelector('.content__scroll')
      const bar = document.querySelector('.player').getBoundingClientRect()
      if (!sc) return null
      const b = sc.getBoundingClientRect()
      return { scrollBottom: Math.round(b.bottom), barTop: Math.round(bar.top) }
    })()
  `)
  check('内容区延伸至播放栏后方（可透见底层文字）',
    covers && covers.scrollBottom > covers.barTop,
    covers ? `scroll.bottom=${covers.scrollBottom} bar.top=${covers.barTop}` : 'no scroll')

  // ---- 2. 玻璃材质 ----
  const glass = await js(`
    (() => {
      const bar = getComputedStyle(document.querySelector('.player'), '::before')
      const side = getComputedStyle(document.querySelector('.sidebar'))
      const sb = document.querySelector('.sidebar')
      return {
        barBlur: bar.backdropFilter, barBg: bar.backgroundColor,
        barShape: bar.cornerShape, barRadius: bar.borderRadius,
        sideBlur: side.backdropFilter, sideShape: side.cornerShape,
      }
    })()
  `)
  check('播放栏有实时模糊', /blur/.test(glass.barBlur || ''), glass.barBlur)
  check('播放栏半透明（能透见底层）',
    /rgba|0\.\d/.test(glass.barBg || ''), glass.barBg)
  check('播放栏使用连续曲率圆角',
    glass.barShape === 'superellipse(2)',
    `shape=${glass.barShape} radius=${glass.barRadius}`)
  check('侧边栏有实时模糊', /blur/.test(glass.sideBlur || ''), glass.sideBlur)
  check('侧边栏使用连续曲率圆角',
    glass.sideShape === 'superellipse(2)', glass.sideShape)

  // ---- 3. 右键菜单 ----
  await js(`document.body.click()`)
  await wait(200)
  const rmbSeq = []
  for (let i = 0; i < 3; i++) {
    await js(`
      (() => {
        const rows = [...document.querySelectorAll('.u-row')]
        const row = rows[${i}]
        if (!row) return false
        const b = row.getBoundingClientRect()
        row.dispatchEvent(new MouseEvent('contextmenu', {
          bubbles: true, clientX: b.left + 260, clientY: b.top + 10,
        }))
        return true
      })()
    `)
    await wait(320)
    rmbSeq.push(await js(`!!document.querySelector('.u-menu')`))
  }
  check('歌曲行右键能弹出菜单', rmbSeq.every(Boolean), `三次=${rmbSeq.join(',')}`)

  const menuInfo = await js(`
    (() => {
      const m = document.querySelector('.u-menu')
      if (!m) return null
      const cs = getComputedStyle(m)
      const r = m.getBoundingClientRect()
      const hit = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + 12))
      return {
        items: m.querySelectorAll('.u-menu__item').length,
        blur: cs.backdropFilter,
        onTop: !!hit && (m === hit || m.contains(hit)),
      }
    })()
  `)
  check('菜单项完整（≥4 项）', !!menuInfo && menuInfo.items >= 4,
    menuInfo ? `${menuInfo.items} 项` : 'no menu')
  check('菜单浮在最上层', !!menuInfo && menuInfo.onTop)
  check('菜单有玻璃模糊', !!menuInfo && /blur/.test(menuInfo.blur || ''),
    menuInfo ? menuInfo.blur : '')

  await js(`document.querySelector('.page-title')?.dispatchEvent(new MouseEvent('click',{bubbles:true}))`)
  await wait(250)
  check('点击空白处收起菜单', !(await js(`!!document.querySelector('.u-menu')`)))

  // ---- 4. 抽屉 ----
  await js(`
    (() => {
      const b = [...document.querySelectorAll('.player .u-icon-btn')]
        .find((x) => (x.getAttribute('title') || '') === '播放队列')
      if (b) b.click()
      return !!b
    })()
  `)
  await wait(800)
  const drawer = await js(`
    (() => {
      const d = document.querySelector('.u-drawer')
      if (!d) return null
      const r = d.getBoundingClientRect()
      const bar = document.querySelector('.player').getBoundingClientRect()
      const cs = getComputedStyle(d)
      return {
        right: Math.round(r.right), vw: innerWidth,
        bottom: Math.round(r.bottom), barTop: Math.round(bar.top),
        blur: cs.backdropFilter, shape: cs.cornerShape,
      }
    })()
  `)
  check('抽屉渲染', !!drawer)
  if (drawer) {
    check('抽屉贴视口右缘（未被播放栏当包含块）',
      Math.abs(drawer.right - (drawer.vw - 12)) <= 2,
      `right=${drawer.right} vw=${drawer.vw}`)
    check('抽屉底边对齐播放栏上沿',
      Math.abs(drawer.bottom - drawer.barTop) <= 30,
      `bottom=${drawer.bottom} barTop=${drawer.barTop}`)
    check('抽屉有玻璃模糊', /blur/.test(drawer.blur || ''), drawer.blur)
    check('抽屉使用连续曲率圆角', drawer.shape === 'superellipse(2)', drawer.shape)
  }

  await win.webContents.capturePage().then((img) =>
    fs.writeFileSync(path.join(OUT, 'queue-open.png'), img.toPNG()))

  // 关闭抽屉
  await js(`
    (() => {
      const d = document.querySelector('.u-drawer')
      const b = d && d.querySelector('.u-icon-btn')
      if (b) b.click()
      return !!b
    })()
  `)
  await wait(500)

  // ---- 5. 主题切换 ----
  await js(`localStorage.setItem('yun-theme','light')`)
  await win.webContents.reload()
  await wait(2500)

  const themeSwitch = await js(`
    new Promise((resolve) => {
      const root = document.documentElement
      const lum = (c) => { const [r,g,b] = c.map(v => { v/=255; return v<=0.03928? v/12.92 : Math.pow((v+0.055)/1.055,2.4) }); return 0.2126*r + 0.7152*g + 0.0722*b }
      // 颜色可能以两种形式返回：rgb()/rgba() 或十六进制 #rrggbb。
      // 只处理 rgb() 会漏掉变量取值（实测 --tx-canvas 返回 "#000000"，
      // 解析失败导致 samples=0、判定为 -1）。
      const parse = (s) => {
        const t = String(s || '').trim().replace(/^["']|["']$/g, '')
        if (t.startsWith('#')) {
          const h = t.slice(1)
          if (h.length === 3) {
            return [parseInt(h[0]+h[0],16), parseInt(h[1]+h[1],16), parseInt(h[2]+h[2],16)]
          }
          if (h.length >= 6) {
            return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)]
          }
          return null
        }
        const l = t.indexOf('('), r = t.lastIndexOf(')')
        if (l < 0 || r <= l) return null
        const n = t.slice(l + 1, r).split(',').slice(0, 3).map((x) => Number(x.trim()))
        return n.length === 3 && n.every(Number.isFinite) ? n : null
      }
      const ratio = (fg, bg) => { const L1 = lum(fg), L2 = lum(bg); return (Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05) }

      let minRatio = Infinity
      let samples = 0
      const sample = () => {
        const el = [...document.querySelectorAll('.nav-item')]
          .find((b) => /搜索/.test(b.textContent || ''))
        const bg = parse(getComputedStyle(root).getPropertyValue('--bg-canvas'))
        const fg = el ? parse(getComputedStyle(el).color) : null
        if (bg && fg) { minRatio = Math.min(minRatio, ratio(fg, bg)); samples++ }
      }

      sample()
      const btn = [...document.querySelectorAll('.nav-item')]
        .find((b) => /深色模式/.test(b.textContent || ''))
      if (btn) btn.click()

      const t0 = performance.now()
      const loop = () => {
        sample()
        if (performance.now() - t0 > 1200) {
          resolve({
            animating: root.hasAttribute('data-theme-animating'),
            theme: root.getAttribute('data-theme'),
            minRatio: Number.isFinite(minRatio) ? +minRatio.toFixed(2) : -1,
            samples,
          })
        } else requestAnimationFrame(loop)
      }
      requestAnimationFrame(loop)
    })
  `)
  check('主题切换完成', themeSwitch.theme === 'dark', themeSwitch.theme)
  check('切换后清除 animating 标记', !themeSwitch.animating)
  check('切换全程文字可读（≥3:1）',
    themeSwitch.minRatio >= 3,
    `minRatio=${themeSwitch.minRatio} samples=${themeSwitch.samples}`)

  await wait(400)
  await win.webContents.capturePage().then((img) =>
    fs.writeFileSync(path.join(OUT, 'after-theme.png'), img.toPNG()))

  // ---- 6. 遮挡检查：滚到底时最后一行完整可见 ----
  for (const route of ['like', 'settings']) {
    await win.loadURL(url + '#' + route)
    await wait(2400)
    const occ = await js(`
      (() => {
        const sc = document.querySelector('.content__scroll')
        if (!sc) return null
        sc.scrollTop = sc.scrollHeight
        const bar = document.querySelector('.player').getBoundingClientRect()
        const kids = [...sc.children].filter((e) => e.getBoundingClientRect().height > 0)
        const last = kids[kids.length - 1]
        if (!last) return { ok: true }
        const lr = last.getBoundingClientRect()
        return { ok: lr.bottom <= bar.top + 2, lastBottom: Math.round(lr.bottom), barTop: Math.round(bar.top) }
      })()
    `)
    check(`滚到底时内容不被遮挡（${route}）`,
      !!occ && occ.ok,
      occ ? `last=${occ.lastBottom} barTop=${occ.barTop}` : 'no scroll')
  }

  const failed = results.filter((r) => !r.ok)
  console.log('')
  console.log(failed.length === 0
    ? `✅ UI 回归全部通过（${results.length} 项）`
    : `❌ ${failed.length}/${results.length} 项失败`)
  console.log(`截图：${OUT}`)
  app.exit(failed.length ? 1 : 0)
})
