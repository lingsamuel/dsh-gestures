# DSH Gestures

DeepSeek Harness Web 插件，提供侧栏横滑、会话到顶和到底手势，支持触屏与可选的宽屏右键拖动。

[安装和使用手册](manual/使用手册.md)

## 开发

- `npm ci` 安装开发依赖。
- `npm test` 运行手势判定测试。
- `npm run package:plugin` 构建并在 `artifacts/` 生成安装包。
- `DSH_GESTURES_CHROMIUM=/path/to/chromium npm run test:web` 在隔离的 DSH Web 实例验证安装包。可用 `DSH_GESTURES_DSH_BIN` 指定 DSH 可执行文件。
