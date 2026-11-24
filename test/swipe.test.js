import assert from 'node:assert/strict'
import { test } from 'node:test'
import { matchesSwipe, selectGestures } from '../src/swipe.js'

const closed = { leftOpen: false, rightOpen: false, leftAvailable: true, rightAvailable: true }

test('正文可按方向展开两侧，边缘和栏内只操作对应侧栏', () => {
  assert.deepEqual(selectGestures(undefined, 200, 390, closed).map(gesture => gesture.key), ['openLeft', 'openRight'])
  assert.equal(selectGestures(undefined, 46, 390, closed)[0]?.key, 'openLeft')
  assert.equal(selectGestures(undefined, 344, 390, closed)[0]?.key, 'openRight')
  assert.equal(selectGestures('left', 210, 1400, { ...closed, leftOpen: true })[0]?.key, 'closeLeft')
  assert.equal(selectGestures('right', 1100, 1400, { ...closed, rightOpen: true })[0]?.key, 'closeRight')
})

test('正文中的同向动作按起点选边，一条手势只作用于一栏', () => {
  const leftOpen = { ...closed, leftOpen: true }
  assert.deepEqual(selectGestures(undefined, 500, 1400, leftOpen).map(gesture => gesture.key), ['closeLeft'])
  assert.deepEqual(selectGestures(undefined, 1000, 1400, leftOpen).map(gesture => gesture.key), ['openRight'])
  const bothOpen = { ...leftOpen, rightOpen: true }
  assert.deepEqual(selectGestures(undefined, 720, 1400, bothOpen).map(gesture => gesture.key), ['closeLeft', 'closeRight'])
  assert.equal(selectGestures(undefined, 1000, 1400, { ...leftOpen, rightAvailable: false })[0]?.key, 'closeLeft')
})

test('窄屏覆盖层只接受当前栏的收起手势', () => {
  const left = { ...closed, leftOpen: true, overlay: 'left' }
  const right = { ...closed, rightOpen: true, overlay: 'right' }
  assert.equal(selectGestures('mask', 344, 390, left)[0]?.key, 'closeLeft')
  assert.deepEqual(selectGestures(undefined, 344, 390, left), [])
  assert.equal(selectGestures('right', 46, 390, right)[0]?.key, 'closeRight')
  assert.deepEqual(selectGestures(undefined, 46, 390, right), [])
})

test('右键拖动按横向距离和方向判定', () => {
  const [gesture] = selectGestures(undefined, 344, 390, closed)
  assert.equal(matchesSwipe(gesture, -64, 0, 'mouse'), true)
  assert.equal(matchesSwipe(gesture, -64, 43, 'mouse'), false)
  assert.equal(matchesSwipe(gesture, -63, 0, 'mouse'), false)
  assert.equal(matchesSwipe(gesture, 64, 0, 'mouse'), false)
  assert.equal(matchesSwipe(gesture, 0, 0, 'mouse'), false)
})

test('触屏快速滑动可触发，但轻扫和反向滑动忽略', () => {
  const [gesture] = selectGestures(undefined, 46, 390, closed)
  assert.equal(matchesSwipe(gesture, 60, 12, 'touch'), true)
  assert.equal(matchesSwipe(gesture, 20, 12, 'touch'), false)
  assert.equal(matchesSwipe(gesture, -80, 4, 'touch'), false)
})
