import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { installConversationScroll } from './conversation-scroll.jsx'
import { installInput } from './input.js'
import { GestureSettings } from './settings.jsx'

const namespace = 'dsh-gestures'
const storageKey = 'dsh.gestures.v1'
const defaultPreferences = { openLeft: true, closeLeft: true, openRight: true, closeRight: true, scrollTop: true, scrollBottom: true, wide: false }

const dictionaries = {
  zh: {
    title: '手势设置',
    openLeft: '展开左侧导航栏',
    closeLeft: '收起左侧导航栏',
    openRight: '展开右侧工具栏',
    closeRight: '收起右侧工具栏',
    scrollTop: '滚到会话顶部',
    scrollBottom: '滚到会话底部',
    wide: '在宽屏启用',
    directions: '手机双指同向上滑到顶、下滑到底。单指横滑控制侧栏。',
    wideHelp: '按住右键横拖控制侧栏，上拖到顶，下拖到底。',
    saveFailed: '无法保存手势设置。',
  },
  en: {
    title: 'Gesture settings',
    openLeft: 'Open left sidebar',
    closeLeft: 'Close left sidebar',
    openRight: 'Open right toolbar',
    closeRight: 'Close right toolbar',
    scrollTop: 'Scroll to conversation top',
    scrollBottom: 'Scroll to conversation bottom',
    wide: 'Enable on wide screens',
    directions: 'On phones, swipe up or down with two fingers to jump to the top or bottom. Swipe horizontally with one finger for the sidebars.',
    wideHelp: 'Hold the right mouse button and drag sideways for the sidebars, up for the top, or down for the bottom.',
    saveFailed: 'The gesture preference could not be saved.',
  },
}

function readPreferences() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey))
    return Object.fromEntries(Object.entries(defaultPreferences).map(([key, fallback]) =>
      [key, typeof saved?.[key] === 'boolean' ? saved[key] : fallback],
    ))
  } catch {
    return defaultPreferences
  }
}

export const inject = ['layout', 'slots', 'locale']

export function apply(ctx) {
  const preferences = createSnapshotStore(readPreferences())
  ctx.effect(() => ctx.locale.register(namespace, dictionaries), 'gestures: locale')

  function change(key, value) {
    const next = { ...preferences.getSnapshot(), [key]: value }
    preferences.set(next)
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next))
    } catch {
      // 浏览器限制存储时，新设置仍在当前页面立即生效。
    }
  }

  ctx.effect(() => {
    function synchronize(event) {
      if (event.key === storageKey || event.key === null) preferences.set(readPreferences())
    }
    window.addEventListener('storage', synchronize)
    return () => window.removeEventListener('storage', synchronize)
  }, 'gestures: preferences')
  const scrollConversation = installConversationScroll(ctx)
  ctx.effect(() => installInput(ctx, preferences, scrollConversation), 'gestures: input')

  const name = 'plugins.bundle.config'
  const settingsSlot = 'settings.general.item'
  const rowSource = {
    subscribe: listener => ctx.slots.subscribe(settingsSlot, listener),
    getSnapshot: () => ctx.slots.entries(settingsSlot).find(row => row.options.id === 'developer-tools')?.component,
  }
  ctx.slots.inject(name, () => ctx.slots.register({
    name, key: namespace, locale: namespace,
    inject: () => ({ preferences, change, rowSource }),
  }, GestureSettings))
}
