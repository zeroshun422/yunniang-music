# v2 UI 设计系统（iOS 26 风格）

> 适用版本：v2.0.0 起。改动界面样式前先读这份文档。
> v1 的样式说明已归档在 tag `ui-v1-backup-1.10.1` 的 `docs/DESIGN-GLASS.md`。

## 0. 为什么重写

v1 的问题不是"某处不好看"，而是**没有设计体系**：

| 症状 | 实测 |
|---|---|
| 内联样式 | **300 处** / 19 个文件 |
| 圆角取值 | **10 种**（2/3/4/5/6/7/8/10/12/18px） |
| 颜色 | 大量字面量 `#fff`、`rgba(...)` |
| 玻璃 | 每个组件各写一套 `backdrop-filter` |

结论：改一处只能修好一处，无法靠增量修补收敛。所以整体重写样式层。

## 1. 三层样式架构

| 文件 | 职责 | 改什么来这里 |
|---|---|---|
| `src/styles/tokens.css` | 值：颜色 / 圆角 / 间距 / 字阶 / 动效 | 调配色、调圆角档位、调整体节奏 |
| `src/styles/ui.css` | 用法：骨架 / 导航 / 卡片 / 列表 / 播放栏 / 浮层 | 改组件外观、加新组件类 |
| `src/styles/compat.css` | 过渡：旧类名映射 + v1 令牌别名 | 迁移期兜底，迁完即可删段 |

顺序不能反（`main.tsx` 里）：tokens → ui → compat。

## 2. 圆角：只有 5 档

```css
--r-xs:  6px;   /* 徽标、小标签 */
--r-sm: 10px;   /* 按钮、输入框、列表缩略图 */
--r-md: 16px;   /* 分组卡片、封面 */
--r-lg: 22px;   /* 大卡片、抽屉、播放栏 */
--r-xl: 28px;   /* 模态、登录卡 */
--r-pill: 9999px;
```

**不要新增第六档**。v1 有 10 种取值，是"看起来不统一"的最大来源。

所有圆角都走连续曲率：

```css
corner-shape: var(--corner-shape);  /* squircle */
```

本机 Chromium 156 实测计算值为 `superellipse(2)`。不支持时浏览器忽略该声明，
自动退化为普通圆角 —— 这就是降级方案，无需额外处理。

## 3. 间距：8pt 栅格

```css
--sp-1: 4px;  --sp-2: 8px;  --sp-3: 12px;  --sp-4: 16px;
--sp-5: 20px; --sp-6: 24px; --sp-8: 32px;  --sp-10: 40px; --sp-12: 48px;
```

**只用这些值**。不要写 `padding: 7px` 或 `gap: 9px` —— v1 里这类"看起来差不多"
的偏差累积起来就是整体不齐。

## 4. 颜色：按语义命名

| 令牌 | 含义 | 浅色 | 深色 |
|---|---|---|---|
| `--bg-canvas` | 画布（最远） | `#f2f2f7` | `#000000` |
| `--bg-surface` | 卡片 / 列表行 | `#ffffff` | `#1c1c1e` |
| `--bg-surface-2` | 卡片内次级区 | `#f7f7fa` | `#2c2c2e` |
| `--bg-surface-3` | 填充块 / 占位 | `#ebebf0` | `#3a3a3c` |
| `--label` | 主文字 | `#000000` | `#ffffff` |
| `--label-2/3/4` | 递减的文字层级 | 半透明黑 | 半透明白 |
| `--separator` | 分隔线 | `rgba(60,60,67,.13)` | `rgba(84,84,88,.55)` |

**层次靠明度不靠阴影**：画布比卡片淡一档，卡片比浮层淡一档。
阴影只用于真正浮起的元素（菜单、抽屉、播放栏）。

## 5. 玻璃：三个类

| 类 | 用途 | 模糊 |
|---|---|---|
| `.u-glass` | 独立浮起的玻璃块 | 12px |
| `.u-group` | 分组卡片（iOS grouped list） | 12px |
| `.u-list` | 列表卡片（整张列表一个卡片） | 12px |

侧边栏、标题栏用 `--glass-chrome`（72% 不透明，更实）；
菜单、抽屉、播放栏用 `--glass-pop`（82%）。

### 播放栏的模糊只有 1px

这是有意为之。播放栏浮在内容之上，需求是**能透过它看到下面的字**。
实测：0px 无玻璃感、1px 字可读且有柔化、2px 已无法辨认、8-28px 只剩色块。

**改这个值前先确认"透字"需求是否还成立。**

## 6. 字阶

```css
--fs-hero: 34px;      /* 页面大标题（large title） */
--fs-title: 22px;     /* 区块标题 */
--fs-headline: 17px;  /* 强调正文 */
--fs-body: 15px;      /* 正文 */
--fs-sub: 13px;       /* 次要说明 */
--fs-caption: 11px;   /* 标签、计数 */
--fs-micro: 10px;     /* VIP/SQ 等极小标记 */
```

字重：`--fw-regular 400` / `--fw-medium 510` / `--fw-semibold 590` / `--fw-bold 680`。
iOS 用 590 做强调而不是 700 硬粗。

Linux 上没有 SF Pro，用现有 Noto Sans CJK 栈。**iOS 的质感主要来自字重与字号的
层级对比，不是字体本身**，所以重点在 type scale 而非换字体。

## 7. 动效

```css
--ease-out: cubic-bezier(0.22, 1, 0.36, 1);   /* 快出慢停，iOS 手感 */
--dur-fast: 130ms;  --dur-base: 220ms;  --dur-slow: 380ms;
```

只做**响应动作**（hover / active / 展开），不做装饰性动画。
`prefers-reduced-motion` 下全部归零。

## 8. 主题切换：为什么背景与文字不参与过渡

这是踩了两次坑才定下的规则。

**坑一**：让文字参与过渡、画布不参与 → 切换瞬间文字已变白、画布还是浅色，
对比度 **1.12:1**（文字几乎消失）。

**坑二**：让文字与画布都参与过渡 → 深色文字到浅色文字的线性插值必然经过中灰，
而画布过渡中段也是中灰，两者相遇 → **1.59:1**。

**定论**：画布与文字必须**同帧瞬切**（保住 18.82:1 高对比），
只让玻璃面板与分隔线做渐变。大面积玻璃在流动，观感上仍是"主题在过渡"。

```css
html[data-theme-animating] {
  transition-property: --tx-glass-chrome, --tx-glass-card, --tx-glass-pop, --tx-separator;
  /* 不含 --tx-canvas 与 --tx-label */
}
```

## 9. 兼容层（compat.css）的边界

它做两件事：

1. **旧类名映射**：`.content-scroll` / `.page-header` / `.btn` / `.card` 等
   16 个页面仍在用的 v1 类名，映射到新视觉
2. **v1 令牌别名**：`--text-0` → `--label`、`--radius-lg` → `--r-lg` 等 20 个

**它必须是纯样式映射，不能改变布局语义**，否则旧页面的栅格会错位。

迁移一个页面到 `.u-*` 类后，就可以从 compat.css 删掉对应那段。
迁完即删，不要长期留着。

## 10. 验证

```bash
npm run typecheck
npm test
node_modules/.bin/electron scripts/visual-test.js    # 13 路由冒烟
node_modules/.bin/electron scripts/shot-themes.js    # 14 路由 × 明暗 = 28 张
node_modules/.bin/electron scripts/check-ui-v2.js    # 25 项 UI 回归
node_modules/.bin/electron scripts/check-perf.js     # 帧时间（取中位数）
```

`check-ui-v2.js` 覆盖：布局几何（侧边栏不压播放栏、内容延伸到播放栏后方）、
玻璃材质（模糊 + 半透明 + squircle）、右键菜单、抽屉几何、主题切换对比度、
滚到底遮挡检查。

> ⚠️ 该脚本必须用 `show: true` 的可见窗口。隐藏窗口会冻结 CSS 动画与过渡，
> 会把"定位正确"误判成"越界"。

## 10.5 播放链路：一个必须知道的接口事实

网易云对 `/song/url/v1`（新接口）有随机风控，命中时返回 `-460`
（"检测到您的网络环境存在风险"）。但**旧接口 `/song/url` 在同一时刻仍然可用**。

实测（同一首歌、同一时刻）：

| 请求 | 结果 |
|---|---|
| `/song/url/v1?...&level=standard` | `-460` 风控 |
| `/song/url?...&br=128000` | `200` + 有效 mp3 地址 |
| 地址 HEAD 请求 | `200`、`audio/mpeg`、632KB |

**所以：v1 失败后必须无条件尝试旧接口。** 这个兜底逻辑抽在
`electron/quality.ts` 的 `fetchWithLegacyFallback` 里，有 8 个单元测试覆盖。

> ⚠️ 排查这类问题时，**不要用 `scripts/test-preload.js` 探测接口** ——
> 那是 mock，返回的全是假数据。要用真实主进程环境：
> `serveNcmApi()` 起服务，然后 `fetch` 真实接口。

## 11. 回退到 v1

```bash
# 查看 v1
git checkout ui-v1-backup-1.10.1

# 或者只恢复样式层
git checkout ui-v1-backup-1.10.1 -- src/styles/ src/components/ src/pages/
```

工作区外还有独立快照 `../yunniang-ui-backup-v1/`（完整源码，6.4MB）。
