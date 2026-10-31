# 第三方来源与许可

本项目的原创代码使用 Apache License 2.0。下列第三方内容保留各自的原始许可、署名和限制；本文件不重新许可第三方代码或媒体。

| 内容 | 固定来源 / 版本 | 许可与使用方式 |
| --- | --- | --- |
| openhongguo | `beilunyang/openhongguo`，提交 `b587ef33068e91f47e1543f3c8be564fad454143` | 完整协议 SDK 源码位于 `third_party/openhongguo`。保留 Apache-2.0 LICENSE、NOTICE、README、UPSTREAM.md。上游 README 另含研究与非商业使用声明；未删除或代作者扩大授权。 |
| mp4ff | `Eyevinn/mp4ff`，提交 `702346275b141f91c229e5a759822d70d883d55c` | MIT。媒体容器与标准加密处理的 Go 源码和原许可位于 `third_party/mp4ff`；具体模块说明及支持边界见 `modules/hongguo-source/README.md`。 |
| Expo / React Native / React | 精确解析版本在 `pnpm-lock.yaml` | MIT。平台 UI、视频、文件系统及 Expo 模块集成；来自公开包注册表与官方源码，不把系统播放器源码算作本项目源码。 |
| React Native Async Storage | 锁文件固定版本 | MIT。只用于本机片单资料持久化。 |
| react-native-safe-area-context | 锁文件固定版本 | MIT。原生安全区域处理。 |
| Ionicons / @expo/vector-icons | 锁文件固定版本 | 图标包保留原许可；界面仅选用 Ionicons 图标，不复制红果官方商标或图形。 |
| TypeScript / tsx | 锁文件固定版本 | TypeScript 为 Apache-2.0，tsx 为 MIT；用于构建与离线测试。 |
| Go mobile / Go tools | 模块 `go.mod` 与 `go.sum` | Go 项目 BSD 风格许可。编译工具从公开源码构建，输出绑定不作为未知来源的预编译核心入库。 |
| Egern 红果去广告规则的 Shadowrocket 转换 | `bluee1111/egern-hongguo-adblock`，提交 `54412489b99934abf4652ee7729cb3e1bdaf3528` | MIT，Copyright (c) 2026 bluee1111。独立模块位于 `extensions/shadowrocket`，保留完整 MIT、原始三文件和转换边界；不改为本项目 Apache-2.0。 |

更多间接 JS / Go 依赖沿用自身许可，依赖版本由锁文件和校验和固定。依赖源代码可从各包声明的官方仓库获得，安装目录不是本项目原创代码。

## 媒体样片

应用中「开放影片示例」不是红果片源，也不是本项目原创视频。应用只保存标题、链接和署名，没有把媒体打包进安装文件。

- **Big Buck Bunny**：© 2008 Blender Foundation / www.bigbuckbunny.org，CC BY 3.0。原作者许可说明：<https://peach.blender.org/about/>。预告片由 W3C 的 `media.w3.org/2010/05/bunny/trailer.mp4` 提供。
- **Sintel**：© Blender Foundation / www.sintel.org，CC BY 3.0。原作者许可说明：<https://durian.blender.org/sharing/>。预告片由 W3C 的 `media.w3.org/2010/05/sintel/trailer.mp4` 提供。
- Creative Commons Attribution 3.0 许可：<https://creativecommons.org/licenses/by/3.0/>。应用未改动原媒体。

## 调查而未复制的项目

无项目级许可证的客户端、只发布二进制的客户端、明确不公开核心源码的项目，以及与本项目许可证不匹配的实现均未被当作“已经整合”。逐项证据和源链接见 [docs/SOURCES.md](docs/SOURCES.md)。
