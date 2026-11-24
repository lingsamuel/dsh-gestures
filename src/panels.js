import { edgeAt, selectGesture } from './swipe.js'

const interactive = [
  'input', 'textarea', 'select', '[contenteditable]:not([contenteditable="false"])', '[role="textbox"]',
  '[role="slider"]', '[draggable="true"]', '[data-dockkit-float]', '[data-dockkit-divider]',
  '[data-side="sidebar"]', '[data-side="rightbar"]', '[data-width-handle]', 'iframe', 'canvas',
].join(', ')

function scrollsHorizontally(element, frame) {
  for (let node = element; node && node !== frame; node = node.parentElement) {
    if (node.scrollWidth > node.clientWidth + 1 && /^(auto|scroll|overlay)$/.test(getComputedStyle(node).overflowX)) return true
  }
  return false
}

function hasOtherOverlay(leftDrawer) {
  return Array.from(document.querySelectorAll('[aria-modal="true"], [role="menu"]'))
    .some(element => element !== leftDrawer && element.getClientRects().length > 0)
}

/** 从 DSH 原生框架读取呈现状态，右侧命令始终指向当前会话的工具栏。 */
export function candidateAt(ctx, preferences, target, x, input) {
  const frame = document.querySelector('[data-rightbar-col]')?.parentElement
  if (!frame || !frame.contains(target) || target.closest(interactive)) return
  // Dockkit 的标签以主指针按下开始拖动，右键仍交给它自己的菜单。
  if (input === 'touch' && target.closest('[data-dockkit-tab]')) return
  const narrow = frame.hasAttribute('data-sidebar-drawer')
  if ((!preferences.wide && !narrow) || (input === 'mouse' && narrow)) return

  const leftOpen = !frame.hasAttribute('data-sidebar-collapsed')
  const leftDrawer = narrow && leftOpen ? frame.querySelector('[data-shortcut-modal="sidebar"]') : undefined
  if (hasOtherOverlay(leftDrawer) || frame.hasAttribute('data-dragging')) return
  if (input === 'mouse' && ctx.get('contextMenus')?.active.getSnapshot()) return

  const right = ctx.get('sidebarRight')
  const rightSession = right?.mounted.getSnapshot()
  const rightPanel = rightSession === undefined ? undefined : frame.querySelector(
    '[data-sidebar-right-panel]:not([data-sidebar-right-session][hidden] *)',
  )
  const rightOpen = Boolean(rightPanel && right.isExpanded())
  const leftToggle = frame.querySelector('[data-sidebar-toggle]')
  const leftColumn = leftToggle && Array.from(frame.children).find(column => column.contains(leftToggle))
  const overlay = leftDrawer ? 'left' : rightOpen && rightPanel.dataset.sidebarRightPanel === 'fullscreen' ? 'right' : undefined
  let origin
  if (target.closest('[data-sidebar-mask]')) origin = 'mask'
  else if (leftColumn?.contains(target)) origin = 'left'
  else if (rightPanel?.contains(target)) origin = 'right'

  const gesture = selectGesture(origin, edgeAt(x, window.innerWidth), { leftOpen, rightOpen, overlay })
  if (!gesture || !preferences[gesture.key]) return
  if ((gesture.side === 'left' && !leftToggle) || (gesture.side === 'right' && !rightPanel)) return
  if (scrollsHorizontally(target, frame)) return
  return { gesture, frame, narrow, rightSession, leftOpen, rightOpen }
}

/** 保持原生动画、焦点交接与右侧标签状态。 */
export function togglePanel(ctx, gesture) {
  if (gesture.side === 'left') ctx.layout.toggleSidebar()
  else ctx.get('sidebarRight').toggleExpanded()
}
