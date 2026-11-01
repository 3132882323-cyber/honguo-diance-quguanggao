# 验证记录

更新日期：2026-11-01。原始构建与浏览器检查于 2026-10-31 执行。运行环境为 Windows，Node.js 24.22.1、pnpm 11.25.0。

| 检查 | 当前结果 |
| --- | --- |
| `pnpm install --ignore-scripts` | 已成功安装 Expo 58.0.21、React Native 0.88.1、React 19.3.0；锁文件已生成。 |
| `pnpm exec expo config --type public --json` | 成功；显示名称「红果-店策-去广告」、slug `honguo-diance-quguanggao`、iOS/Android/Web 平台及 SDK 58 配置可解析。 |
| `pnpm exec expo prebuild --platform android --no-install` | 本机成功生成 Android 工程；检查到准确的中文 `app_name`、release 变体的调试签名配置，以及本地网络安全插件。本机未运行 Gradle；CI 原生编译见下。 |
| Expo Doctor | 首次发现缺少 `expo-font` 和不应直接安装的 `expo-modules-core`，均已修正。本机原本没有 `npm` 命令；用临时 npm 运行 `pnpm dlx --package npm@11 --package expo-doctor@1.21.5 expo-doctor` 后，20/20 检查通过。 |
| `pnpm test` | 31 项数据层、提供方和 Shadowrocket 扩展测试通过。 |
| `pnpm export:all` | Web、iOS、Android JS bundle 均成功导出；将 Metro worker 限制为 1，避免此 Windows 环境先前的内存错误。 |
| `pnpm typecheck` | 当前应用与测试代码检查通过。 |
| `actionlint@v1.7.12 .github/workflows/build.yml` | 工作流静态检查通过。 |
| Go 核心测试 | 原生模块开发流程在本地 Go 1.27.3 下报告 9/9 通过；随后 CI 在 Android 和 iOS 构建中从源码生成并链接核心。 |
| [最终 CI run 41189214643](https://github.com/3132882323-cyber/honguo-diance-quguanggao/actions/runs/41189214643) | 最终中文品牌提交 `7782e29654939eb12ae002deef6f97432c14553e` 的 `verify`、Android、iOS 作业全部通过。四个 GitHub 工件 ZIP 的大小分别为：源码 5,581,361 字节、Android 44,612,414 字节、iOS 模拟器 24,847,900 字节、未签名 iOS 真机 12,312,485 字节；这些是下载外层 ZIP 的大小。IPA 不能直接安装到 iPhone。 |
| 下载产物检查 | 四个下载 ZIP 的 SHA-256 均匹配 GitHub 工件摘要。解包后的 APK 为 108,756,384 字节，包含 DEX 与四种 ABI 的 Go 核心；两种 iOS 应用的主程序均包含 Go 1.27.3 标记。直接读取 APK 资源及两种 iOS Info.plist，确认显示名称均为「红果-店策-去广告」。iPhone 包为未签名产物，没有内嵌分发配置。未安装或运行这些原生包。 |
| 浏览器预览 | 主开发流程通过 Expo serve 运行生产 Web bundle：最终中文品牌在 375×812 手机视口显示正常；样片播放约 13 秒，1.5 倍速可用，收藏刷新后保留；`readyToPlay` 修复后记录约 13 秒进度。搜索 Sintel 返回 1 项，示例 JSON 导入成功，浅色/深色外观可切。375×812 和横屏 812×375 视口均未见水平溢出。Seek 曾因网络失败，未完成验收。 |
| 真机与在线红果 | 尚未在 Android/iOS 真机验证，也未完成在线红果服务端到端验收。浏览器样片结果不代表这些场景。 |

最终 CI 产物来自包含中文显示名称、首页标题和用户文案的提交 `7782e29`。构建成功说明原生工程可编译，不等同于真机播放或在线红果服务已通过验收。
