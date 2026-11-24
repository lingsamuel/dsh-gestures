import { scrollGestures, selectGestures } from './swipe.js'

const SYSTEM_EDGE_INSET = 24

const interactive = [
  'input', 'textarea', 'select', '[contenteditable]:not([contenteditable="false"])', '[role="textbox"]',
  '[role="slider"]', '[data-dockkit-float]', '[data-dockkit-divider]',
  'iframe', 'canvas',
].join(', ')

const primaryDrag = [
  '[draggable="true"]', '[data-dockkit-tab]',
  '[data-side="sidebar"]', '[data-side="rightbar"]', '[data-width-handle]',
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
  // 栏宽拖柄、原生拖放和 Dockkit 标签都使用主指针，右键可直接发起手势。
  if (input !== 'mouse' && target.closest(primaryDrag)) return
  const narrow = frame.hasAttribute('data-sidebar-drawer')
  if ((!preferences.wide && !narrow) || (input === 'mouse' && narrow) || (input === 'two-finger' && !narrow)) return

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
  const scroller = !overlay && input !== 'touch' && Array.from(frame.querySelectorAll(
    '[data-slot="main"] [data-conversation-scroll]:has([data-chat-flow])',
  )).find(element => element.getClientRects().length > 0 && !element.closest('[inert], [hidden]'))
  if (input === 'two-finger' && (!scroller || !scroller.contains(target))) return
  let origin
  if (target.closest('[data-sidebar-mask]')) origin = 'mask'
  else if (leftColumn?.contains(target)) origin = 'left'
  else if (rightPanel?.contains(target)) origin = 'right'

  const width = window.innerWidth
  const atSystemEdge = input === 'touch' && Math.min(x, width - x) < SYSTEM_EDGE_INSET
  const gestures = input === 'two-finger' ? [] : selectGestures(origin, x, width, {
    leftOpen, rightOpen, overlay, leftAvailable: Boolean(leftToggle), rightAvailable: Boolean(rightPanel),
  }, input).filter(gesture => preferences[gesture.key] && !(atSystemEdge && gesture.open))
  if (scroller) gestures.push(...scrollGestures.filter(gesture => preferences[gesture.key]))
  // 鼠标轨迹独立于可执行动作。触屏需要有实际可用动作才占用滑动。
  if (input !== 'mouse' && (gestures.length === 0 || scrollsHorizontally(target, frame))) return
  return { gestures, frame, narrow, rightSession, leftOpen, rightOpen, scroller }
}

/** 保持原生动画、焦点交接与右侧标签状态。 */
export function togglePanel(ctx, gesture) {
  if (gesture.side === 'left') ctx.layout.toggleSidebar()
  else ctx.get('sidebarRight').toggleExpanded()
}
