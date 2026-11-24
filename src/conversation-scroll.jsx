import { useLayoutEffect, useMemo, useSyncExternalStore } from 'react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'

const slot = 'conversation.view'

/** 在原生 Chat 视图接缝处暂停本次顶部定位的自动分页，视图仍由 DSH 渲染。 */
export function installConversationScroll(ctx) {
  const heldHistory = createSnapshotStore(null)
  const views = new Set()
  const hasChat = sessionId => Array.from(views).some(view => view.sessionId === sessionId)
  const release = () => heldHistory.set(null)
  let attached
  let restore

  function sync() {
    const entry = ctx.slots.entries(slot).find(item => item.options.id === 'chat')
    if (entry === attached) return
    restore?.()
    restore = undefined
    attached = entry
    if (!entry?.component) return

    const NativeChat = entry.component
    function ChatWithHistoryGuard(props) {
      const { sessionId, useSession, loadOlder, consumeOlder } = props
      const isHeld = () => heldHistory.getSnapshot()?.sessionId === sessionId
      const held = useSyncExternalStore(heldHistory.subscribe, isHeld)
      useLayoutEffect(() => {
        const view = { sessionId }
        views.add(view)
        return () => {
          views.delete(view)
          if (isHeld() && !hasChat(sessionId)) release()
        }
      }, [sessionId])

      // 页首的自动检查只会从 idle 启动。暂缓时沿用原生待消费阶段，
      // 让按钮保持可点。回调读取实时状态，以覆盖 React 尚未提交的事件间隔。
      const paging = useMemo(() => ({
        useSession: (select, ...options) => useSession(state => select(
          held && state.historyLoadStatus === 'idle' ? { ...state, historyLoadStatus: 'pendingConsumption' } : state,
        ), ...options),
        loadOlder: () => { if (!isHeld()) loadOlder() },
        consumeOlder: () => !isHeld() && consumeOlder(),
      }), [sessionId, useSession, loadOlder, consumeOlder, held])
      return <NativeChat {...props} {...paging} />
    }

    entry.component = ChatWithHistoryGuard
    restore = () => { if (entry.component === ChatWithHistoryGuard) entry.component = NativeChat }
  }

  ctx.effect(() => {
    const events = new AbortController()
    const options = { capture: true, signal: events.signal }
    const stop = ctx.slots.subscribe(slot, sync)
    sync()
    window.addEventListener('click', event => {
      const current = heldHistory.getSnapshot()
      const button = event.target instanceof Element && event.target.closest('button')
      if (current && button && current.edge.contains(button)) release()
    }, options)
    window.addEventListener('scroll', event => {
      const current = heldHistory.getSnapshot()
      if (!current || event.target !== current.scroller) return
      const { scroller, edge } = current
      const distance = scroller.getBoundingClientRect().top - edge.getBoundingClientRect().bottom
      if (distance > scroller.clientHeight * 2) release()
    }, { ...options, passive: true })
    return () => { stop(); events.abort(); release(); restore?.() }
  }, 'gestures: native chat paging')

  function scrollConversation(scroller, direction) {
    if (direction > 0) {
      release()
      const label = ctx.locale.bind('chat')('chat.toBottom')
      const backToBottom = Array.from(scroller.querySelectorAll('button[aria-label]'))
        .find(button => button.getAttribute('aria-label') === label)
      if (backToBottom) backToBottom.click()
      else scroller.scrollTop = scroller.scrollHeight
      return
    }
    const edge = scroller.querySelector('[data-chat-history]:has(button:enabled)')
    if (edge) {
      const sessionId = scroller.closest('[data-conversation-session]')?.dataset.conversationSession
      // 没有接上原生分页入口时，靠近页首会由 DSH 自己触发请求。
      if (!hasChat(sessionId)) return
      heldHistory.set({ sessionId, scroller, edge })
    }
    scroller.scrollTop = 0
  }

  return scrollConversation
}
