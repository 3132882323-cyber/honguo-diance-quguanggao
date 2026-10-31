# 验证记录

记录日期：2026-10-31。运行环境为 Windows，Node.js 24.22.1、pnpm 11.25.0。

| 检查 | 当前结果 |
| --- | --- |
| `pnpm install --ignore-scripts` | 已成功安装 Expo 58.0.21、React Native 0.88.1、React 19.3.0；锁文件已生成。 |
| `pnpm exec expo config --type public --json` | 成功；应用名、slug、iOS/Android/Web 平台及 SDK 58 配置可解析。 |
| `pnpm exec expo prebuild --platform android --no-install` | 成功生成 Android 工程；检查到 release 变体使用调试签名配置，并应用了本地网络安全插件。未运行 Gradle。 |
| Expo Doctor | 首次发现缺少 `expo-font` 和不应直接安装的 `expo-modules-core`，均已修正。本机原本没有 `npm` 命令；用临时 npm 运行 `pnpm dlx --package npm@11 --package expo-doctor@1.21.5 expo-doctor` 后，20/20 检查通过。 |
| `pnpm test` | 31 项数据层、提供方和 Shadowrocket 扩展测试通过。 |
| `pnpm export:all` | Web、iOS、Android JS bundle 均成功导出；将 Metro worker 限制为 1，避免此 Windows 环境先前的内存错误。 |
| `pnpm typecheck` | 当前应用与测试代码检查通过。 |
| `actionlint@v1.7.12 .github/workflows/build.yml` | 工作流静态检查通过。 |
| Go 核心测试 | 原生模块开发流程在本地 Go 1.27.3 下报告 9/9 通过；随后 CI 在 Android 和 iOS 构建中从源码生成并链接核心。 |
| [CI run 41187592053](https://github.com/3132882323-cyber/honguo-diance-quguanggao/actions/runs/41187592053) | 提交 `9902e80` 的 `verify`、Android、iOS 作业全部通过；构建并上传源码包、Android 预览 APK（44,612,101 字节）、iOS 模拟器应用 ZIP（24,849,022 字节）及未签名 iOS 真机 IPA（12,312,021 字节）。IPA 仅供构建检查，不能直接安装到 iPhone。 |
| 浏览器预览 | 主开发流程通过 Expo serve 运行生产 Web bundle：样片播放约 13 秒，1.5 倍速可用，收藏刷新后保留；`readyToPlay` 修复后记录约 13 秒进度。搜索 Sintel 返回 1 项，示例 JSON 导入成功，浅色/深色外观可切。375×812 和横屏 812×375 视口均未见水平溢出。Seek 曾因网络失败，未完成验收。 |
| 真机与在线红果 | 尚未在 Android/iOS 真机验证，也未完成在线红果服务端到端验收。浏览器样片结果不代表这些场景。 |

CI 产物来自提交 `9902e80`；之后的首页标题和文案调整，以及本次系统显示名称调整，仍需在最新提交重新构建才能反映到安装包中。构建成功说明原生工程可编译，不等同于真机播放或在线红果服务已通过验收。
