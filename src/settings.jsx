import { useId, useSyncExternalStore } from 'react'
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives'

export function GestureSettings({ preferences, change, rowSource, t }) {
  const values = useSyncExternalStore(preferences.subscribe, preferences.getSnapshot)
  const NativeRow = useSyncExternalStore(rowSource.subscribe, rowSource.getSnapshot)
  const fieldId = useId()

  return <div role="group" aria-label={t('title')}>
    {Object.entries(values).map(([key, checked]) => {
      const label = t(key)
      const description = key === 'wide' ? t('wideHelp') : key === 'scrollTop' ? t('directions') : ''
      const helpId = `${fieldId}-${key}`
      const setChecked = next => change(key, next)

      if (NativeRow) {
        // 原生行提供布局和样式，读取与写入仍使用当前浏览器的偏好。
        const copy = {
          'developerTools.title': label,
          'developerTools.description': description,
          'developerTools.error': t('saveFailed'),
        }
        return <NativeRow key={key} useDeveloperTools={select => select(checked)}
          setEnabled={async next => setChecked(next)} t={id => copy[id]} />
      }

      return <div key={key}>
        <label>
          {label}{' '}
          <Switch label={label} checked={checked} onChange={setChecked}
            describedBy={description ? helpId : undefined} />
        </label>
        {description && <p id={helpId}>{description}</p>}
      </div>
    })}
  </div>
}
