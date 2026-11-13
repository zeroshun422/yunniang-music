import React, { useEffect, useState } from 'react'
import { useAuth } from '@/store/auth'
import { usePlayer } from '@/store/player'
import { QUALITIES, levelToLabel } from '@/api/bridge'
import type { QualityLevel } from '@/types'
import { coverUrl } from '@/api/ncm'
import { IconFolder, IconDownload } from '@/components/Icons'
import { useUpdate, describeUpdate } from '@/store/update'

export function SettingsPage() {
  const { user, logout } = useAuth()
  const { quality, setQuality } = usePlayer()
  const [cfg, setCfg] = useState<{ downloadDir: string; cacheDir: string; version: string; proxyBase: string; apiBase: string } | null>(null)
  const [platform, setPlatform] = useState<any>(null)
  const [probe, setProbe] = useState<any>(null)
  const [probing, setProbing] = useState(false)

  const updateStatus = useUpdate((s) => s.status)
  const updateInfo = useUpdate((s) => s.info)
  const checkUpdate = useUpdate((s) => s.check)
  const downloadUpdate = useUpdate((s) => s.download)
  const installUpdate = useUpdate((s) => s.install)
  const openReleasePage = useUpdate((s) => s.openReleasePage)

  useEffect(() => {
    useUpdate.getState().init()
  }, [])

  useEffect(() => {
    window.yun.getConfig().then(setCfg).catch(() => {})
    window.yun.getPlatform().then(setPlatform).catch(() => {})
  }, [])

  const runProbe = async () => {
    setProbing(true); setProbe(null)
    try {
      // 用一个稳定可用的曲目探测各档位实际可得音质
      const results: any[] = []
      for (const q of ['standard', 'exhigh', 'lossless', 'hires']) {
        const r = await window.yun.probeAudio(347230, q)
        results.push({ requested: q, ...r })
      }
      setProbe(results)
    } finally {
      setProbing(false)
    }
  }

  return (
    <div className="content-scroll">
      <div className="page-header">
        <h1 className="page-title">设置</h1>
        <span className="page-sub">账号、音质与本地存储</span>
      </div>

      {/* 账号 */}
      <section className="mb-24">
        <div className="section-title">账号</div>
        {user ? (
          <div className="row" style={{ gap: 14, padding: '14px 16px', background: 'var(--bg-2)', borderRadius: 10 }}>
            <img src={coverUrl(user.avatarUrl, 100)} alt=""
              style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', background: 'var(--bg-3)' }} />
            <div className="grow">
              <div style={{ fontSize: 15, fontWeight: 550 }}>{user.nickname}</div>
              <div className="small muted">
                UID {user.userId}
                {user.vipType && user.vipType > 0
                  ? <span style={{ color: 'var(--accent)', marginLeft: 8 }}>黑胶 VIP</span>
                  : <span style={{ marginLeft: 8 }}>普通用户</span>}
              </div>
            </div>
            <button className="btn ghost" onClick={() => logout()}>退出登录</button>
          </div>
        ) : (
          <div className="muted small">未登录</div>
        )}
      </section>

      {/* 音质 */}
      <section className="mb-24">
        <div className="section-title">播放音质</div>
        <div className="small muted mb-12">
          选择播放时优先请求的音质。若账号权益不足或歌曲无对应资源，会自动降级到可用的最高音质，并在播放栏提示。
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          {QUALITIES.map((q) => {
            const active = q.level === quality
            return (
              <div
                key={q.level}
                onClick={() => setQuality(q.level as QualityLevel)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
                  padding: '11px 15px', borderRadius: 9,
                  background: active ? 'var(--accent-soft)' : 'var(--bg-2)',
                  border: `1px solid ${active ? 'var(--accent)' : 'transparent'}`,
                }}
              >
                <div style={{
                  width: 16, height: 16, borderRadius: '50%',
                  border: `2px solid ${active ? 'var(--accent)' : 'var(--text-3)'}`,
                  display: 'grid', placeItems: 'center', flexShrink: 0,
                }}>
                  {active && <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)' }} />}
                </div>
                <div className="grow">
                  <div style={{ fontSize: 13.5 }}>
                    {q.label}
                    {q.badge && <span className="song-tag" style={{ marginLeft: 7 }}>{q.badge}</span>}
                  </div>
                  <div className="small muted">{q.desc}</div>
                </div>
                <div className="small muted">{Math.round(q.br / 1000)} kbps</div>
              </div>
            )
          })}
        </div>

        <div className="mt-16 row">
          <button className="btn" onClick={runProbe} disabled={probing}>
            {probing ? '检测中…' : '检测各档位实际可用音质'}
          </button>
          {probe && <span className="small muted">用于验证账号权益与接口可用性</span>}
        </div>

        {probe && (
          <div className="mt-12" style={{ background: 'var(--bg-2)', borderRadius: 9, padding: '10px 14px' }}>
            {probe.map((p: any) => (
              <div key={p.requested} className="row-between" style={{ padding: '5px 0', fontSize: 12.5 }}>
                <span>请求「{levelToLabel(p.requested)}」</span>
                <span className={p.code === 200 ? '' : 'muted'}>
                  {p.code === 200
                    ? `→ ${levelToLabel(p.actualLevel)} · ${Math.round((p.br || 0) / 1000)}kbps · ${p.type || '-'}`
                    : `→ 失败：${p.error || '无链接'}`}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 存储 */}
      <section className="mb-24">
        <div className="section-title">本地存储</div>
        <div style={{ background: 'var(--bg-2)', borderRadius: 10, padding: '14px 16px', display: 'grid', gap: 14 }}>
          <div>
            <div className="small muted mb-12" style={{ marginBottom: 5 }}>下载目录（无损音乐会保存在这里）</div>
            <div className="row" style={{ gap: 10 }}>
              <code style={{ fontSize: 12, color: 'var(--text-1)', userSelect: 'text', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {cfg?.downloadDir || '—'}
              </code>
              <button className="btn sm ghost" onClick={() => window.yun.openDownloadDir()}>
                <IconFolder size={13} /> 打开
              </button>
            </div>
          </div>
          <div>
            <div className="small muted" style={{ marginBottom: 5 }}>缓存目录</div>
            <code style={{ fontSize: 12, color: 'var(--text-2)', userSelect: 'text' }}>{cfg?.cacheDir || '—'}</code>
          </div>
        </div>
      </section>

      {/* 关于 */}
      {/* 软件更新 */}
      <section className="mb-24">
        <div className="section-title">软件更新</div>
        <div style={{ background: 'var(--bg-2)', borderRadius: 10, padding: '14px 16px' }}>
          <div className="row-between" style={{ padding: '4px 0', fontSize: 12.5 }}>
            <span className="muted">当前版本</span>
            <span>v{updateInfo?.currentVersion || cfg?.version || '—'}</span>
          </div>
          <div className="row-between" style={{ padding: '4px 0', fontSize: 12.5 }}>
            <span className="muted">安装形态</span>
            <span>
              {updateInfo?.format === 'appimage' ? 'AppImage（可原地更新）'
                : updateInfo?.format === 'deb' ? 'deb（需系统安装）'
                : '未知'}
            </span>
          </div>
          <div className="row-between" style={{ padding: '4px 0', fontSize: 12.5 }}>
            <span className="muted">状态</span>
            <span
              style={{
                color: updateStatus.state === 'error' ? 'var(--error-text)'
                  : updateStatus.state === 'available' || updateStatus.state === 'downloaded'
                  ? 'var(--accent)' : 'var(--text-1)',
              }}
            >
              {describeUpdate(updateStatus)}
            </span>
          </div>

          {updateStatus.state === 'downloading' && (
            <div className="progress-line" style={{ marginTop: 10 }}>
              <div style={{ width: `${updateStatus.percent}%` }} />
            </div>
          )}

          <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button
              className="btn sm"
              onClick={() => checkUpdate()}
              disabled={updateStatus.state === 'checking' || updateStatus.state === 'downloading'}
            >
              {updateStatus.state === 'checking' ? '检查中…' : '检查更新'}
            </button>

            {updateStatus.state === 'available' && updateInfo?.format === 'appimage' && (
              <button className="btn sm primary" onClick={() => downloadUpdate()}>
                下载更新
              </button>
            )}

            {updateStatus.state === 'downloaded' && (
              <button className="btn sm primary" onClick={() => installUpdate()}>
                重启并安装
              </button>
            )}

            {(updateStatus.state === 'available' && updateInfo?.format === 'deb') && (
              <button className="btn sm ghost" onClick={() => openReleasePage()}>
                前往下载页
              </button>
            )}
          </div>

          <div className="small muted mt-12" style={{ lineHeight: 1.75 }}>
            {updateInfo?.format === 'appimage'
              ? 'AppImage 版本支持应用内自动更新：检测到新版本后可下载并在重启时生效。'
              : updateInfo?.format === 'deb'
              ? 'deb 版本需要 sudo 安装，因此检测到新版本后会引导你前往下载页手动更新。'
              : '当前安装形态无法应用内更新，请前往下载页获取新版本。'}
          </div>
        </div>
      </section>

      <section>
        <div className="section-title">关于</div>
        <div style={{ background: 'var(--bg-2)', borderRadius: 10, padding: '14px 16px' }}>
          <div className="row-between" style={{ padding: '4px 0', fontSize: 12.5 }}>
            <span className="muted">云娘音乐</span><span>v{cfg?.version || '1.0.0'}</span>
          </div>
          <div className="row-between" style={{ padding: '4px 0', fontSize: 12.5 }}>
            <span className="muted">Electron / Chromium / Node</span>
            <span>{platform ? `${platform.electron} / ${platform.chrome} / ${platform.node}` : '—'}</span>
          </div>
          <div className="row-between" style={{ padding: '4px 0', fontSize: 12.5 }}>
            <span className="muted">平台</span>
            <span>{platform ? `${platform.platform}-${platform.arch}` : '—'}</span>
          </div>
          <div className="row-between" style={{ padding: '4px 0', fontSize: 12.5 }}>
            <span className="muted">内嵌接口服务</span>
            <span className="text-ellipsis" style={{ maxWidth: 320 }}>{cfg?.apiBase || '—'}</span>
          </div>
          <div className="small muted mt-12" style={{ lineHeight: 1.75 }}>
            本项目使用本地内嵌的开源接口服务（NeteaseCloudMusicApi，MIT 许可）访问网易云音乐公开接口。
            登录凭据经 AES-256-GCM 加密后仅保存在本机用户目录，不会上传到任何第三方服务器。
            请仅用于个人学习与自用，音乐版权归网易云音乐及各版权方所有。
          </div>
        </div>
      </section>
    </div>
  )
}
