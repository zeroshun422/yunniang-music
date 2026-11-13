import React from 'react'

/**
 * 极简虚拟滚动容器
 *
 * 动机：实测 1221 行的歌曲列表会生成 13431 个 DOM 节点，
 * 创建+布局耗时约 202ms，滚动时明显掉帧。
 *
 * 实现：只渲染可视区域 + 上下缓冲区的行，用上下两个占位块撑起总高度。
 * 不引入 react-window 等依赖，保持依赖精简。
 *
 * 约束：要求每行高度固定（本项目歌曲行是固定 52px），
 * 否则需要测量真实高度，复杂度会大幅上升。
 */

export interface VirtualListProps<T> {
  items: T[]
  renderItem: (item: T, index: number) => React.ReactNode
  /** 行高（px），必须与实际渲染高度一致 */
  itemHeight: number
  /** 可视区域高度；不传则自动测量容器高度 */
  height?: number
  /** 上下各多渲染几行，减少快速滚动时的空白 */
  overscan?: number
  className?: string
}

export function VirtualList<T>({
  items,
  renderItem,
  itemHeight,
  height,
  overscan = 6,
  className,
}: VirtualListProps<T>) {
  const [scrollTop, setScrollTop] = React.useState(0)
  const [measuredHeight, setMeasuredHeight] = React.useState(height ?? 600)
  const containerRef = React.useRef<HTMLDivElement>(null)

  // 未显式传入高度时，跟随容器尺寸变化
  React.useEffect(() => {
    if (height !== undefined) return
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height
      if (h && h > 0) setMeasuredHeight(h)
    })
    ro.observe(el)
    setMeasuredHeight(el.clientHeight || 600)
    return () => ro.disconnect()
  }, [height])

  const viewportHeight = height ?? measuredHeight
  const total = items.length
  const totalHeight = total * itemHeight

  // 可视范围内起止索引
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan)
  const visibleCount = Math.ceil(viewportHeight / itemHeight) + overscan * 2
  const endIndex = Math.min(total, startIndex + visibleCount)

  const visible = items.slice(startIndex, endIndex)
  const padTop = startIndex * itemHeight
  const padBottom = Math.max(0, totalHeight - endIndex * itemHeight)

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop)
  }

  // 列表为空时交由调用方的 empty 态处理
  if (!total) return null

  return (
    <div
      className={className}
      ref={containerRef}
      style={{
        height: height ?? '100%',
        overflowY: 'auto',
        overflowX: 'hidden',
        position: 'relative',
      }}
      onScroll={handleScroll}
      // 让屏幕阅读器知道这是个长列表
      role="list"
      aria-rowcount={total}
    >
      <div style={{ height: padTop }} aria-hidden="true" />
      {visible.map((item, i) => (
        <div key={startIndex + i} role="listitem">
          {renderItem(item, startIndex + i)}
        </div>
      ))}
      <div style={{ height: padBottom }} aria-hidden="true" />
    </div>
  )
}
