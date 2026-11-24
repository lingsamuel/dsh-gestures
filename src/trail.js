/** 仅在右键实际拖动后创建画布，轨迹不会改变原来的鼠标命中目标。 */
export function createMouseTrail() {
  let canvas
  let pen
  let lastX
  let lastY

  function draw(startX, startY, x, y) {
    if (!canvas) {
      const surface = document.createElement('canvas')
      const context = surface.getContext('2d')
      if (!context) return

      const scale = window.devicePixelRatio || 1
      surface.width = Math.round(window.innerWidth * scale)
      surface.height = Math.round(window.innerHeight * scale)
      surface.dataset.dshGesturesTrail = ''
      surface.setAttribute('aria-hidden', 'true')
      Object.assign(surface.style, {
        position: 'fixed', inset: 0, width: '100%', height: '100%', zIndex: 10000,
        pointerEvents: 'none', color: 'var(--dsw-alias-brand-primary, #3b82f6)',
      })
      document.body.append(surface)
      context.scale(scale, scale)
      context.strokeStyle = getComputedStyle(surface).color
      context.lineWidth = 3
      context.lineCap = 'round'
      context.lineJoin = 'round'
      canvas = surface
      pen = context
      lastX = startX
      lastY = startY
    }

    pen.beginPath()
    pen.moveTo(lastX, lastY)
    pen.lineTo(x, y)
    pen.stroke()
    lastX = x
    lastY = y
  }

  function clear() {
    canvas?.remove()
    canvas = undefined
    pen = undefined
  }

  return { draw, clear }
}
