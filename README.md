# 云娘音乐 · Yunniang Music

**为 Linux 打造的网易云音乐桌面客户端** —— 无损音质 · 每日推荐 · 私人雷达 · 心动模式 · 私人漫游 · 音乐网盘

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Linux%20x86__64-informational)](https://github.com)
[![Electron](https://img.shields.io/badge/Electron-33-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

> 因为网易云音乐官方从未提供 Linux 安装包，第三方客户端又往往功能残缺或体验粗糙，
> 所以本项目从零实现了一个完整可用的 Linux 原生客户端。

![登录界面](docs/screenshots/login.png)

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/home.png" alt="发现音乐"><br/><sub><b>发现音乐</b></sub></td>
    <td width="50%"><img src="docs/screenshots/heart.png" alt="心动模式"><br/><sub><b>心动模式</b></sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/cloud.png" alt="音乐网盘"><br/><sub><b>音乐网盘</b></sub></td>
    <td width="50%"><img src="docs/screenshots/rank.png" alt="排行榜"><br/><sub><b>排行榜</b></sub></td>
  </tr>
</table>

---

## ⚠️ 免责声明

**本项目仅供个人学习与技术研究使用，严禁任何商业用途。**

- 本项目**不提供、不存储、不分发**任何音乐内容，所有音乐数据均实时来自网易云音乐官方服务器
- 音乐版权归**网易云音乐及各版权方**所有
- 使用本项目可能违反《网易云音乐服务条款》，**由此产生的一切后果由使用者自行承担**
- 本项目与网易云音乐官方**无任何关联**，"网易云音乐" 是其权利人的商标
- 请使用你自己的账号，并遵守当地法律法规

如果你喜欢这些音乐，**请支持正版**，购买会员或数字专辑。

---

## 目录

- [功能清单](#功能清单)
- [快速开始](#快速开始)
- [技术架构](#技术架构)
- [音质说明（重要）](#音质说明重要)
- [关于风控与重试](#关于风控与重试)
- [数据来源与账号安全](#数据来源与账号安全)
- [从源码构建](#从源码构建)
- [配置项](#配置项)
- [已知限制](#已知限制)
- [合规声明](#合规声明)

---

## 功能清单

| # | 功能 | 状态 | 实现方式（接口） |
|---|------|:----:|------------------|
| 1 | **账号登录** | ✅ | 扫码（`/login/qr/*`）、手机号（`/login/cellphone`）、邮箱（`/login`）三种方式 |
| 2 | **音质选择（含无损）** | ✅ | `/song/url/v1` 支持的 `standard / higher / exhigh / lossless / hires / jymaster` 六档 |
| 3 | **搜索** | ✅ | `/search`，支持单曲 / 歌单 / 歌手 / 专辑 / 用户 / 电台 / MV，含热搜与分页 |
| 4 | **每日推荐** | ✅ | `/recommend/songs`（30 首，每日更新） |
| 5 | **私人雷达** | ✅ | `/playlist/detail?id=3136952023` + `/playlist/track/all` |
| 6 | **心动模式** | ✅ | `/playmode/intelligence/list`（种子歌曲 + 参考歌单 → 相似推荐，带推荐理由） |
| 7 | **私人漫游** | ✅ | `/personal_fm`、`/personal/fm/mode`（默认 / 熟悉 / 探索 / 场景推荐）、`/fm_trash` |
| 8 | **歌单广场** | ✅ | `/playlist/catlist`、`/top/playlist`、`/top/playlist/highquality`，分类 + 最热/最新 |
| 9 | **排行榜** | ✅ | `/toplist`、`/playlist/track/all`（65 个官方榜单） |
| 10 | **我喜欢的音乐** | ✅ | `/likelist` + `/song/detail` + `/like`（乐观更新，支持本地搜索与排序） |
| 11 | **收藏的歌单** | ✅ | `/user/playlist`、`/playlist/subscribe`（收藏 / 创建 分栏，可取消收藏） |
| 12 | **音乐网盘** | ✅ | `/user/cloud`、`/user/cloud/del`（显示码率与文件大小，支持删除与分页） |

### 播放器能力

| 能力 | 状态 | 说明 |
|------|:----:|------|
| 播放 / 暂停 | ✅ | |
| 上一首 / 下一首 | ✅ | 播放 >3 秒时"上一首"先回到开头 |
| 进度拖动 | ✅ | 拖动时实时预览目标时间 |
| 音量控制 / 静音 | ✅ | 音量持久化 |
| 滚动歌词 | ✅ | 含中文翻译，自动居中滚动 |
| **桌面歌词** | ✅ | 独立透明置顶窗口，可拖动 |
| 播放队列 | ✅ | 拖拽排序、删除单曲、清空、点击跳播 |
| 循环模式 | ✅ | 列表循环 / 单曲循环 / 关闭 |
| 随机播放 | ✅ | |
| 本地缓存 / 下载 | ✅ | 右键歌曲 →「下载当前音质」，保留真实格式（FLAC/MP3） |
| 音质实时提示 | ✅ | 降级时明确提示"「无损」不可用，已降级为「极高」320kbps" |

---

## 快速开始

### 方式一：AppImage（免安装，推荐）

```bash
chmod +x 云娘音乐-1.0.0-x86_64.AppImage
./云娘音乐-1.0.0-x86_64.AppImage
```

> 若提示缺 FUSE：`sudo apt install libfuse2`

### 方式二：.deb（安装到系统菜单）

```bash
sudo apt install ./yunniang-music_1.0.0_amd64.deb
# 然后在应用菜单搜索「云娘音乐」，或：
yunniang-music
```

### 首次使用

1. 启动后进入登录页，用**扫码登录**（推荐）或手机号/邮箱登录
2. 登录成功后凭据以 **AES-256-GCM 加密**保存在本机 `~/.config/云娘音乐/`（权限 600）
3. 在 **设置 → 播放音质** 中选择「无损」即可

---

## 技术架构

```
┌─────────────────────────────────────────────────────────┐
│  Electron 主进程 (electron/main.ts)                      │
│                                                          │
│  ┌────────────────────────┐   ┌──────────────────────┐  │
│  │ 内嵌 NeteaseCloudMusic │   │ 音频代理 (47100)      │  │
│  │ Api 服务 (47200)       │◄──│ · 补 Referer 防盗链   │  │
│  │ 同进程 require，无子进程│   │ · 音质解析 + 重试     │  │
│  └────────────────────────┘   │ · 降级检测            │  │
│           ▲                    └──────────────────────┘  │
│           │ IPC (contextBridge, contextIsolation=true)   │
├───────────┼──────────────────────────────────────────────┤
│  渲染进程 (React 18 + TypeScript + zustand)              │
│  搜索 / 每日推荐 / 私人雷达 / 心动 / 漫游 / 广场 /        │
│  排行榜 / 我喜欢 / 收藏 / 网盘 / 播放器 / 歌词            │
└──────────────────────────────────────────────────────────┘
```

### 目录结构

```
yunniang-music/
├── electron/
│   ├── main.ts              # 主进程：内嵌 API、音频代理、Cookie 加密、下载、桌面歌词
│   └── preload.ts           # contextBridge 安全桥接
├── src/
│   ├── api/
│   │   ├── ncm.ts           # 全部接口封装（含 -460 自动重试）
│   │   └── bridge.ts        # 音质定义与 window.yun 类型
│   ├── store/
│   │   ├── player.ts        # 播放器状态机
│   │   ├── auth.ts          # 登录态
│   │   └── library.ts       # 喜欢的音乐
│   ├── components/          # SongList / PlayerBar / QualityMenu / 歌词 等
│   ├── pages/               # 14 个页面
│   └── styles/global.css    # 单一深色主题样式表
├── scripts/
│   ├── build-electron.mjs   # esbuild 打包主进程
│   ├── test-preload.js      # UI 视觉测试用 mock
│   └── visual-test.js       # 13 个路由自动截图
└── electron-builder.yml     # AppImage / deb 打包配置
```

### 关键设计决策

| 决策 | 原因 |
|------|------|
| **Electron** 而非 Tauri/Qt | 目标机（Linux Mint 22.3）已装 Node 24，但**无 Rust、无 GTK/Qt/webkit 开发头文件**；Electron 是唯一零额外工具链即可构建的方案，且 Chromium 原生支持 FLAC 解码 |
| API **同进程 require**，非子进程 | 打包后无系统 Node，`serveNcmApi()` 直接嵌入主进程 |
| Cookie **AES-256-GCM** 加密 | 密钥由 `userData + HOME + hostname` 派生，明文不落盘 |
| 音频经**本地代理**转发 | 网易云音频有 Referer 防盗链，直接 `<audio src>` 会 403；代理同时负责音质解析与降级检测 |
| API 打包进 **asar 内** | 放在 `extraResources` 会导致 `require('express')` 找不到依赖 |

---

## 音质说明（重要）

### 支持的档位

| 档位 | 码率 | 格式 | 所需权限 |
|------|------|------|----------|
| 标准 | 128 kbps | MP3 | 免费 |
| 较高 | 192 kbps | MP3 | 免费 |
| 极高 | 320 kbps | MP3 | 免费 |
| **无损 (SQ)** | 999 kbps | **FLAC** | 黑胶 VIP |
| **Hi-Res (HR)** | 1900 kbps | FLAC 24bit | SVIP |
| **超清母带** | 1999 kbps | FLAC Master | SVIP |

### 实测结论

- **未登录 / 匿名账号最高只能拿到 320k MP3**，请求 `lossless` 时服务端会**静默降级**为 128k MP3 却仍返回 `code: 200`
- 本项目已实现**真实音质反推**（`inferRealLevel`）：依据返回的 `br` 与 `type` 判断实际档位，不会虚标"无损"
- 降级时播放栏会明确提示，例如：
  > 「无损」不可用，已自动降级为「极高」（320kbps）

- **要真正听到 FLAC 无损，必须登录有黑胶 VIP / SVIP 的账号** —— 这是账号权限限制，客户端无法绕过

验证方式：**设置 → 播放音质 → 检测各档位实际可用音质**，会逐个档位请求并显示真实结果。

---

## 关于风控与重试

网易云对 `/song/url/v1` 有**随机风控**：同一请求约 40–60% 概率返回

```json
{ "code": -460, "message": "检测到您的网络环境存在风险，请稍后再试" }
```

本项目做了三层处理：

1. **清除伪造 IP** — `generateConfig` 会生成随机中国 IP 写入 `global.cnIp`，服务端把它作为 `X-Real-IP` 发出，与真实出口 IP 不符直接触发风控。主进程启动后立即 `global.cnIp = ''`
2. **同档位重试** — 每个音质档位最多重试 5 次，短随机退避（160–400ms）
3. **档位降级链** — `jymaster → hires → lossless → exhigh → higher → standard`，逐级回退

实测重试后单曲解析成功率约 80%（5 首中 4 首）。

---

## 数据来源与账号安全

### 数据来源

本项目**不依赖任何第三方服务器**，使用开源项目 [NeteaseCloudMusicApi](https://github.com/Binaryify/NeteaseCloudMusicApi)（**MIT 许可**）在本机进程内直接调用网易云音乐公开接口。

- **无需你提供任何 API Key 或凭据**
- 所有请求从你的机器直接发往 `music.163.com`
- 没有中间服务器，没有遥测

### 账号安全

| 项目 | 做法 |
|------|------|
| 密码 | 仅用于向网易云官方换取登录凭据，**不保存密码明文** |
| Cookie | AES-256-GCM 加密存储于 `~/.config/云娘音乐/login-session.bin`，文件权限 `600` |
| 网络 | Cookie 只发往 `127.0.0.1` 的本地内嵌服务，由它转发给 `music.163.com` |
| 渲染进程 | `contextIsolation: true`、`nodeIntegration: false`，仅通过白名单 IPC 通信 |

### 合规提示

- 本项目仅用于**个人学习与自用**，请勿用于商业用途或二次分发音乐内容
- 音乐版权归网易云音乐及各版权方所有
- 你的账号行为受《网易云音乐服务条款》约束；频繁请求可能触发风控，本项目已尽量降低请求频率
- 下载功能仅供备份你**有权访问**的内容

---

## 从源码构建

### 环境要求

- Node.js ≥ 18（实测 24.22.1）
- npm ≥ 9
- Linux x86_64（Debian/Ubuntu 系）

### 开发模式

```bash
npm install

# 需要给 electron / esbuild 的安装脚本授权（npm 11+）
npm install-scripts approve electron esbuild

# 启动开发环境（Vite HMR + Electron）
npm run dev
```

### 生产构建

```bash
npm run build     # 构建渲染进程 + 主进程
npm start         # 以本地已构建产物启动（等价于运行最终 app）
```

### 打包

```bash
npm run dist           # 同时产出 AppImage 与 deb
npm run dist:appimage  # 仅 AppImage
npm run dist:deb       # 仅 deb
```

产物位于 `release/`：

```
release/云娘音乐-1.0.0-x86_64.AppImage
release/yunniang-music_1.0.0_amd64.deb
```

> **国内网络提示**：GitHub 直连可能超时。本项目已验证可通过代理前缀绕过：
> ```bash
> git config --global url."https://v4.gh-proxy.org/https://github.com/".insteadOf "https://github.com/"
> ```
> 或为 electron 二进制设置镜像：
> ```bash
> export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
> ```

### UI 自动化验证（可选）

```bash
# 用 mock 数据对 13 个路由逐个截图，输出到 /tmp/ui-shots
npx electron scripts/visual-test.js
```

---

## 配置项

本项目**无需任何配置文件**，开箱即用。以下为运行时自动管理的路径：

| 项目 | 默认路径 | 可否修改 |
|------|----------|----------|
| 登录凭据 | `~/.config/云娘音乐/login-session.bin` | 否（自动管理） |
| 下载目录 | `~/Music/云娘音乐下载/` | 可在设置页打开 |
| 缓存目录 | `~/.config/云娘音乐/audio-cache/` | 否 |
| 内嵌 API 端口 | `127.0.0.1:47200`（占用则顺延至 47240） | 否（自动） |
| 音频代理端口 | `127.0.0.1:47100`（占用则顺延至 47140） | 否（自动） |

> 端口冲突时会自动寻找可用端口，无需手动干预。

---

## 稳定性说明（实战修复记录）

本项目在真实账号下做了完整联调，修复了下列问题（均已复现并验证）：

| 问题 | 根因 | 处理 |
|---|---|---|
| 首次启动崩溃 | `NeteaseCloudMusicApi` 在 require 时同步读取 `anonymous_token`，全新系统无此文件 | 在 require 前预创建 |
| 重启后掉登录 | `/login/status` 的 code 在 `data.code`，判断了顶层 `code`，误删有效凭据 | 修正判定 + 网络失败不误删 |
| 音质菜单点了没反应 | `.menu` 是 `fixed`，配 `bottom:100%` 会跑到视口外 | 改 `absolute` |
| 封面空白 | 各接口封面字段不同（`picUrl`/`al.picUrl`/`album.picUrl`） | 统一多字段兜底取值 |
| 点歌手无跳转 | 点击后原地重复搜索歌手类型 | 新增歌手详情页 |
| 心动模式必失败 | 该接口只接受「用户自己的歌单」，默认传了官方雷达歌单 | 改为自动选中用户歌单 |
| 播放量显示 0 | 接口字段大小写不一致（`playcount` vs `playCount`） | 统一取值函数 |
| 搜索返回空 | `/search` 被限流返回 405 | 改用 `/cloudsearch` 优先 + 回退 |
| 切歌报"播放被阻止" | `getConfig()` 异步，旧请求晚到覆盖了新歌 `src` | 请求序号校验 + 静默忽略打断 |
| 我喜欢少 221 首 | `playlist/detail` 的 `tracks` 截断到 1000 首 | 用完整 `trackIds` + 补齐详情 |

### 关于音质与风控

`/song/url/v1` 存在**随机风控**（返回 `-460`，实测触发率约 40–60%），本项目做了三层处理：

1. 清除伪造的 `X-Real-IP`（`generateConfig` 会写入随机中国 IP，与真实出口不符会触发风控）
2. 同档位最多重试 5 次，短随机退避
3. 档位降级链 `jymaster → hires → lossless → exhigh → higher → standard`

**音质受账号权益限制**：客户端会如实反映服务端返回的真实格式（通过下载文件头校验确认），若被降级会明确提示，不会虚标「无损」。

## 已知限制

| 限制 | 说明 |
|------|------|
| 无损音质依赖账号权益 | 非 VIP 账号最高 320k；客户端会诚实提示降级，不会虚标 |
| `/song/url/v1` 随机风控 | 已做重试 + 降级链，仍可能有极少数曲目解析失败（多为版权下架） |
| 心动模式需登录 | `/playmode/intelligence/list` 依赖真实账号的歌单权限 |
| 私人雷达需听歌记录 | 新账号可能返回空列表 |
| 搜索的"用户/电台/MV" | 仅展示，项目未实现用户主页与 MV 播放器 |
| 音乐网盘上传 | 需用网易云官方客户端上传，本客户端只负责播放/删除 |
| 未做系统媒体键（MPRIS） | 可用应用内控件与外接键盘快捷键替代 |
| 未签名 | AppImage/deb 均未做代码签名 |

---

## 合规声明

```
本项目为个人学习用途的开源软件，与网易云音乐（NetEase Cloud Music）官方无关。
"网易云音乐" 是其权利人的商标。本项目不使用其商标作为产品名。

音乐内容版权归网易云音乐及各版权方所有，本项目不存储、不分发任何音乐文件。
用户需自行确保其使用行为符合《网易云音乐服务条款》及当地法律法规。

本项目基于 MIT 许可分发。
```

---

---

## 贡献

欢迎提交 Issue 与 PR。

```bash
git clone <your-fork>
cd yunniang-music
npm install
npm install-scripts approve electron esbuild   # npm 11+ 需要授权安装脚本
npm run dev
```

提交前请确保：

```bash
npx tsc --noEmit     # 零类型错误
npm run build        # 构建通过
```

代码风格约定见 [CONVENTIONS.md](CONVENTIONS.md)。

---

## Star History

如果这个项目对你有帮助，欢迎点个 ⭐

---

## 致谢

- [NeteaseCloudMusicApi](https://github.com/Binaryify/NeteaseCloudMusicApi) — MIT，本地接口层
- [Electron](https://www.electronjs.org/) · [React](https://react.dev/) · [Vite](https://vitejs.dev/) · [zustand](https://zustand-demo.pmnd.rs/)
- 图标为手写 SVG，无第三方图标库依赖
