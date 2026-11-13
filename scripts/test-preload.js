// 测试用 preload：把 window.yun 完全 mock，用于在真实 Chromium 中验证各页面渲染
const { contextBridge } = require('electron')

const IMG = (seed) => `https://picsum.photos/seed/${seed}/300/300`

const song = (id, name, artist, album) => ({
  id,
  name,
  ar: [{ id: 1, name: artist }],
  al: { id: 10, name: album, picUrl: IMG('al' + id) },
  dt: 240000,
  fee: 1,
})

const songs = [
  song(1, '晴天', '周杰伦', '叶惠美'),
  song(2, '七里香', '周杰伦', '七里香'),
  song(3, '海阔天空', 'Beyond', '乐与怒'),
  song(4, '起风了', '买辣椒也用券', '起风了'),
  song(5, '夜曲', '周杰伦', '十一月的萧邦'),
  song(6, '稻香', '周杰伦', '魔杰座'),
  song(7, '平凡之路', '朴树', '猎户星座'),
  song(8, '消愁', '毛不易', '平凡的一天'),
]

const playlist = (id, name) => ({
  id,
  name,
  coverImgUrl: IMG('pl' + id),
  trackCount: 50,
  playCount: 1234567,
  creator: { nickname: '云娘', userId: 1 },
  description: '这是一个测试歌单的描述，用于验证页面渲染效果。',
  subscribed: false,
})

const playlists = [
  playlist(101, '华语流行精选'),
  playlist(102, '深夜emo必听'),
  playlist(103, '轻音乐助眠'),
  playlist(104, '摇滚不死'),
  playlist(105, '民谣故事'),
  playlist(106, '电子摇摆'),
]

const profile = {
  userId: 66666,
  nickname: '测试用户',
  avatarUrl: IMG('avatar'),
  vipType: 11,
  level: 9,
}

function routeOf(path) {
  const p = path.split('?')[0]
  const q = new URLSearchParams(path.split('?')[1] || '')
  return { p, q }
}

async function mockNcm(path) {
  const { p, q } = routeOf(path)

  switch (p) {
    case '/login/status':
      return { code: 200, data: { profile, account: { id: profile.userId } } }
    case '/login/qr/key':
      return { data: { unikey: 'mockkey' }, code: 200 }
    case '/login/qr/create':
      return { data: { qrimg: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', qrurl: '' }, code: 200 }
    case '/login/qr/check':
      return { code: 801, message: '等待扫码' }

    case '/search':
      return {
        code: 200,
        result: {
          songs, songCount: 8,
          playlists, playlistCount: 6,
          artists: songs.slice(0, 4).map((s, i) => ({ id: i, name: s.ar[0].name, picUrl: IMG('ar' + i), albumSize: 10, musicSize: 20 })),
          artistCount: 4,
          albums: songs.slice(0, 4).map((s, i) => ({ id: i, name: s.al.name, picUrl: IMG('alb' + i), artist: { name: s.ar[0].name } })),
          albumCount: 4,
          userprofiles: [{ userId: 1, nickname: '云娘用户', avatarUrl: IMG('u1') }],
          userprofileCount: 1,
          mvs: [], mvCount: 0, djRadios: [], djRadiosCount: 0,
        },
      }
    case '/search/hot':
      return { code: 200, result: { hots: [{ first: '周杰伦' }, { first: '晴天' }, { first: '夜曲' }, { first: '稻香' }, { first: '七里香' }, { first: '起风了' }] } }
    case '/search/suggest':
      return { code: 200, result: { allMatch: [], songs: [], artists: [], albums: [], playlists: [] } }

    case '/recommend/songs':
      return { code: 200, data: { dailySongs: songs, recommendReasons: [] } }
    case '/recommend/resource':
      return { code: 200, recommend: playlists }

    case '/personalized/newsong':
      return {
        code: 200,
        result: songs.map((s) => ({ id: s.id, name: s.name, picUrl: s.al.picUrl, song: s })),
      }

    case '/playlist/track/all':
      return { code: 200, songs }
    case '/playlist/catlist':
      return { code: 200, sub: ['华语', '流行', '摇滚', '民谣', '电子', '轻音乐', '爵士', '古典', '嘻哈', 'R&B', '影视原声', 'ACG'].map((name) => ({ name })) }
    case '/top/playlist':
      return { code: 200, playlists, more: false }
    case '/top/playlist/highquality':
      return { code: 200, playlists: playlists.slice(0, 4) }
    case '/toplist':
      return {
        code: 200,
        list: [
          { id: 19723756, name: '飙升榜', coverImgUrl: IMG('top1'), updateFrequency: '每天更新', trackCount: 100 },
          { id: 3779629, name: '新歌榜', coverImgUrl: IMG('top2'), updateFrequency: '每天更新', trackCount: 100 },
          { id: 2884035, name: '原创榜', coverImgUrl: IMG('top3'), updateFrequency: '每周更新', trackCount: 100 },
          { id: 3778678, name: '热歌榜', coverImgUrl: IMG('top4'), updateFrequency: '每周更新', trackCount: 200 },
        ],
      }

    case '/playmode/intelligence/list':
      return {
        code: 200,
        data: songs.map((s, i) => ({ ...s, songInfo: s, reason: i === 0 ? '因为你喜欢周杰伦' : '相似风格推荐' })),
      }

    case '/personal_fm':
      return { code: 200, data: songs.slice(0, 1) }
    case '/personal/fm/mode':
      return { code: 200, data: songs.slice(0, Number(q.get('limit')) || 3) }
    case '/fm_trash':
      return { code: 200 }

    case '/likelist':
      // 返回 1221 首，用于验证大列表虚拟滚动
      return { code: 200, ids: Array.from({ length: 1221 }, (_, i) => 100000 + i) }

    case '/user/playlist':
      // 首个为「我喜欢的音乐」特殊歌单（供 likePlaylistWithTime 使用），
      // 其后为普通歌单，保证收藏页等也有数据
      return {
        code: 200,
        playlist: [
          {
            id: 8034822070,
            name: '测试用户喜欢的音乐',
            specialType: 5,
            trackCount: 1221,
            coverImgUrl: IMG('likepl'),
            creator: { nickname: '测试用户', userId: profile.userId },
          },
          ...playlists,
          { ...playlist(999, '我创建的歌单'), creator: { nickname: '测试用户', userId: profile.userId } },
        ],
      }

    case '/playlist/detail':
      if (q.get('id') === '8034822070') {
        return {
          code: 200,
          playlist: {
            id: 8034822070,
            name: '测试用户喜欢的音乐',
            specialType: 5,
            trackCount: 1221,
            coverImgUrl: IMG('likepl'),
            // 1221 条 trackIds，带 at 时间戳（用于时间排序）
            trackIds: Array.from({ length: 1221 }, (_, i) => ({
              id: 100000 + i,
              at: 1794000000000 - i * 60000,
            })),
            tracks: [],
          },
        }
      }
      return { code: 200, playlist: { ...playlist(Number(q.get('id')) || 101, '测试歌单'), tracks: songs } }
    case '/song/detail': {
      const ids = (q.get('ids') || '').split(',').filter(Boolean).map(Number)
      const big = ids.filter((id) => id >= 100000).map((id) => ({
        id,
        name: `测试歌曲 #${id - 100000 + 1}`,
        ar: [{ id: 1, name: '测试歌手' }],
        al: { id: 1, name: '测试专辑', picUrl: IMG('big' + id) },
        dt: 200000,
        fee: 0,
      }))
      // 小 id 命中预设歌曲；其余按大列表生成
      const known = songs.filter((s) => ids.includes(s.id))
      return { code: 200, songs: [...known, ...big] }
    }
    case '/like':
      return { code: 200 }

    case '/playlist/subscribe':
      return { code: 200 }

    case '/user/cloud':
      return {
        code: 200,
        count: songs.length,
        size: 128849018,
        data: songs.map((s) => ({
          songId: s.id, songName: s.name, artist: s.ar[0].name, album: s.al.name,
          fileName: `${s.name}.flac`, fileSize: 31457280, bitrate: 999000, simpleSong: s,
        })),
      }
    case '/user/cloud/del':
      return { code: 200 }

    case '/lyric':
      return {
        code: 200,
        lrc: { lyric: '[00:00.00]测试歌词第一行\n[00:04.00]测试歌词第二行\n[00:08.00]测试歌词第三行\n[00:12.00]测试歌词第四行\n[00:16.00]测试歌词第五行' },
        tlyric: { lyric: '[00:00.00]Translated line one\n[00:04.00]Translated line two' },
      }

    default:
      return { code: 200, result: { songs, playlists }, data: songs, playlists, songs }
  }
}

contextBridge.exposeInMainWorld('yun', {
  getConfig: async () => ({
    apiBase: 'http://mock', proxyBase: 'http://mock-proxy',
    downloadDir: '/home/user/Music/云娘音乐下载', cacheDir: '/tmp/cache',
    version: '1.0.0', isDev: false,
  }),
  getPlatform: async () => ({ platform: 'linux', arch: 'x64', electron: '33.4.11', chrome: '130', node: '20' }),
  saveCookie: async () => true,
  loadCookie: async () => 'MUSIC_U=mock',
  clearCookie: async () => true,
  ncm: (p) => mockNcm(p),
  ncmWithCookie: (p) => mockNcm(p),
  probeAudio: async (_id, level) => ({ code: 200, requested: level, actualLevel: level, br: 999000, type: 'flac', size: 30000000 }),
  download: async () => ({ ok: true, level: 'lossless', path: '/tmp/x.flac', size: 30000000 }),
  onDownloadProgress: () => () => {},
  openDownloadDir: async () => {},
  lyricShow: async () => true,
  lyricUpdate: async () => true,
  lyricHide: async () => true,
  lyricToggle: async () => true,
  lyricSetIgnoreMouse: async () => true,
  onLyricUpdate: () => () => {},
  // 自动更新（mock：已是最新版）
  getUpdateInfo: async () => ({
    currentVersion: '1.3.0',
    format: 'deb',
    packaged: true,
    feedConfigured: true,
  }),
  getUpdateStatus: async () => ({ state: 'not-available', currentVersion: '1.3.0' }),
  checkUpdate: async () => ({ state: 'not-available', currentVersion: '1.3.0' }),
  downloadUpdate: async () => true,
  installUpdate: async () => true,
  openReleasePage: async () => true,
  onUpdateStatus: () => () => {},

  winMinimize: async () => {},
  winMaximize: async () => false,
  winClose: async () => {},
  winIsMaximized: async () => false,
  onMaximized: () => () => {},
})
