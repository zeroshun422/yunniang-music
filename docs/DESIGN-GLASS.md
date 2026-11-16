# Liquid Glass 视觉规范

> 适用于 v1.6.0 起的界面。改动样式前先读这份文档，尤其是「三个坑」一节。
> 所有数值都在 `src/styles/global.css` 的材质令牌区定义，组件里不要硬编码。

## 1. 设计基线

### 1.1 玻璃层级

透明度按「离用户越近越不透明」排列。这不是随意取值 —— 它是这套风格唯一的层级语言，
一旦层级倒挂，界面会立刻失去空间感。

| 令牌 | 用途 | 浅色 | 深色 | 模糊 |
|---|---|---|---|---|
| `--glass-1` | 侧边栏、sticky 表头 | 白 0.55 | rgb(30,30,44) 0.58 | 18–24px |
| `--glass-2` | 内容面板、卡片 | 白 0.50 | rgb(34,34,50) 0.52 | 18px |
| `--glass-3` | 抽屉、登录卡片 | 白 0.62 | rgb(38,38,54) 0.64 | 30px |
| `--glass-pop` | 菜单、提示条 | 白 0.74 | rgb(40,40,58) 0.76 | 36px |
| `--glass-bar` | 标题栏、播放栏 | 白 0.60 | rgb(30,30,44) 0.62 | 24px |

模糊半径：`--blur-1` 18px / `--blur-2` 24px / `--blur-3` 30px / `--blur-pop` 36px。
饱和度一律 `--glass-saturate: 180%`。

### 1.1.1 透明度可调（设置 → 外观）

用户在设置里能用一个滑块整体调节玻璃透明度，范围 20%–180%（100% 为设计基准）。

实现要点：**JS 只写一个数字，配色仍只有 CSS 一处真源**。

```css
:root {
  --gab-2: 0.26;                              /* alpha 基准，永不被改写 */
  --gmin-2: 0.10; --gmax-2: 0.36;             /* 该层级的上下限 */
  --ga-2: clamp(var(--gmin-2),
    calc(var(--gab-2) * var(--glass-scale)),  /* JS 内联写入 <html> */
    var(--gmax-2));
  --glass-2: rgb(var(--gc-2) / var(--ga-2));
}
```

三个必须遵守的约束：

1. **派生层必须定义在 `:root` 上**，与 JS 内联写 `--glass-scale` 的是同一个元素。
   实测：这些 `calc` 若定义在子元素上，`--glass-scale` 的变化不会传播进去。
2. **alpha 基准必须独立存在**（`--gab-*`）。若 JS 直接覆写 `--glass-2`，
   就再也没有"原始值"可乘，滑块退化成绝对值，且层次关系无法恢复。
3. **上下限按层级区分**。菜单/浮层必须有较高下限才压得住底下内容；
   面板可以很透。统一下限会让菜单在低透明度下文字不可读。

### 1.2 取色方式

**浅色**：白色叠层，靠透明度分层。底色 `--bg-0: #eceef4` 略偏冷，让白玻璃显出来。

**深色**：**不要**用「变白」的思路。深色玻璃靠**提亮**——白色只叠 0.05–0.12，
超过这个量整块就变灰雾，通感立刻消失。底色 `#0a0a0f`。

**棱边**是玻璃能否「立起来」的关键，必须两层：

```css
border: 1px solid var(--glass-edge-outer);           /* 外描边，墨色低透明 */
box-shadow: var(--glass-inner-highlight), ...;        /* 内高光，inset 1px 白线 */
```

只做半透明底、不做这两层，视觉上就是一块磨砂塑料板。

### 1.3 圆角与间距

| 元素 | 圆角 |
|---|---|
| 面板（`.panel`） | 14px |
| 卡片 / 菜单 / 提示条 | 12px |
| 按钮胶囊 | 18px（高 36–40px 时） |
| 输入框 | 10px |
| 封面图 | 12px（`--radius-lg`） |
| 抽屉 | 0（贴边推挤，圆角会露出缝） |

内容区留白：`padding: 22px 26px 30px`；窄窗（≤1100px）降到 `18px 20px 26px`。

### 1.3.1 连续曲率圆角（Squircle）

播放栏、抽屉使用苹果风格的连续曲率圆角，不是普通圆弧：

```css
--bar-radius: 26px;
--bar-corner-shape: squircle;

.player-bar::before {
  border-radius: var(--bar-radius);
  corner-shape: var(--bar-corner-shape);  /* Chromium 139+ 原生 */
}
```

- 本机 Electron 45 / Chrome 156 **原生支持**，无需 SVG 或 mask 模拟
- 不支持时浏览器直接忽略该声明，自动退化为普通圆角 —— 这就是降级方案
- 实测计算值为 `superellipse(2)`，与普通 `round` 在大半径下差异肉眼可辨
- 还支持 `scoop` / `bevel` / `notch`，本项目只用 `squircle`

### 1.4 阴影

单层阴影放在玻璃上会显脏，统一用「贴地紧影 + 远距离扩散」两层：

```css
--glass-shadow-1: 0 1px 2px rgba(20,22,28,.06), 0 8px 24px rgba(20,22,28,.08);
--glass-shadow-2: 0 2px 6px rgba(20,22,28,.08), 0 16px 48px rgba(20,22,28,.14);
```

## 2. 可复用的材质类

| 类 | 用途 | 是否模糊 | 是否折射 |
|---|---|---|---|
| `.glass` | 需要「浮起」的独立玻璃块 | 是（24px） | 否 |
| `.glass-refract` | **大玻璃面**：登录卡 / 菜单 / 抽屉 | 是（5–18px） | **是** |
| `.panel` | 贴在内容流里的分组面板 | 是（5px） | 否 |
| `.panel-inset` | 面板内部的次级凹槽 | 否，实心 `--control-fill` | 否 |
| `.panel-clickable` | 让 `.panel` 有 hover 反馈 | — | — |

优先用类，不要在页面里写内联样式堆玻璃参数。

## 3. 环境光层

玻璃必须有东西可模糊。主窗口保持**不透明**，模糊对象由应用自绘：

```css
body::before { /* 四色径向渐变极光，z-index: -1 */ }
```

这样做的好处：不依赖桌面壁纸与窗口合成器，X11/Wayland 行为一致，
也不需要给 `BrowserWindow` 加 `transparent`（那会带来拖影与黑底风险）。

调色：浅色 `--aurora-1..4` 透明度 0.11–0.13，深色 0.16–0.34。
**浅色不能调浓**，否则整页像彩纸，丢掉玻璃的干净感。

## 3.5 光学折射（`.glass-refract`）

不是描边伪装，是**真实的背景弯折**：`feDisplacementMap` 按位移贴图
把「玻璃背后的画面」按像素挪位，产生类似凸透镜的折射。

实现放在 `index.html`（全局定义一次，不参与 React 渲染）：

```html
<filter id="lg-refract">
  <feImage href="data:image/svg+xml,..." result="DISP"/>  <!-- 位移贴图 -->
  <feDisplacementMap in="SourceGraphic" in2="DISP" scale="22"
                     xChannelSelector="R" yChannelSelector="G"/>
  <feGaussianBlur stdDeviation="0.3"/>                     <!-- 抹锯齿 -->
</filter>
```

位移贴图的设计要点：**中心是中性灰**（`#808080`，R=G=128，位移量 0），
只有边缘才偏离中性值。所以中心内容不弯、只有棱边弯 —— 这也是文字仍然清晰的根本原因。

### 必须分两层（这是最容易踩的坑）

`feDisplacementMap` 作用于 `SourceGraphic`，即**元素及其全部内容**。
直接把它挂在带文字的卡片上，文字会一起被扭成乱码。

```css
.glass-refract::before {   /* 折射层：绝对定位、无内容 */
  position: absolute; inset: 0; z-index: 0;
  background: var(--glass-2);
  backdrop-filter: blur(5px) saturate(180%);
  filter: url(#lg-refract);
}
.glass-refract > * {       /* 内容层：抬到折射层之上，保持锐利 */
  position: relative; z-index: 1;
}
```

用 `::before` 而不是像参考库那样加一个 `.glass__warp` 子元素，
好处是**零 JSX 侵入**——只要给已有元素加一个类名即可。

### 适用范围

只用于**大玻璃面**：登录卡、右键菜单、音质菜单、抽屉。
小按钮（36–40px）不要用：`scale` 在这么小的尺寸上会让边缘发糊，
且视觉收益几乎为零。小控件继续用 `.glass` 的多层 bevel 即可。

`scale` 取值：登录卡/菜单 22；若将来用于更小的元件，需降到 8–10。

### 不能挂在哪些元素上

**绝不能**把 `filter: url(...)` 挂到「含有 `position: fixed` 后代」的元素上。
`filter` 会让该元素成为包含块，播放栏内的队列/歌词抽屉会立刻错位
（实测抽屉 `right` 偏移、高度被裁成 0）。

所以：`.player-bar`、`.main-area`、`.app-shell` **永远不加** `.glass-refract`。

## 4. 坑（改样式前必读）

### 4.1 `backdrop-filter` 会产生包含块

任何带 `backdrop-filter` 的元素会成为 `position: fixed` 后代的**包含块**。

具体事故：`.player-bar` 内的播放队列/歌词抽屉是 `position: fixed`。
把模糊直接写在 `.player-bar` 上，抽屉就从「贴视口右侧」退化为「贴播放栏内部」，
直接被 78px 高裁掉。

**解法**：模糊交给 `::before` 伪元素承载（伪元素是孩子不是祖先，不影响包含块）。
已用 `scripts/check-glass.js` 断言锁定（`right == innerWidth`）。

同理，`.main-area` **绝不能**加 `backdrop-filter`。

### 4.2 `--bg-hover` / `--bg-active` 是叠加层，不是填充色

它们已改为半透明（浅 `rgba(20,22,28,.06)` / 深 `rgba(255,255,255,.07)`），
只适合做 hover 反馈。**不能**用作按钮、输入框、滑块轨道的底色 ——
会与背后玻璃混出一层灰雾。

需要确定实心灰时用：

```css
--control-fill         /* 按钮默认态、输入框凹槽 */
--control-fill-hover   /* 按钮 hover、输入框聚焦 */
--control-fill-active  /* 滑块轨道、进度条轨道 */
```

`--bg-3` 仍是实色，保留给封面图占位（透明会看起来像缺图）。

### 4.3 禁用态不能只降 opacity

`.btn.primary` 是红底白字，整体 `opacity: .45` 会变成粉底白字，对比度掉到 2:1 以下。
禁用态要改成「中性实心底 + 弱化文字」，做成明确状态而不是模糊状态 ——
`.btn.primary:disabled` 已单独处理。

## 4.5 性能：大面积 `backdrop-filter` 会掉帧

这是实测踩到的真实问题，不是理论担忧。

**现象**：播放栏改成悬浮条后，模糊层从「78px 高的贴边横条」变成「1340×98 的悬浮块」，
滚动列表时出现**稳定的隔帧丢帧** —— 帧序列交替 `16.7 / 33.3ms`，也就是掉到 30fps。
（无 GPU 加速、最坏情况测得。）

**排查结论**：

| 尝试 | 结果 |
|---|---|
| 缩小模糊半径 14→8→4px | 无效，仍丢帧 |
| `contain: paint` | 无效，反而更差 |
| `content-visibility: auto` | 无效 |
| `will-change: backdrop-filter` | 无效 |
| 内容区提升为独立合成层 | 无效 |
| 模糊层缩到 400px 宽 | **慢帧归零** |
| 完全去掉 `backdrop-filter` | **慢帧归零** |

即：**代价与模糊层面积成正比，与半径几乎无关**。

**解法**：播放栏不再实时模糊，改用「静态磨砂底 + 顶部柔光」：

```css
.player-bar::before {
  /* 不写 backdrop-filter */
  background: var(--glass-bar-sheen), var(--glass-bar-solid);
  border-radius: var(--bar-radius);
  corner-shape: squircle;
}
```

播放栏位于窗口最底部、下方没有易变内容，所以观感损失极小，换来滚动稳定满帧。
它仍有独立的 alpha（`--gab-bar-solid`），会随透明度滑块一起变化。

**给未来的提醒**：若还想给更大的面（如整个内容区）加实时模糊，
先量一量面积代价。经验阈值：模糊层宽度超过约 600px 就应改用静态磨砂底。

## 5. 降级

三层防线，改令牌即可，不需要动组件选择器：

1. `@supports not (backdrop-filter)` → 玻璃转实心色，同时 `--aurora-opacity: 0`
2. `@media (prefers-reduced-transparency: reduce)` → 同上，并显式 `backdrop-filter: none`
3. `@media (prefers-reduced-motion: reduce)` → 关位移与入场动画；
   另预留 `html[data-glass="lite"]` 压缩模糊半径（无 UI 触发，供未来设置项）

## 6. 无障碍

- 正文/标题对比度 16:1；次要文字浅色 ≥3.9:1、深色 4.8:1
- `:focus-visible` 有 2px 强调色焦点环；鼠标点击不显示
- 不在玻璃上用纯色分隔线，靠透明度与描边分层

## 7. 验证命令

```bash
npm run typecheck                          # 0 错误
npm test                                   # 101/101
node_modules/.bin/electron scripts/visual-test.js      # 13 路由冒烟
node_modules/.bin/electron scripts/shot-themes.js      # 14 路由 × 明暗 = 28 张
node_modules/.bin/electron scripts/shot-login.js       # 登录页（折射最明显）
node_modules/.bin/electron scripts/check-glass.js      # 18 项交互断言
node_modules/.bin/electron scripts/check-perf.js       # 帧时间（取中位数）
```

`check-perf.js` 判据说明：单轮只采 ~20 帧，偶发丢一帧就会把 p95 抬到 33/66ms
（实测深色主题 6 次连测中有 1 次 66.7ms，其余全是 16.7ms）。
这种抖动与玻璃/折射无关，所以**取 3 轮中位数**而不是最差值 ——
取最差只会把统计噪声当成性能问题。

`shot-themes.js` 与 `check-glass.js` 都用独立 userData 目录，不会碰真实配置。
其中 `check-glass.js` **必须**用 `show: true` 的可见窗口 —— 隐藏窗口会冻结
CSS 动画与过渡，会把「定位正确」误判成「越界 12px」。
