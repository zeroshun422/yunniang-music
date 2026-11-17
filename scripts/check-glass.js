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
        // 播放栏现在浮在内容之上，抽屉底边要对齐它的顶边
        barTop: (() => {
          const bar = document.querySelector('.player-bar')
          return bar ? Math.round(bar.getBoundingClientRect().top) : -1
        })(),
        // 播放栏改为悬浮条后，抽屉右侧与底部都要留出同样的 gap
        barGap: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--bar-gap')) || 0,
        playerH: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--player-h')) || 0,
      }
    })()
  `)

  check('抽屉已渲染', drawer.found)
  if (drawer.found) {
    // 核心断言：抽屉必须贴视口右缘「减去 bar-gap」。
    // 播放栏悬浮化后，抽屉与悬浮条右缘对齐，所以期望值是 vw - gap，而不是 vw。
    // 若 .player-bar 成了包含块，right 会明显偏离（此前实测偏差 20px+）。
    check('抽屉右缘对齐悬浮条（未被播放栏当包含块）',
      Math.abs(drawer.right - (drawer.vw - drawer.barGap)) <= 1,
      `right=${drawer.right} 期望=${drawer.vw - drawer.barGap} (vw=${drawer.vw} gap=${drawer.barGap})`)
    // 抽屉底部：直接校验「抽屉在播放栏之上」，不再硬编码高度公式。
    // 播放栏已改为绝对定位、浮在内容之上，其顶边 = vh - (player-h + 3*gap)。
    // 用几何关系而非数字常量做断言，布局再调整也不会假红。
    check('抽屉不与悬浮播放栏重叠（未被裁切）',
      Math.abs(drawer.bottom - drawer.barTop) <= 2 && drawer.bottom - drawer.top > 400,
      `drawer.bottom=${drawer.bottom} bar.top=${drawer.barTop} h=${drawer.bottom - drawer.top}`)
    // 推挤量 = 抽屉宽 + gap（内容区让位给整个右侧区域）
    const expectedMargin = drawer.drawerW + drawer.barGap
    check('主内容区被推挤（margin-right = 抽屉宽 + gap）',
      Math.abs(drawer.mainMarginRight - expectedMargin) <= 1,
      `margin=${drawer.mainMarginRight} 期望=${expectedMargin}`)
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
        // 播放栏已改为「静态磨砂底」来规避大面积 backdrop-filter 的掉帧问题，
        // 所以过渡期间要校验的是「底色仍在且仍是半透明」，而不是模糊。
        barBg: cs ? cs.backgroundColor : '',
      }
    })()
  `)
  check('过渡期间 data-theme-animating 已挂上', mid.animating, `theme=${mid.theme}`)
  // 播放栏走静态磨砂底：过渡中不能变成纯色（要么有模糊，要么底色仍是半透明）
  const midBgAlpha = (() => {
    const m = /rgba?\(([^)]+)\)/.exec(mid.barBg || '')
    if (!m) return 1
    const p = m[1].split(',').map((x) => parseFloat(x))
    return p.length === 4 ? p[3] : 1
  })()
  check('过渡期间播放栏玻璃仍生效（未闪成纯色）',
    /blur/.test(mid.barBackdrop || '') || midBgAlpha < 0.99,
    `backdrop=${mid.barBackdrop || '(none)'} bg=${mid.barBg} alpha=${midBgAlpha}`)

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

  // ---- 3.4 右键菜单行为 ----
  // 说明：这条只覆盖「菜单能弹出」与「点空白能收起」这两个确定行为。
  // 曾经修过一个更隐蔽的 bug：document 上的 contextmenu 监听与歌曲行的
  // React 合成事件竞争，导致连续右键时菜单"交替失效"。
  // 但那个 bug 依赖两者的时序，**在自动化测试里无法稳定复现** ——
  // 我试过同步读取、连续右键、同行重复右键三种序列，
  // 注入旧代码后断言依然全绿。所以这里不假装能守住它，
  // 只保留可确定性验证的部分，并在 DESIGN-GLASS.md 里记录成因与修法。
  await js(`document.body.click()`)
  await wait(200)

  const rmbOpen = []
  for (let i = 0; i < 3; i++) {
    await js(`
      (() => {
        const rows = [...document.querySelectorAll('.song-row')]
        const row = rows[${i}]
        if (!row) return false
        const b = row.getBoundingClientRect()
        row.dispatchEvent(new MouseEvent('contextmenu', {
          bubbles: true, clientX: b.left + 200, clientY: b.top + 10,
        }))
        return true
      })()
    `)
    await wait(300)
    rmbOpen.push(await js(`!!document.querySelector('.menu')`))
  }
  check('歌曲行右键能弹出菜单',
    rmbOpen.every(Boolean),
    `三次结果=${rmbOpen.join(',')}`)

  await js(`document.querySelector('.page-title')?.dispatchEvent(new MouseEvent('click',{bubbles:true}))`)
  await wait(250)
  check('点击空白处收起右键菜单',
    !(await js(`!!document.querySelector('.menu')`)))

  // ---- 3.5 玻璃透明度滑块：缩放与上下限保护 ----
  // 这个功能把 alpha 交给一个变量驱动，容易在改配色时被悄悄改坏
  // （比如有人直接覆写 --glass-2 就会绕过 clamp）。
  const alphaProbe = await js(`
    (() => {
      const root = document.documentElement
      const read = () => {
        const sb = document.querySelector('.sidebar')
        return sb ? getComputedStyle(sb).backgroundColor : ''
      }
      const set = (v) => root.style.setProperty('--glass-scale', String(v))
      const out = {}
      set(1);   out.base = read()
      set(0.5); out.half = read()
      set(0.01); out.floor = read()     // 极低 -> 应被 clamp 下限
      set(99);   out.ceil = read()      // 极高 -> 应被 clamp 上限
      set(1);   out.restored = read()
      // 清理，避免影响后续断言
      root.style.removeProperty('--glass-scale')
      return out
    })()
  `)
  const alphaOf = (c) => {
    const m = /rgba?\(([^)]+)\)/.exec(c || '')
    if (!m) return null
    const p = m[1].split(',').map((x) => parseFloat(x))
    return p.length === 4 ? p[3] : 1
  }
  const aBase = alphaOf(alphaProbe.base)
  const aHalf = alphaOf(alphaProbe.half)
  const aFloor = alphaOf(alphaProbe.floor)
  const aCeil = alphaOf(alphaProbe.ceil)
  check('透明度变量生效（0.5 时 alpha 减半）',
    aBase !== null && aHalf !== null && Math.abs(aHalf - aBase * 0.5) < 0.02,
    `base=${aBase} half=${aHalf}`)
  check('透明度有下限保护（不会透到 0）',
    aFloor !== null && aFloor >= 0.1,
    `floor=${aFloor}`)
  check('透明度有上限保护（不会变成实体白）',
    aCeil !== null && aCeil <= 0.95,
    `ceil=${aCeil}`)

  // ---- 3.6 主题切换：实现规模 + 全程对比度 ----
  // 用**确定性指标**而不是帧率判据：
  //   本仓库的运行环境（无 GPU + 长驻窗口）帧时间抖动极大，
  //   同一份代码在不同次测量里会在 16.8ms 与 33.2ms 之间跳动，
  //   拿它做断言只会得到随机红绿。
  // 改为断言实现结构是否退化成"每个元素各自过渡"：
  //   旧实现在 701 元素页面上会让 701 个元素全部持有 transition，
  //   新实现只让 :root 上的十几个变量参与，元素自身不再声明。
  // 这个指标完全可复现，且正是性能差异的根因。
  await js(`localStorage.setItem('yun-theme','light')`)
  await win.webContents.reload()
  await wait(2400)

  const themeImpl = await js(`
    (() => {
      const root = document.documentElement
      root.setAttribute('data-theme-animating', '')
      let withTransition = 0
      let total = 0
      for (const el of document.querySelectorAll('*')) {
        total++
        const cs = getComputedStyle(el)
        const tp = cs.transitionProperty
        if (tp && tp !== 'none' && tp !== 'all') withTransition++
      }
      const rootProps = (getComputedStyle(root).transitionProperty || '')
        .split(',').filter(Boolean).length
      root.removeAttribute('data-theme-animating')
      return { total, withTransition, rootProps }
    })()
  `)
  // 阈值：通配选择器会让 withTransition ≈ total；新实现应远小于它
  check('主题过渡不再命中全部元素（避免逐元素插值）',
    themeImpl.total > 0 && themeImpl.withTransition < themeImpl.total * 0.2,
    `带 transition 的元素 ${themeImpl.withTransition}/${themeImpl.total}`)
  // 只要求"过渡确实发生在 :root 的少量变量上"。
  // 具体数量会随设计调整（当前只过渡玻璃色与边框共 5 个，
  // 页面主背景与文字为保可读性改为瞬切），所以不锁定精确值。
  check('过渡集中在 :root 的可插值变量上（而非逐元素）',
    themeImpl.rootProps >= 3,
    `:root 过渡变量数=${themeImpl.rootProps}`)

  // 对比度仍需实测：这是用户直接感知的"看不看得清"
  const switchContrast = await js(`
    new Promise(resolve => {
      const root = document.documentElement
      const lum = (c) => { const [r,g,b] = c.map(v => { v/=255; return v<=0.03928? v/12.92 : Math.pow((v+0.055)/1.055,2.4) }); return 0.2126*r+0.7152*g+0.0722*b }
      // getPropertyValue 有时会把值包在引号里返回（实测 '--bg-0' 得到 "rgb(...)"），
      // 先剥掉引号再解析，否则正则会漏掉、对比度样本数恒为 1
      // 实测两个坑：
      //  1) getPropertyValue('--bg-0') 有时返回带引号的字符串，需先剥引号
      //  2) 切换瞬间 getComputedStyle(el).color 可能返回空串（元素正在重算样式），
      //     此时必须跳过采样而不是判为失败，否则样本数恒为 1
      // 解析 rgb()/rgba() 字符串。刻意不用正则：
      // 这段代码位于模板字符串内，正则里的 \\( 转义会被模板字符串吞掉，
      // 导致最终送进浏览器的正则变成 /rgba?(([^)]+))/ —— 抓出来的首段带 '('，
      // Number('(54') === NaN，对比度恒为 NaN。
      // 用 indexOf/slice 解析，不依赖任何转义。
      const parseRgb = (s) => {
        const str = String(s || '').trim().replace(/^["']|["']$/g, '')
        const l = str.indexOf('(')
        const r = str.lastIndexOf(')')
        if (l < 0 || r < 0 || r <= l) return null
        const nums = str.slice(l + 1, r).split(',').slice(0, 3).map((x) => Number(x.trim()))
        return nums.length === 3 && nums.every((n) => Number.isFinite(n)) ? nums : null
      }
      const ratio = (fg,bg) => { const L1=lum(fg), L2=lum(bg); return (Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05) }

      const items = [...document.querySelectorAll('.sidebar-item')]

      let minRatio = Infinity
      let samples = 0
      const sample = () => {
        // ⚠️ 每次都要重新查元素，不能缓存引用：
        // 主题切换会让侧边栏 React 重渲染，旧节点脱离文档后
        // getComputedStyle 返回空串，缓存引用会导致样本数恒为 1。
        const el = [...document.querySelectorAll('.sidebar-item')]
          .find(b => /搜索/.test(b.textContent || ''))
        const bg = parseRgb(getComputedStyle(root).getPropertyValue('--bg-0'))
        const fg = el ? parseRgb(getComputedStyle(el).color) : null
        if (bg && fg) {
          minRatio = Math.min(minRatio, ratio(fg, bg))
          samples++
        }
      }
      sample()
      const btn = items.find(b => /深色模式/.test(b.textContent || ''))
      if (btn) btn.click()
      const t0 = performance.now()
      // 用 rAF 采样而不是 setInterval：
      // 切换期间主线程被长任务占据时，setInterval 会被饿死（实测只采到 1 次），
      // 而 rAF 跟着渲染节奏走，能覆盖到真正的过渡帧。
      const loop = () => {
        sample()
        if (performance.now() - t0 > 1300) {
          resolve({
            minRatio: Number.isFinite(minRatio) ? +minRatio.toFixed(2) : -1,
            samples,
          })
        } else {
          requestAnimationFrame(loop)
        }
      }
      requestAnimationFrame(loop)
    })
  `)
  // 阈值 3:1 —— 曾因前景/背景同时插值撞车跌到 1.44:1
  check('主题切换全程文字可读（最低对比度 ≥ 3:1）',
    switchContrast.minRatio >= 3,
    `minRatio=${switchContrast.minRatio} samples=${switchContrast.samples}`)

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
