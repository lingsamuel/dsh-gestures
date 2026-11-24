import assert from 'node:assert/strict'
import { test } from 'node:test'
import { matchesSwipe, matchTwoFingerSwipe, selectGestures, scrollGestures, fingersSpreading } from '../src/swipe.js'

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

test('宽屏鼠标在栏内也能执行另一侧的有效方向', () => {
  const bothOpen = { ...closed, leftOpen: true, rightOpen: true }
  assert.deepEqual(selectGestures('left', 180, 1400, bothOpen, 'mouse').map(gesture => gesture.key), ['closeLeft', 'closeRight'])
  assert.deepEqual(selectGestures('left', 180, 1400, { ...bothOpen, rightOpen: false }, 'mouse').map(gesture => gesture.key), ['closeLeft'])
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

test('宽屏右键上拖到顶，下拖到底，横拖不算滚动手势', () => {
  const [top, bottom] = scrollGestures
  assert.equal(matchesSwipe(top, 9, -75, 'mouse'), true)
  assert.equal(matchesSwipe(top, 0, 80, 'mouse'), false)
  assert.equal(matchesSwipe(bottom, 8, 70, 'mouse'), true)
  assert.equal(matchesSwipe(bottom, 80, 65, 'mouse'), false)
})

test('两个触点均需同方向移动足够距离，缩放不进入定位手势', () => {
  const start = [{ clientX: 120, clientY: 250 }, { clientX: 190, clientY: 260 }]
  const points = (first, second, shift = 0) => [
    { clientX: 120 - shift, clientY: 250 + first }, { clientX: 190 + shift, clientY: 260 + second },
  ]
  assert.equal(matchTwoFingerSwipe(scrollGestures, start, points(-88, -84))?.key, 'scrollTop')
  assert.equal(matchTwoFingerSwipe(scrollGestures, start, points(81, 84))?.key, 'scrollBottom')
  assert.equal(matchTwoFingerSwipe(scrollGestures, start, points(80, 30)), undefined)
  assert.equal(matchTwoFingerSwipe(scrollGestures, start, points(80, -80)), undefined)
  assert.equal(fingersSpreading(start, points(-85, -84, 25)), true)
  assert.equal(matchTwoFingerSwipe(scrollGestures, start, points(-85, -84, 25)), undefined)
})
