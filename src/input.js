import { candidateAt, togglePanel } from './panels.js'
import { fingersSpreading, isDirectedHorizontally, isHorizontal, matchesSwipe, matchTwoFingerSwipe } from './swipe.js'
import { createMouseTrail } from './trail.js'

const INTENT_DISTANCE = 12

function menuHandled(active) {
  return active.menuEvent && (!active.menuReachedWindow
    || active.menuEvent.defaultPrevented && !active.browserMenuSuppressed)
}

/** 仅在有效起点记录输入。手势结束前重读原生面板与配置，避免把旧输入作用到新会话。 */
export function installInput(ctx, preferences, scrollConversation) {
  const lifetime = new AbortController()
  const trail = createMouseTrail()
  let pending
  let releaseFrame
  let touchScrollFrame
  // 浏览器菜单可能晚于松手和面板更新。记住这次右键的归属，直到下次按下。
  let mouseDragClaimed = false

  function cancel() {
    pending = undefined
    trail.clear()
    window.removeEventListener('touchmove', onTouchMove, true)
    if (releaseFrame !== undefined) {
      window.cancelAnimationFrame(releaseFrame)
      releaseFrame = undefined
    }
    if (touchScrollFrame !== undefined) {
      window.cancelAnimationFrame(touchScrollFrame)
      touchScrollFrame = undefined
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

  function stillAvailable(active, gesture) {
    const { target, x, input } = active
    const next = candidateAt(ctx, preferences.getSnapshot(), target, x, input)
    const needsScroller = input === 'two-finger' || gesture?.axis === 'y'
    return next && next.frame === active.frame && next.narrow === active.narrow
      && next.rightSession === active.rightSession && next.leftOpen === active.leftOpen && next.rightOpen === active.rightOpen
      && (!needsScroller || next.scroller === active.scroller)
      && (gesture === undefined || next.gestures.includes(gesture))
  }

  function perform(active, gesture) {
    if (gesture.axis === 'y') scrollConversation(active.scroller, gesture.direction)
    else togglePanel(ctx, gesture)
  }

  function qualifies(active, gesture, point) {
    const dx = point.clientX - active.x
    const dy = point.clientY - active.y
    return matchesSwipe(gesture, dx, dy, active.input)
  }

  function onTouchStart(event) {
    const touches = Array.from(event.touches)
    if (touches.length === 2 && !pending?.gesture) {
      start(event, touches[0], 'two-finger')
      const scroller = pending?.scroller
      if (!scroller || !touches.every(touch => candidateAt(
        ctx, preferences.getSnapshot(), touch.target, touch.clientX, 'two-finger',
      )?.scroller === scroller)) return cancel()
      pending.touchPair = touches
    } else if (touches.length === 1) {
      start(event, touches[0], 'touch')
      if (pending) pending.touchId = touches[0].identifier
    } else return cancel()
    if (!pending) return
    // 双指移动先交给浏览器，避免两指先平移再捏合时截断整个缩放序列。
    window.addEventListener('touchmove', onTouchMove, {
      capture: true, passive: pending.input === 'two-finger', signal: lifetime.signal,
    })
  }

  function currentPair(active, touches) {
    const pair = active.touchPair.map(start => touches.find(touch => touch.identifier === start.identifier))
    return pair.every(Boolean) ? pair : undefined
  }

  function onTwoFingerMove(active, event) {
    if (event.touches.length !== 2) return cancel()
    const pair = currentPair(active, Array.from(event.touches))
    if (!pair || fingersSpreading(active.touchPair, pair) || !stillAvailable(active)) cancel()
  }

  function finishTwoFingerSwipe(active, gesture) {
    // 双指移动时浏览器可能接管滚动。等惯性结束再定位，避免原生滚动覆盖落点。
    const scroller = active.scroller
    let top = scroller.scrollTop
    let steadyFrames = 0
    function settle() {
      touchScrollFrame = undefined
      if (!stillAvailable(active, gesture)) return
      const nextTop = scroller.scrollTop
      steadyFrames = nextTop === top ? steadyFrames + 1 : 0
      top = nextTop
      if (steadyFrames >= 3) perform(active, gesture)
      else touchScrollFrame = window.requestAnimationFrame(settle)
    }
    touchScrollFrame = window.requestAnimationFrame(settle)
  }

  function onTouchMove(event) {
    const active = pending
    if (active?.input === 'two-finger') return onTwoFingerMove(active, event)
    const touch = event.touches[0]
    if (active?.input !== 'touch' || event.touches.length !== 1 || touch.identifier !== active.touchId) return cancel()
    const dx = touch.clientX - active.x
    const dy = touch.clientY - active.y
    if (!active.gesture) {
      if (Math.abs(dy) >= INTENT_DISTANCE && Math.abs(dy) > Math.abs(dx)) return cancel()
      active.gesture = active.gestures.find(gesture => isDirectedHorizontally(gesture, dx, dy, INTENT_DISTANCE))
      if (!active.gesture) return
    }
    if (!stillAvailable(active, active.gesture)) return cancel()
    if (event.cancelable) event.preventDefault()
  }

  function onTouchEnd(event) {
    const active = pending
    if (active?.input === 'two-finger') {
      if (!active.releaseGesture) {
        const pair = currentPair(active, [...Array.from(event.touches), ...Array.from(event.changedTouches)])
        active.releaseGesture = pair && matchTwoFingerSwipe(active.gestures, active.touchPair, pair)
      }
      const gesture = active.releaseGesture
      if (!gesture || !stillAvailable(active, gesture)) return cancel()
      if (event.touches.length > 0) return
      cancel()
      if (event.cancelable) event.preventDefault()
      finishTwoFingerSwipe(active, gesture)
      return
    }
    const touch = event.changedTouches[0]
    if (active?.input !== 'touch' || touch?.identifier !== active.touchId) return
    cancel()
    const gestures = active.gesture ? [active.gesture] : active.gestures
    const gesture = gestures.find(option => qualifies(active, option, touch))
    if (!gesture || !stillAvailable(active, gesture)) return
    if (event.cancelable) event.preventDefault()
    perform(active, gesture)
  }

  function onMouseDown(event) {
    mouseDragClaimed = false
    if (event.button === 2 && event.buttons === 2) start(event, event, 'mouse')
    else if (pending?.input === 'mouse') cancel()
  }

  function onMouseMove(event) {
    const active = pending
    if (active?.input !== 'mouse' || releaseFrame !== undefined) return
    if (event.buttons !== 2 || menuHandled(active) || !stillAvailable(active)) return cancel()
    if (!mouseDragClaimed) {
      const dx = event.clientX - active.x
      const dy = event.clientY - active.y
      if (!isHorizontal(dx, dy, INTENT_DISTANCE) && !isHorizontal(dy, dx, INTENT_DISTANCE)) return
      mouseDragClaimed = true
    }
    trail.draw(active.x, active.y, event.clientX, event.clientY)
  }

  function onMouseUp(event) {
    const active = pending
    if (active?.input !== 'mouse' || event.button !== 2) return
    trail.clear()
    const gesture = active.gestures.find(gesture => qualifies(active, gesture, event))
    if (!gesture || !stillAvailable(active, gesture)) return cancel()
    mouseDragClaimed = true

    // 部分浏览器先发 mouseup，再派发同次右键的 contextmenu。让页面先完成菜单处理。
    releaseFrame = window.requestAnimationFrame(() => {
      releaseFrame = undefined
      cancel()
      if (!menuHandled(active) && stillAvailable(active, gesture)) perform(active, gesture)
    })
  }

  function observeContextMenu(event) {
    if (pending?.input === 'mouse' && event.button === 2) pending.menuEvent = event
  }

  function handleBrowserMenu(event) {
    const active = pending
    const matchesCandidate = event === active?.menuEvent
    if (matchesCandidate) active.menuReachedWindow = true
    if (event.defaultPrevented) return
    const matchesDrag = mouseDragClaimed && event.button === 2
    if (!matchesDrag && !(matchesCandidate && stillAvailable(active))) return
    // 让页面先处理菜单。右键已经用于拖动时，松手后的浏览器菜单也属于同一次输入。
    event.preventDefault()
    if (matchesCandidate) active.browserMenuSuppressed = true
  }

  const capture = { capture: true, signal: lifetime.signal }
  window.addEventListener('touchstart', onTouchStart, { ...capture, passive: true })
  window.addEventListener('touchend', onTouchEnd, { ...capture, passive: false })
  window.addEventListener('touchcancel', cancel, capture)
  window.addEventListener('pointerdown', () => { mouseDragClaimed = false }, capture)
  window.addEventListener('mousedown', onMouseDown, capture)
  window.addEventListener('mousemove', onMouseMove, { ...capture, passive: true })
  window.addEventListener('mouseup', onMouseUp, capture)
  window.addEventListener('contextmenu', observeContextMenu, capture)
  window.addEventListener('contextmenu', handleBrowserMenu, { signal: lifetime.signal })
  // 浏览器接管 Pointer Events 后，仍可能继续交付同一根手指的 Touch Events。
  window.addEventListener('pointercancel', event => { if (event.pointerType === 'mouse') cancel() }, capture)
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
