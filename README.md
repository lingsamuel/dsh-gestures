# DSH Gestures

DeepSeek Harness Web 插件，提供侧栏横滑、会话到顶和到底手势，支持触屏与可选的宽屏右键拖动。

已在 DeepSeek Harness `0.2.3-alpha.2` 验证。

[安装与使用指南](manual/安装指南.md)

## 开发

- `npm ci` 安装开发依赖。
- `npm test` 运行手势判定测试。
- `npm run package:plugin` 构建并在 `artifacts/` 生成安装包。
- `DSH_GESTURES_CHROMIUM=/path/to/chromium npm run test:web` 在隔离的 DSH Web 实例验证安装包。可用 `DSH_GESTURES_DSH_BIN` 指定 DSH 可执行文件。

## 构建与发布

每次 push 都会运行测试并上传 nightly 安装包。推送与包版本一致的 tag（如 `v0.1.0`）会用同一个安装包发布 GitHub Release 和 npm 版本。

npm 首次发布使用仓库 secret `NPM_TOKEN`。已有 npm 包可为 `build.yml` 配置 [npm 可信发布](https://docs.npmjs.com/trusted-publishers/)，并启用 `npm publish` 权限。
