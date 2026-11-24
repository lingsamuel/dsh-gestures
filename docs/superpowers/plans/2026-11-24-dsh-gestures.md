# DSH Gestures 实现计划

**目标**：在 DSH Web 中以触屏滑动和可选的宽屏右键手势控制原生左右侧栏。

**设计**：从原生框架和工具栏读取当前状态。输入监听器只调用状态匹配的原生开关。插件详情页通过原生配置插槽显示五个开关，浏览器存储保存偏好。

**工具**：Node.js、esbuild、DSH Web、Playwright Chromium。

- [x] 为手势起点、方向、横纵距离、按压时长和窄屏覆盖层编写 `test/swipe.test.js`，先运行 `node --test` 确认功能缺失，再实现 `src/swipe.js`。
- [x] 在 `src/panels.js` 接入 DSH 原生面板状态与开关，在 `src/input.js` 处理触屏和右键的生命周期、取消与菜单优先级。
- [x] 在 `src/client.jsx` 注册 `plugins.bundle.config`，使用原生 Switch。通过 DSH Cordis bundle patch 和浏览器 module loader 交付。
- [x] 在隔离 profile 安装 `.tgz` 后，以浏览器核对触屏、鼠标、原生菜单、设置和热卸载。用 `npm test`、`npm run package:plugin` 和 `npm run test:web` 验证。
- [x] 同步用户手册、实现和验证脚本。
