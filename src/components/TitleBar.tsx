import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { IconBack, IconForward, IconMin, IconMax, IconRestore, IconClose } from './Icons'

/**
 * 标题栏（iOS 26 风格）
 *
 * 视觉：细（44px）、半透明、底部 0.5px 分隔线。
 * 左侧是导航箭头 + 应用名，右侧是窗口控制（关闭键悬停变红，沿用系统惯例）。
 */
export function TitleBar() {
  const navigate = useNavigate()
  const [maxed, setMaxed] = useState(false)

  useEffect(() => {
    window.yun.winIsMaximized().then(setMaxed).catch(() => {})
    const off = window.yun.onMaximized?.(setMaxed)
    return () => { off?.() }
  }, [])

  return (
    <header className="app-titlebar">
      <div className="app-titlebar__side">
        <button className="u-icon-btn" onClick={() => navigate(-1)} title="后退">
          <IconBack size={15} />
        </button>
        <button className="u-icon-btn" onClick={() => navigate(1)} title="前进">
          <IconForward size={15} />
        </button>
        <span className="app-titlebar__title u-ml-2">云娘音乐</span>
      </div>

      <div className="app-titlebar__side">
        <button
          className="u-icon-btn"
          onClick={() => window.yun.winMinimize()}
          title="最小化"
        >
          <IconMin size={15} />
        </button>
        <button
          className="u-icon-btn"
          onClick={() => window.yun.winMaximize()}
          title={maxed ? '还原' : '最大化'}
        >
          {maxed ? <IconRestore size={13} /> : <IconMax size={13} />}
        </button>
        <button
          className="u-icon-btn u-icon-btn--close"
          onClick={() => window.yun.winClose()}
          title="关闭"
        >
          <IconClose size={15} />
        </button>
      </div>
    </header>
  )
}
