const openLeft = { key: 'openLeft', side: 'left', direction: 1, open: true }
const closeLeft = { key: 'closeLeft', side: 'left', direction: -1, open: false }
const openRight = { key: 'openRight', side: 'right', direction: -1, open: true }
const closeRight = { key: 'closeRight', side: 'right', direction: 1, open: false }

const EDGE_WIDTH = 64

/** 对每个方向最多保留一个动作。同向时优先选择起点所在一侧。 */
export function selectGestures(origin, x, width, { leftOpen, rightOpen, overlay, leftAvailable, rightAvailable }, input = 'touch') {
  const left = leftAvailable ? (leftOpen ? closeLeft : openLeft) : undefined
  const right = rightAvailable ? (rightOpen ? closeRight : openRight) : undefined
  if (overlay === 'left') {
    return left && (origin === 'left' || origin === 'mask') ? [left] : []
  }
  if (overlay === 'right') {
    return right && origin === 'right' ? [right] : []
  }
  if (input === 'touch') {
    if ((origin === 'left' && leftOpen) || x <= EDGE_WIDTH) return left ? [left] : []
    if ((origin === 'right' && rightOpen) || width - x <= EDGE_WIDTH) return right ? [right] : []
  }
  if (left && right && left.direction === right.direction) {
    const side = origin ?? (x < width / 2 ? 'left' : 'right')
    return [side === 'left' ? left : right]
  }
  return [left, right].filter(Boolean)
}

export function isDirectedHorizontally(gesture, dx, dy, distance) {
  return dx * gesture.direction >= Math.max(distance, Math.abs(dy) * 1.5)
}

/** 距离和方向足以区分滑动与轻微位移，快速手势也能触发。 */
export function matchesSwipe(gesture, dx, dy, input) {
  return isDirectedHorizontally(gesture, dx, dy, input === 'mouse' ? 64 : 56)
}
