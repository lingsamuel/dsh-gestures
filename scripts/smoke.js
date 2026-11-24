import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { setTimeout } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { chromium } from 'playwright-core'
import pkg from '../package.json' with { type: 'json' }

const root = fileURLToPath(new URL('..', import.meta.url))
const browserPath = process.env.DSH_GESTURES_CHROMIUM
if (!browserPath) throw new Error('请用 DSH_GESTURES_CHROMIUM 指定 Chromium 可执行文件。')
const dsh = process.env.DSH_GESTURES_DSH_BIN ?? 'dsh'
const archive = join(root, 'artifacts', `${pkg.name}-${pkg.version}.tgz`)
const runtime = join(root, '.runtime')
await mkdir(runtime, { recursive: true })
const home = await mkdtemp(join(runtime, 'web-'))
const env = { ...process.env, DSH_HOME: home, TMPDIR: home, DEEPSEEK_API_KEY: 'gestures-smoke', DEEPSEEK_BASE_URL: 'http://127.0.0.1:1' }
const command = promisify(execFile)
const plugin = (action, spec) => command(dsh, ['plugin', '--profile', 'web', action, spec, '--store-dir', join(home, 'pnpm-store')], {
  cwd: root, env, timeout: 30_000,
})

async function seedWorkspace() {
  const id = randomUUID()
  const path = join(home, 'Gesture Workspace')
  const now = new Date().toISOString()
  await mkdir(path)
  await mkdir(join(home, 'storages'))
  await writeFile(join(home, 'storages', 'workspace.json'), JSON.stringify({
    unit: { name: 'workspace', version: 2 },
    global: { initialized: true, workspaceIds: [id], archivedSessionIds: [], pinnedSessionIds: [], defaultWorkspaceId: id },
    tables: { workspaces: { [id]: { path, title: 'Gesture Workspace', sessionIds: [], createdAt: now, updatedAt: now } } },
  }))
}

function waitForWeb(child) {
  const lines = createInterface({ input: child.stdout })
  const timer = new AbortController()
  return Promise.race([
    new Promise((resolve, reject) => {
      lines.on('line', line => {
        if (line.startsWith('dsh web: ')) resolve(line.slice('dsh web: '.length))
      })
      child.once('error', reject)
      child.once('exit', code => reject(new Error(`DSH 在启动前退出（${code}）`)))
    }),
    setTimeout(20_000, undefined, { signal: timer.signal }).then(() => { throw new Error('DSH Web 启动超时') }),
  ]).finally(() => { timer.abort(); lines.close() })
}

let child
let exited
let browser
try {
  await seedWorkspace()
  child = spawn(dsh, ['web', '--no-open', '--port', '0'], { cwd: root, env, stdio: ['ignore', 'pipe', 'inherit'] })
  exited = once(child, 'close')
  const url = await waitForWeb(child)
  const origin = new URL(url).origin
  await plugin('add', archive)
  process.env.TMPDIR = home
  browser = await chromium.launch({ executablePath: browserPath })
  const page = await browser.newPage({ viewport: { width: 390, height: 760 }, hasTouch: true, locale: 'en-US', reducedMotion: 'reduce' })
  page.setDefaultTimeout(8_000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort())
  await page.goto(url)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('dialog', { name: 'Preview Notice' }).waitFor({ state: 'hidden' })
  const touch = await page.context().newCDPSession(page)
  const frame = page.locator('[data-shell-bottom]').locator('..')
  const rightOpen = page.locator('[data-sidebar-right-open]:visible')
  const nativeOpener = page.locator('[data-sidebar-opener]:visible')
  const nativeLeftToggle = page.locator('[data-sidebar-toggle]:visible')
  const openRight = page.locator('[data-sidebar-right-expand]:visible')

  async function tapSwipe(x, y, dx, dy = 0) {
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
    for (let step = 1; step <= 5; step++) {
      await touch.send('Input.dispatchTouchEvent', {
        type: 'touchMove', touchPoints: [{ x: x + dx * step / 5, y: y + dy * step / 5 }],
      })
    }
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }

  async function rightDrag(x, y, dx, hold = false) {
    await page.mouse.move(x, y)
    await page.mouse.down({ button: 'right' })
    if (hold) await setTimeout(165)
    await page.mouse.move(x + dx, y)
    await page.mouse.up({ button: 'right' })
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  }

  function browserMenuAllowed(x, y, button = 2) {
    return frame.evaluate((element, { x, y, button }) => element.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true, cancelable: true, button, clientX: x, clientY: y,
    })), { x, y, button })
  }

  async function leftIs(open) {
    await page.waitForFunction(expected => {
      const frame = document.querySelector('[data-shell-bottom]')?.parentElement
      return frame && !frame.hasAttribute('data-sidebar-collapsed') === expected
    }, open)
  }

  async function showPluginSettings() {
    if (await frame.getAttribute('data-sidebar-collapsed') !== null) {
      const opener = await nativeOpener.isVisible() ? nativeOpener : nativeLeftToggle
      await opener.click()
    }
    await page.getByRole('button', { name: 'Plugins', exact: true }).click()
    await page.locator(`[data-plugin-package="${pkg.name}"] button`).first().click()
    await page.getByRole('group', { name: 'Sidebar gestures' }).waitFor()
  }

  await nativeOpener.waitFor()
  assert.equal(await frame.getAttribute('data-sidebar-drawer'), 'true')
  await tapSwipe(170, 355, 110)
  await leftIs(true)
  await tapSwipe(225, 450, -130)
  await leftIs(false)
  await tapSwipe(44, 355, 105)
  await leftIs(true)
  await tapSwipe(347, 365, -120)
  await leftIs(false)

  // 浏览器可能取消 Pointer Events，但仍继续交付同一根手指的 Touch Events。
  await page.evaluate(() => {
    const target = document.elementFromPoint(170, 355)
    function dispatch(type, clientX, cancelable = true) {
      const point = new Touch({ identifier: 17, target, clientX, clientY: 355 })
      target.dispatchEvent(new TouchEvent(type, {
        bubbles: true, cancelable, touches: type === 'touchend' ? [] : [point], changedTouches: [point],
      }))
    }
    dispatch('touchstart', 170)
    target.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerType: 'touch' }))
    dispatch('touchmove', 285, false)
    dispatch('touchend', 285)
  })
  await leftIs(true)
  await nativeLeftToggle.click()
  await leftIs(false)

  await nativeOpener.click()
  const workspace = page.getByText('Gesture Workspace', { exact: true }).first()
  await workspace.click()
  if (await frame.getAttribute('data-sidebar-collapsed') === null) await nativeLeftToggle.click()
  await openRight.waitFor()
  await tapSwipe(200, 365, -115)
  await rightOpen.waitFor()
  const tab = rightOpen.locator('[data-dockkit-tab]:visible').first()
  const tabId = await tab.getAttribute('data-dockkit-tab')
  await tapSwipe(155, 500, 131)
  await rightOpen.waitFor({ state: 'hidden' })
  await tapSwipe(347, 365, -115)
  await rightOpen.waitFor()
  assert.equal(await tab.getAttribute('data-dockkit-tab'), tabId, '收起右侧栏应保留标签')
  await tapSwipe(155, 500, 131)
  await rightOpen.waitFor({ state: 'hidden' })

  await page.evaluate(() => {
    const scroll = document.createElement('div')
    scroll.id = 'gesture-smoke-scroll'
    scroll.style.cssText = 'position: fixed; left: 25px; top: 200px; width: 120px; height: 95px; overflow: auto; z-index: 99'
    const body = document.createElement('div')
    body.style.cssText = 'width: 320px; height: 350px'
    scroll.append(body)
    document.querySelector('[data-slot="main"]').append(scroll)
    scroll.scrollLeft = 100
  })
  await tapSwipe(44, 225, 85)
  await page.waitForFunction(() => document.querySelector('#gesture-smoke-scroll').scrollLeft < 100)
  await leftIs(false)
  await page.locator('#gesture-smoke-scroll').evaluate(node => { node.style.overflowX = 'hidden' })
  await tapSwipe(45, 266, 6, -110)
  await page.waitForFunction(() => document.querySelector('#gesture-smoke-scroll').scrollTop > 0)
  await leftIs(false)
  await page.locator('#gesture-smoke-scroll').evaluate(node => node.remove())

  const editor = await page.locator('[data-slot="main"] [contenteditable="true"]:visible').first().boundingBox()
  assert.ok(editor && editor.x < 62)
  await tapSwipe(Math.max(35, editor.x + 2), editor.y + editor.height / 2, 100)
  await leftIs(false)

  await tapSwipe(45, 355, 24)
  await leftIs(false)
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 44, y: 350, id: 0 }] })
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 44, y: 350, id: 0 }, { x: 100, y: 370, id: 1 }] })
  await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 160, y: 350, id: 0 }, { x: 220, y: 370, id: 1 }] })
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await leftIs(false)

  await page.evaluate(() => {
    window.gestureModalMoves = []
    window.observeGestureModalMove = event => window.gestureModalMoves.push(event.defaultPrevented)
    window.addEventListener('touchmove', window.observeGestureModalMove, { passive: true })
  })
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 44, y: 355 }] })
  await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 74, y: 355 }] })
  await page.evaluate(() => {
    const dialog = document.createElement('div')
    dialog.id = 'gesture-smoke-modal'
    dialog.setAttribute('role', 'dialog')
    dialog.setAttribute('aria-modal', 'true')
    dialog.textContent = 'Modal fixture'
    document.body.append(dialog)
  })
  await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 150, y: 355 }] })
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  assert.deepEqual(await page.evaluate(() => {
    document.querySelector('#gesture-smoke-modal').remove()
    window.removeEventListener('touchmove', window.observeGestureModalMove)
    return window.gestureModalMoves
  }), [true, false], '滑动途中出现模态界面，应立即还给浏览器后续移动事件')
  await leftIs(false)

  await showPluginSettings()
  const wide = page.getByRole('switch', { name: 'Enable on wide screens' })
  const openLeft = page.getByRole('switch', { name: 'Open left sidebar' })
  assert.equal(await wide.getAttribute('aria-checked'), 'false')
  await openLeft.click()
  await tapSwipe(45, 355, 105)
  await leftIs(false)
  await page.reload()
  await showPluginSettings()
  assert.equal(await openLeft.getAttribute('aria-checked'), 'false')
  await openLeft.click()

  await page.setViewportSize({ width: 1400, height: 860 })
  await page.waitForFunction(() => !document.querySelector('[data-shell-bottom]').parentElement.hasAttribute('data-sidebar-drawer'))
  if (await frame.getAttribute('data-sidebar-collapsed') === null) await nativeLeftToggle.click()
  await leftIs(false)
  await rightDrag(45, 574, 120)
  await leftIs(false)
  await wide.click()
  await rightDrag(43, 574, 0, true)
  await leftIs(false)
  await rightDrag(43, 574, 12)
  await leftIs(false)
  const trail = page.locator('[data-dsh-gestures-trail]')
  await rightDrag(500, 574, 40)
  assert.equal(await browserMenuAllowed(540, 574), false, '已经进入手势的短拖也应拦截松开后到达的浏览器菜单')
  await leftIs(false)
  await page.mouse.move(500, 574)
  await page.mouse.down({ button: 'right' })
  assert.equal(await trail.count(), 0)
  await page.mouse.move(540, 578)
  await trail.waitFor()
  assert.ok(await trail.evaluate(canvas => {
    const scale = canvas.width / innerWidth
    return getComputedStyle(canvas).pointerEvents === 'none'
      && canvas.getContext('2d').getImageData(Math.round(520 * scale), Math.round(576 * scale), 1, 1).data[3] > 0
  }), '轨迹应绘制真实鼠标位移，且不拦截点击')
  await page.mouse.move(620, 574)
  await page.mouse.up({ button: 'right' })
  await trail.waitFor({ state: 'detached' })
  await leftIs(true)
  assert.equal(await browserMenuAllowed(620, 574), false, '侧栏已切换后仍应拦截同一次拖动的浏览器菜单')
  assert.equal(await browserMenuAllowed(620, 574, 0), true, '键盘菜单应保留默认行为')
  assert.equal(await frame.evaluate(element => {
    const editor = document.createElement('textarea')
    element.append(editor)
    const mouse = { bubbles: true, cancelable: true, button: 2 }
    editor.dispatchEvent(new MouseEvent('mousedown', { ...mouse, buttons: 2 }))
    editor.dispatchEvent(new MouseEvent('mouseup', mouse))
    const allowed = editor.dispatchEvent(new MouseEvent('contextmenu', mouse))
    editor.remove()
    return allowed
  }), true, '下一次右键点击应重新判断菜单归属')
  await page.mouse.move(430, 574)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(540, 574)
  await trail.waitFor()
  await page.mouse.up({ button: 'right' })
  await trail.waitFor({ state: 'detached' })
  await leftIs(true)
  assert.equal(await browserMenuAllowed(540, 574), false, '无可执行动作的拖动也应吞掉同次浏览器菜单')

  const closeLeft = page.getByRole('switch', { name: 'Close left sidebar' })
  await closeLeft.click()
  await page.mouse.move(430, 574)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(320, 574)
  await trail.waitFor()
  await page.mouse.up({ button: 'right' })
  await trail.waitFor({ state: 'detached' })
  await leftIs(true)
  await closeLeft.click()
  // 在 Linux Chromium 的真实按下顺序之外，覆盖松开后才分发菜单事件的平台顺序。
  const handledLateMenu = await page.evaluate(async () => {
    const target = document.elementFromPoint(205, 574)
    const start = { bubbles: true, cancelable: true, button: 2, clientX: 205, clientY: 574 }
    target.dispatchEvent(new MouseEvent('mousedown', { ...start, buttons: 2 }))
    target.dispatchEvent(new MouseEvent('mouseup', { ...start, clientX: 85 }))
    let handled = false
    target.addEventListener('contextmenu', event => {
      handled = true
      event.preventDefault()
      event.stopPropagation()
    }, { once: true })
    target.dispatchEvent(new MouseEvent('contextmenu', { ...start, clientX: 85 }))
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    return handled
  })
  assert.equal(handledLateMenu, true)
  await leftIs(true)
  await rightDrag(430, 574, -120)
  await leftIs(false)
  await page.mouse.move(500, 574)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(610, 574)
  await trail.waitFor()
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await trail.waitFor({ state: 'detached' })
  await page.mouse.up({ button: 'right' })
  await leftIs(false)
  await tapSwipe(43, 574, 110)
  await leftIs(true)
  await tapSwipe(205, 574, -120)
  await leftIs(false)

  // 插件管理页是全局面板，右侧手势不能为它创建会话或工具栏。
  await rightDrag(1355, 574, -120)
  assert.equal(await rightOpen.count(), 0)
  await nativeLeftToggle.click()
  await page.getByRole('button', { name: 'New session', exact: true }).filter({ hasText: 'New Session' }).click()
  await openRight.waitFor()
  await rightDrag(1355, 574, -120)
  await rightOpen.waitFor()
  await page.getByRole('button', { name: /Workspace files/ }).click()
  const filesTab = rightOpen.locator('[data-dockkit-tab]').filter({ hasText: /files/i }).first()
  await filesTab.waitFor()
  const tabBox = await filesTab.boundingBox()
  assert.ok(tabBox)
  await tapSwipe(tabBox.x + tabBox.width / 2, tabBox.y + tabBox.height / 2, 80)
  await rightOpen.waitFor()
  await page.mouse.move(tabBox.x + tabBox.width / 2, tabBox.y + tabBox.height / 2)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(tabBox.x + tabBox.width / 2 + 95, tabBox.y + tabBox.height / 2)
  assert.equal(await trail.count(), 0, 'DSH 菜单接管后不应绘制轨迹')
  await page.mouse.up({ button: 'right' })
  await rightOpen.waitFor()
  await page.locator('[data-context-menu]:visible').waitFor()
  await page.keyboard.press('Escape')
  await page.locator('[data-context-menu]:visible').waitFor({ state: 'hidden' })
  const sidebarChrome = await nativeLeftToggle.evaluate(button => {
    const rect = button.closest('[data-window-drag]').getBoundingClientRect()
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
  })
  await rightDrag(sidebarChrome.x, sidebarChrome.y, 95)
  await rightOpen.waitFor({ state: 'hidden' })
  await leftIs(true)

  const divider = frame.locator('[data-side="sidebar"]:visible')
  const startingDivider = await divider.boundingBox()
  assert.ok(startingDivider)
  const y = startingDivider.y + startingDivider.height / 2
  await page.mouse.move(startingDivider.x + startingDivider.width / 2, y)
  await page.mouse.down({ button: 'left' })
  await page.mouse.move(startingDivider.x + startingDivider.width / 2 + 32, y)
  await page.mouse.up({ button: 'left' })
  const resizedDivider = await divider.boundingBox()
  assert.ok(resizedDivider && resizedDivider.x > startingDivider.x + 20, '左键仍应调整侧栏宽度')
  const dividerX = resizedDivider.x + resizedDivider.width / 2
  await page.mouse.move(dividerX, y)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(dividerX - 90, y)
  await trail.waitFor()
  await page.mouse.up({ button: 'right' })
  await leftIs(false)

  await showPluginSettings()
  await plugin('remove', pkg.name)
  await wide.waitFor({ state: 'detached' })
  if (await frame.getAttribute('data-sidebar-collapsed') === null) await nativeLeftToggle.click()
  await rightDrag(45, 574, 120)
  await leftIs(false)
  assert.equal(child.exitCode, null)
  assert.deepEqual(errors, [])
  console.log('DSH Web 验收通过。已验证触屏手势与事件取消、宽屏右键轨迹、菜单优先、设置及热卸载。')
} finally {
  await browser?.close()
  if (child && child.exitCode === null) {
    child.kill()
    child.stdout.destroy()
    await exited
  }
  await rm(home, { recursive: true, force: true })
}
