import { candidateAt, togglePanel } from './panels.js'
import { isDirectedHorizontally, matchesSwipe } from './swipe.js'

const TOUCH_INTENT_DISTANCE = 12

/** 仅在有效起点记录输入。手势结束前重读原生面板与配置，避免把旧输入作用到新会话。 */
export function installInput(ctx, preferences) {
  const lifetime = new AbortController()
  let pending
  let releaseFrame

  function cancel() {
    pending = undefined
    window.removeEventListener('touchmove', onTouchMove, true)
    if (releaseFrame !== undefined) {
      window.cancelAnimationFrame(releaseFrame)
      releaseFrame = undefined
    }
  }

  function start(event, point, input) {
    cancel()
    const target = event.target
    if (!(target instanceof Element) || event.defaultPrevented) return
    const { clientX: x, clientY: y } = point
    const candidate = candidateAt(ctx, preferences.getSnapshot(), target, x, input)
    if (!candidate) return
    pending = { ...candidate, target, x, y, input }
  }

  function stillAvailable(active) {
    const { target, x, input } = active
    const next = candidateAt(ctx, preferences.getSnapshot(), target, x, input)
    return next && next.frame === active.frame && next.gesture === active.gesture && next.narrow === active.narrow
      && next.rightSession === active.rightSession && next.leftOpen === active.leftOpen && next.rightOpen === active.rightOpen
  }

  function qualifies(active, point) {
    const dx = point.clientX - active.x
    const dy = point.clientY - active.y
    return matchesSwipe(active.gesture, dx, dy, active.input)
  }

  function onTouchStart(event) {
    if (event.touches.length !== 1) return cancel()
    const touch = event.touches[0]
    start(event, touch, 'touch')
    if (!pending) return
    pending.touchId = touch.identifier
    // 只有一条候选手势存续时才安装可阻止默认行为的移动监听。
    window.addEventListener('touchmove', onTouchMove, { capture: true, passive: false, signal: lifetime.signal })
  }

  function onTouchMove(event) {
    const active = pending
    const touch = event.touches[0]
    if (!active || event.touches.length !== 1 || touch.identifier !== active.touchId || !event.cancelable) return cancel()
    const dx = touch.clientX - active.x
    const dy = touch.clientY - active.y
    if (!active.claimed) {
      if (Math.hypot(dx, dy) < TOUCH_INTENT_DISTANCE) return
      if (!isDirectedHorizontally(active.gesture, dx, dy, TOUCH_INTENT_DISTANCE)) return cancel()
    }
    if (!stillAvailable(active)) return cancel()
    active.claimed = true
    event.preventDefault()
  }

  function onTouchEnd(event) {
    const active = pending
    const touch = event.changedTouches[0]
    if (active?.input !== 'touch' || touch?.identifier !== active.touchId) return
    cancel()
    if (active.claimed && qualifies(active, touch) && stillAvailable(active)) togglePanel(ctx, active.gesture)
  }

  function onMouseDown(event) {
    if (event.button === 2 && event.buttons === 2) start(event, event, 'mouse')
    else if (pending?.input === 'mouse') cancel()
  }

  function onMouseUp(event) {
    const active = pending
    if (active?.input !== 'mouse' || event.button !== 2) return
    if (!qualifies(active, event) || !stillAvailable(active)) return cancel()

    // 部分浏览器先发 mouseup，再派发同次右键的 contextmenu。让页面先完成菜单处理。
    releaseFrame = window.requestAnimationFrame(() => {
      releaseFrame = undefined
      const pageHandled = active.menuEvent && (!active.menuReachedWindow
        || active.menuEvent.defaultPrevented && !active.browserMenuSuppressed)
      cancel()
      if (!pageHandled && stillAvailable(active)) togglePanel(ctx, active.gesture)
    })
  }

  function observeContextMenu(event) {
    if (pending?.input === 'mouse' && event.button === 2) pending.menuEvent = event
  }

  function handleBrowserMenu(event) {
    const active = pending
    if (!active || event !== active.menuEvent) return
    active.menuReachedWindow = true
    if (event.defaultPrevented || !stillAvailable(active)) return
    // 在页面冒泡处理之后，只压住会中断当前候选手势的浏览器菜单。
    event.preventDefault()
    active.browserMenuSuppressed = true
  }

  const capture = { capture: true, signal: lifetime.signal }
  window.addEventListener('touchstart', onTouchStart, { ...capture, passive: true })
  window.addEventListener('touchend', onTouchEnd, { ...capture, passive: true })
  window.addEventListener('touchcancel', cancel, capture)
  window.addEventListener('mousedown', onMouseDown, capture)
  window.addEventListener('mouseup', onMouseUp, capture)
  window.addEventListener('contextmenu', observeContextMenu, capture)
  window.addEventListener('contextmenu', handleBrowserMenu, { signal: lifetime.signal })
  window.addEventListener('pointercancel', cancel, capture)
  window.addEventListener('dragstart', cancel, capture)
  window.addEventListener('blur', cancel, { signal: lifetime.signal })
  window.addEventListener('resize', cancel, { signal: lifetime.signal })
  document.addEventListener('visibilitychange', cancel, { signal: lifetime.signal })
  const unsubscribe = preferences.subscribe(cancel)

  return () => {
    cancel()
    unsubscribe()
    lifetime.abort()
  }
}
