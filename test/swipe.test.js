import assert from 'node:assert/strict'
import { test } from 'node:test'
import { edgeAt, matchesSwipe, selectGesture } from '../src/swipe.js'

test('两侧手势从屏幕稍内侧展开，面板内部反向收起', () => {
  const closed = { leftOpen: false, rightOpen: false }
  assert.equal(edgeAt(8, 390), undefined)
  assert.equal(edgeAt(46, 390), 'left')
  assert.equal(edgeAt(344, 390), 'right')
  assert.equal(edgeAt(200, 390), undefined)
  assert.equal(selectGesture(undefined, 'left', closed)?.key, 'openLeft')
  assert.equal(selectGesture(undefined, 'right', closed)?.key, 'openRight')
  assert.equal(selectGesture('left', undefined, { ...closed, leftOpen: true })?.key, 'closeLeft')
  assert.equal(selectGesture('right', undefined, { ...closed, rightOpen: true })?.key, 'closeRight')
})

test('窄屏覆盖层只接受当前栏的收起手势', () => {
  const left = { leftOpen: true, rightOpen: false, overlay: 'left' }
  const right = { leftOpen: false, rightOpen: true, overlay: 'right' }
  assert.equal(selectGesture('mask', 'right', left)?.key, 'closeLeft')
  assert.equal(selectGesture(undefined, 'right', left), undefined)
  assert.equal(selectGesture('right', 'left', right)?.key, 'closeRight')
  assert.equal(selectGesture(undefined, 'left', right), undefined)
})

test('右键拖动按横向距离和方向判定', () => {
  const gesture = selectGesture(undefined, 'right', { leftOpen: false, rightOpen: false })
  assert.equal(matchesSwipe(gesture, -64, 0, 'mouse'), true)
  assert.equal(matchesSwipe(gesture, -64, 43, 'mouse'), false)
  assert.equal(matchesSwipe(gesture, -63, 0, 'mouse'), false)
  assert.equal(matchesSwipe(gesture, 64, 0, 'mouse'), false)
  assert.equal(matchesSwipe(gesture, 0, 0, 'mouse'), false)
})

test('触屏快速滑动可触发，但轻扫和反向滑动忽略', () => {
  const gesture = selectGesture(undefined, 'left', { leftOpen: false, rightOpen: false })
  assert.equal(matchesSwipe(gesture, 60, 12, 'touch'), true)
  assert.equal(matchesSwipe(gesture, 20, 12, 'touch'), false)
  assert.equal(matchesSwipe(gesture, -80, 4, 'touch'), false)
})
