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

### 1.4 阴影

单层阴影放在玻璃上会显脏，统一用「贴地紧影 + 远距离扩散」两层：

```css
--glass-shadow-1: 0 1px 2px rgba(20,22,28,.06), 0 8px 24px rgba(20,22,28,.08);
--glass-shadow-2: 0 2px 6px rgba(20,22,28,.08), 0 16px 48px rgba(20,22,28,.14);
```

## 2. 可复用的三个类

| 类 | 用途 | 是否模糊 |
|---|---|---|
| `.glass` | 需要「浮起」的独立玻璃块 | 是（24px） |
| `.panel` | 贴在内容流里的分组面板 | 是（18px） |
| `.panel-inset` | 面板内部的次级凹槽 | 否，实心 `--control-fill` |
| `.panel-clickable` | 让 `.panel` 有 hover 反馈 | — |

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

## 4. 三个坑（改样式前必读）

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
node_modules/.bin/electron scripts/check-glass.js      # 14 项交互断言
```

`shot-themes.js` 与 `check-glass.js` 都用独立 userData 目录，不会碰真实配置。
其中 `check-glass.js` **必须**用 `show: true` 的可见窗口 —— 隐藏窗口会冻结
CSS 动画与过渡，会把「定位正确」误判成「越界 12px」。
