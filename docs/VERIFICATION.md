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
| Go 核心测试 | 原生模块开发流程在本地 Go 1.27.3 下报告 9/9 通过；仍需在 Android/iOS CI 中实际编译链接。 |
| Android APK、iOS `.app`、未签名设备 `.ipa` | 未在本机生成：缺少 Go、JDK、Android SDK/NDK；Windows 也没有 Xcode。CI 工作流尚未在 GitHub 运行。 |

本表区分静态检查、JS 导出与真正的原生构建。CI 构建脚本已经配置，但在获取到实际运行结果前，不能把 APK 或 iOS `.app` 标记为已验证。
