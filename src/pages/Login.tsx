import React, { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/store/auth'
import * as ncm from '@/api/ncm'
import { IconClose, IconMin } from '@/components/Icons'

type Tab = 'qr' | 'phone' | 'email'

export function LoginPage() {
  const { loginByQrPoll, loginByPhone, loginByEmail, loggingIn, error } = useAuth()
  const [tab, setTab] = useState<Tab>('qr')

  // 二维码
  const [qrImg, setQrImg] = useState('')
  const [qrKey, setQrKey] = useState('')
  const [qrState, setQrState] = useState<'loading' | 'waiting' | 'scanned' | 'expired' | 'success'>('loading')
  const [qrMsg, setQrMsg] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // 表单
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [pwd, setPwd] = useState('')
  const [formErr, setFormErr] = useState('')

  const stopPoll = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  const startQr = async () => {
    stopPoll()
    setQrState('loading'); setQrMsg(''); setQrImg('')
    try {
      const key = await ncm.qrKey()
      const { qrimg } = await ncm.qrCreate(key)
      setQrKey(key)
      setQrImg(qrimg)
      setQrState('waiting')

      let expired = false
      pollRef.current = setInterval(async () => {
        if (expired) return
        const r = await loginByQrPoll(key)
        if (r.code === 800) {
          expired = true; stopPoll(); setQrState('expired'); setQrMsg('二维码已过期，点击刷新')
        } else if (r.code === 802) {
          setQrState('scanned'); setQrMsg('已扫码，请在手机上确认登录')
        } else if (r.code === 803) {
          expired = true; stopPoll(); setQrState('success'); setQrMsg('登录成功，正在进入…')
        }
      }, 2500)
    } catch (e: any) {
      setQrState('expired'); setQrMsg('二维码加载失败：' + e.message)
    }
  }

  useEffect(() => {
    if (tab === 'qr') startQr()
    else stopPoll()
    return stopPoll
  }, [tab])

  const submitPhone = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormErr('')
    if (!phone.trim() || !pwd) { setFormErr('请填写手机号和密码'); return }
    const r = await loginByPhone(phone.trim(), pwd)
    if (!r.ok) setFormErr(r.message || '登录失败')
  }

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormErr('')
    if (!email.trim() || !pwd) { setFormErr('请填写邮箱和密码'); return }
    const r = await loginByEmail(email.trim(), pwd)
    if (!r.ok) setFormErr(r.message || '登录失败')
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-side">
          <div className="login-side-brand">
            <div className="brand-mark" style={{ width: 36, height: 36, fontSize: 18 }}>云</div>
            <div>
              <h2>云娘音乐</h2>
            </div>
          </div>
          <p>为 Linux 打造的网易云音乐客户端。<br />登录后即可使用全部功能。</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 8 }}>
            {[
              '无损 / Hi-Res / 母带音质',
              '每日推荐 · 私人雷达 · 心动模式',
              '私人漫游 · 音乐网盘',
              '滚动歌词 · 桌面歌词',
            ].map((t) => (
              <div className="login-feat" key={t}>
                <span style={{ color: 'var(--accent)' }}>♪</span>
                <span>{t}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="login-main">
          <div className="login-tabs">
            <button className={`login-tab ${tab === 'qr' ? 'active' : ''}`} onClick={() => setTab('qr')}>扫码登录</button>
            <button className={`login-tab ${tab === 'phone' ? 'active' : ''}`} onClick={() => setTab('phone')}>手机号</button>
            <button className={`login-tab ${tab === 'email' ? 'active' : ''}`} onClick={() => setTab('email')}>邮箱</button>
          </div>

          {tab === 'qr' && (
            <div className="qr-box">
              {qrState === 'loading' && (
                <div className="loading-wrap" style={{ padding: '40px 0' }}>
                  <div className="spinner" /><div>正在生成二维码…</div>
                </div>
              )}
              {qrState !== 'loading' && (
                <div style={{ position: 'relative' }}>
                  <img className="qr-image" src={qrImg} alt="登录二维码" />
                  {qrState === 'expired' && (
                    <div
                      onClick={startQr}
                      style={{
                        position: 'absolute', inset: 0, borderRadius: 11,
                        background: 'var(--fixed-media-scrim)', display: 'grid', placeItems: 'center',
                        color: 'var(--fixed-on-media)', fontSize: 13, cursor: 'pointer',
                      }}
                    >
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 20, marginBottom: 6 }}>↻</div>
                        点击刷新
                      </div>
                    </div>
                  )}
                  {qrState === 'scanned' && (
                    <div style={{
                      position: 'absolute', inset: 0, borderRadius: 11,
                      background: 'var(--fixed-media-scrim)', display: 'grid', placeItems: 'center',
                      color: 'var(--fixed-on-media)', fontSize: 13,
                    }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 20, marginBottom: 6 }}>✓</div>
                        已扫码，请在手机上确认
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div className="qr-hint">
                {qrMsg ? <span className="hl">{qrMsg}</span> : (
                  <>打开 <span className="hl">网易云音乐 App</span><br />扫一扫登录，扫码后可选择保存登录信息</>
                )}
              </div>
            </div>
          )}

          {tab === 'phone' && (
            <form onSubmit={submitPhone}>
              <div className="form-field">
                <label className="form-label">手机号</label>
                <input className="form-input" placeholder="请输入手机号" value={phone}
                  onChange={(e) => setPhone(e.target.value)} autoFocus />
              </div>
              <div className="form-field">
                <label className="form-label">密码</label>
                <input className="form-input" type="password" placeholder="请输入密码" value={pwd}
                  onChange={(e) => setPwd(e.target.value)} />
              </div>
              {(formErr || error) && <div className="error-box">{formErr || error}</div>}
              <button className="btn primary" type="submit" disabled={loggingIn}
                style={{ width: '100%', height: 40, justifyContent: 'center', marginTop: 8, borderRadius: 9 }}>
                {loggingIn ? '登录中…' : '登录'}
              </button>
              <p className="small muted mt-12" style={{ lineHeight: 1.7 }}>
                账号密码仅用于向网易云音乐官方服务器换取登录凭据，<br />
                凭据以 AES-256-GCM 加密保存在本机，不会上传到任何第三方。
              </p>
            </form>
          )}

          {tab === 'email' && (
            <form onSubmit={submitEmail}>
              <div className="form-field">
                <label className="form-label">邮箱</label>
                <input className="form-input" placeholder="请输入邮箱" value={email}
                  onChange={(e) => setEmail(e.target.value)} autoFocus />
              </div>
              <div className="form-field">
                <label className="form-label">密码</label>
                <input className="form-input" type="password" placeholder="请输入密码" value={pwd}
                  onChange={(e) => setPwd(e.target.value)} />
              </div>
              {(formErr || error) && <div className="error-box">{formErr || error}</div>}
              <button className="btn primary" type="submit" disabled={loggingIn}
                style={{ width: '100%', height: 40, justifyContent: 'center', marginTop: 8, borderRadius: 9 }}>
                {loggingIn ? '登录中…' : '登录'}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* 未登录也能关窗 */}
      <div style={{ position: 'fixed', top: 0, right: 0, display: 'flex', WebkitAppRegion: 'no-drag' } as any}>
        <button className="win-btn" onClick={() => window.yun.winMinimize()}><IconMin size={15} /></button>
        <button className="win-btn close" onClick={() => window.yun.winClose()}><IconClose size={15} /></button>
      </div>
    </div>
  )
}
