import { useSyncExternalStore } from 'react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import { installInput } from './input.js'

const namespace = 'dsh-gestures'
const storageKey = 'dsh.gestures.v1'
const defaultPreferences = { openLeft: true, closeLeft: true, openRight: true, closeRight: true, wide: false }

const dictionaries = {
  zh: {
    title: '侧栏手势',
    openLeft: '展开左侧导航栏',
    closeLeft: '收起左侧导航栏',
    openRight: '展开右侧工具栏',
    closeRight: '收起右侧工具栏',
    wide: '在宽屏启用',
    directions: '从正文或靠近侧栏的一侧横滑可展开。在栏内反向滑可收起。',
    wideHelp: '宽屏支持触屏滑动和鼠标右键拖动。右键拖动时显示轨迹，DSH 菜单优先。',
  },
  en: {
    title: 'Sidebar gestures',
    openLeft: 'Open left sidebar',
    closeLeft: 'Close left sidebar',
    openRight: 'Open right toolbar',
    closeRight: 'Close right toolbar',
    wide: 'Enable on wide screens',
    directions: 'Swipe in the content area or near a sidebar edge to open it. Swipe in the opposite direction inside it to close.',
    wideHelp: 'Wide screens support touch swipes and show a trail during right-button mouse drags. DSH context menus take priority.',
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

function GestureSettings({ preferences, change, t }) {
  const values = useSyncExternalStore(preferences.subscribe, preferences.getSnapshot)
  return <div role="group" aria-label={t('title')}>
    <p>{t('directions')}</p>
    {Object.keys(defaultPreferences).map(key => <p key={key}>
      <label>
        <Switch label={t(key)} checked={values[key]} describedBy={key === 'wide' ? 'dsh-gestures-wide-help' : undefined}
          onChange={checked => change(key, checked)} />
        {' '}{t(key)}
      </label>
    </p>)}
    <p id="dsh-gestures-wide-help">{t('wideHelp')}</p>
  </div>
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
  ctx.effect(() => installInput(ctx, preferences), 'gestures: input')

  const name = 'plugins.bundle.config'
  ctx.slots.inject(name, () => ctx.slots.register({
    name, key: namespace, locale: namespace,
    inject: () => ({ preferences, change }),
  }, GestureSettings))
}
