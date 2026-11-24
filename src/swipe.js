const openLeft = { key: 'openLeft', side: 'left', direction: 1, open: true }
const closeLeft = { key: 'closeLeft', side: 'left', direction: -1, open: false }
const openRight = { key: 'openRight', side: 'right', direction: -1, open: true }
const closeRight = { key: 'closeRight', side: 'right', direction: 1, open: false }

/** 打开手势避开系统返回手势通常使用的屏幕最外侧。 */
export function edgeAt(x, width) {
  if (x >= 24 && x <= 64) return 'left'
  if (width - x >= 24 && width - x <= 64) return 'right'
}

/** 从起点只选一个原生动作，避免两栏同时接收同一条手势。 */
export function selectGesture(origin, edge, { leftOpen, rightOpen, overlay }) {
  if (overlay === 'left') {
    if (origin === 'left' || origin === 'mask') return closeLeft
    return
  }
  if (overlay === 'right') {
    if (origin === 'right') return closeRight
    return
  }
  if (origin === 'left' && leftOpen) return closeLeft
  if (origin === 'right' && rightOpen) return closeRight
  if (!leftOpen && edge === 'left') return openLeft
  if (!rightOpen && edge === 'right') return openRight
}

export function isDirectedHorizontally(gesture, dx, dy, distance) {
  return dx * gesture.direction >= Math.max(distance, Math.abs(dy) * 1.5)
}

/** 距离和方向足以区分滑动与轻微位移，快速手势也能触发。 */
export function matchesSwipe(gesture, dx, dy, input) {
  return isDirectedHorizontally(gesture, dx, dy, input === 'mouse' ? 64 : 56)
}
