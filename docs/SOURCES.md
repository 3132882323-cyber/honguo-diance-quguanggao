# 来源、许可与已知边界

## 已同仓公开的小火箭扩展

此前转换好的三个文件已逐字节保存在 [extensions/shadowrocket](../extensions/shadowrocket/README.md)：模块、可复制文本和原使用说明。它们来自 [bluee1111/egern-hongguo-adblock 的固定提交 54412489b99934abf4652ee7729cb3e1bdaf3528](https://github.com/bluee1111/egern-hongguo-adblock/commit/54412489b99934abf4652ee7729cb3e1bdaf3528)，2026-10-31 再核对仍为最新版本。上游实际 [MIT LICENSE](https://github.com/bluee1111/egern-hongguo-adblock/blob/54412489b99934abf4652ee7729cb3e1bdaf3528/LICENSE) 全文、原作者 Copyright (c) 2026 bluee1111 和转换说明均保留。

这是明确复用的规则派生文件，独立于原创播放器代码。原 14 条域名规则转为 18 条，其中六条正则近似成十条主机通配规则；三条 URL 重写和五个 MITM 主机保持来源范围。数字限制转通配后匹配略宽；没有附加外部脚本、凭据、CA 或私钥，也没有新增正片 reading-video 拦截。文件 SHA-256、源 blob SHA 和提交时间见扩展内 [PROVENANCE.json](../extensions/shadowrocket/PROVENANCE.json)。

扩展下的 README 给出仓库发布后的 raw-main 订阅地址及本地导入步骤。5 个静态测试已通过；未声称真实 iPhone/Shadowrocket 导入、全部去广告或激励广告解锁已经通过验证。

## 播放器来源选型

本项目采用原创 Expo / React Native 双端客户端。以下公开项目用于对照功能和源码可复用性；数据存储、校验、本地目录 provider 与开放影片示例均为本项目独立实现，没有复制下表仓库的业务源码。客户端许可不授予红果内容、品牌或账号接口的使用权；实际接入模块的来源声明应按其对应文件保留。

核对日期：2026-10-31。先使用 GitHub 连接器搜索 `hongguo`，再读取 12 个仓库的完整文件树、当前提交、实际许可证及代表源码。没有下载/运行相关应用或媒体二进制；本表不是其构建或真实片源可用性验收。

| 项目与固定提交 | 日期（UTC） | 核对的实际许可/来源状态 | 可借鉴内容与限制 |
| --- | --- | --- | --- |
| [zhoufuweigg/guoapp · 0e60928514](https://github.com/zhoufuweigg/guoapp/commit/0e60928514c31a96ade9b31866948f15da5ca2a6) | 2026-09-26 | NO_PROJECT_LICENSE_FOUND | 仅参考功能；在项目及原作者授权清楚前不复制业务源码。不是当前可直接 fork 的全开源双端底座。 |
| [enginJie/guoapp · 93c8ec22c3](https://github.com/enginJie/guoapp/commit/93c8ec22c37db65460122387598dddac58efaef9) | 2026-09-22 | NO_PROJECT_LICENSE_FOUND | 仅参考功能。未确认项目授权，不直接复制或合并。 |
| [never88gone/THLRedGuo · f1a8e1b4ea](https://github.com/never88gone/THLRedGuo/commit/f1a8e1b4eadc86d38ba0b7b10e346413458c8df4) | 2026-10-31 | NO_PROJECT_LICENSE_FOUND | 功能参考价值高；未补足授权前不复制代码；官方 APK 输入依赖不符合零黑盒依赖的直接底座要求。 |
| [Erlmo/shortplay · 02bcfa922e](https://github.com/Erlmo/shortplay/commit/02bcfa922ea4a0e347e7e9ec462cf8c6701b7faa) | 2026-10-29 | NO_PROJECT_LICENSE_FOUND + PROPRIETARY_NATIVE_CORES | 拒作全开源底座；仅从公开描述提取产品需求，不纳入二进制核心。 |
| [N3urda/hongguoTV · eea73e6a45](https://github.com/N3urda/hongguoTV/commit/eea73e6a45569a2cbbb9440f7cd5290c459b0b70) | 2026-09-23 | [GPL-3.0-only](https://github.com/N3urda/hongguoTV/blob/eea73e6a45569a2cbbb9440f7cd5290c459b0b70/LICENSE) | 当前最明确的 Android 开源核心参考；可在 GPL 兼容项目中移植具体模块，不能作为已完成双端底座。 |
| [KEJIYUNB/hongguo · c34317fd14](https://github.com/KEJIYUNB/hongguo/commit/c34317fd147dccab46ec5fe4db3b08126c0da3af) | 2026-08-12 | [GPL-3.0](https://github.com/KEJIYUNB/hongguo/blob/c34317fd147dccab46ec5fe4db3b08126c0da3af/LICENSE) | 可参考沉浸/手势/默认画质产品行为；不能充当双端客户端或复用其账号权益 hook。 |
| [bluee1111/egern-hongguo-adblock · 54412489b9](https://github.com/bluee1111/egern-hongguo-adblock/commit/54412489b99934abf4652ee7729cb3e1bdaf3528) | 2026-10-09 | [MIT](https://github.com/bluee1111/egern-hongguo-adblock/blob/54412489b99934abf4652ee7729cb3e1bdaf3528/LICENSE) | MIT 规则可在保留版权许可时复用；本项目优先不引入广告 SDK，规则仅作已知广告主机参考。 |
| [yangbin1322/hongguo-player · 619c7f2acc](https://github.com/yangbin1322/hongguo-player/commit/619c7f2acc922d3b5e06802b4ebefe9769dbb6e7) | 2026-10-28 | NO_SOURCE_CODE + NO_LICENSE | 仅公开产品行为参考；不纳入代码/二进制依赖。 |
| [zfdang/hongguo-open-player · de2e0f9706](https://github.com/zfdang/hongguo-open-player/commit/de2e0f9706d95cf321d61d790ea15ba7351dae8b) | 2026-10-30 | [CONFLICT: LICENSE=AGPL-3.0; package/README=GPL-3.0-only](https://github.com/zfdang/hongguo-open-player/blob/de2e0f9706d95cf321d61d790ea15ba7351dae8b/LICENSE) | 先澄清 GPL/AGPL 冲突，再考虑选定模块；不作为手机双端底座。 |
| [aston314/hongguo-tv · 6d369678fa](https://github.com/aston314/hongguo-tv/commit/6d369678fa155cc8f2809f49f7c69a647874edc0) | 2026-10-31 | NO_PROJECT_LICENSE_FOUND | 公开文档可参考范围和行为；项目整体授权未明确前不复制核心。 |
| [zhangbaio/hongguo · 5f8a58d10f](https://github.com/zhangbaio/hongguo/commit/5f8a58d10f48954bc9b6a58c9cd6418bf499feb9) | 2026-07-14 | NO_PROJECT_LICENSE_FOUND | 仅研究方向和功能范围参考；不纳入 App 代码或捕获资产。 |
| [jackotom/hongguo-drama · 5ec431455c](https://github.com/jackotom/hongguo-drama/commit/5ec431455c5bd6155b52194518948e1f66df98c3) | 2026-10-31 | [GPL-3.0 (file-level GPL-3.0-only sources)](https://github.com/jackotom/hongguo-drama/blob/5ec431455c5bd6155b52194518948e1f66df98c3/LICENSE) | 适合作为后续 GPL 适配层的公开参考/候选模块；不适合整仓当手机底座。当前原创新 Expo 客户端最清晰。 |

## 最关键的源码证据

- 两个 podspec 明确写 Proprietary；FFI 加载预编译签名库。其 README 也明确原生核心源码不公开，不符合本项目完整源码目标。 证据：[Erlmo/shortplay/ios/Frameworks/ShortplayCrypto.podspec](https://github.com/Erlmo/shortplay/blob/02bcfa922ea4a0e347e7e9ec462cf8c6701b7faa/ios/Frameworks/ShortplayCrypto.podspec)、[Erlmo/shortplay/ios/Frameworks/WeeouSign.podspec](https://github.com/Erlmo/shortplay/blob/02bcfa922ea4a0e347e7e9ec462cf8c6701b7faa/ios/Frameworks/WeeouSign.podspec)、[Erlmo/shortplay/lib/services/sign_native.dart](https://github.com/Erlmo/shortplay/blob/02bcfa922ea4a0e347e7e9ec462cf8c6701b7faa/lib/services/sign_native.dart)。
- iOS 源码读取用户导入官方 APK 的 libmetasec_ml.so 中配置；完整树无项目 LICENSE。不能因为 Flutter 页面公开就宣称整体为可直接复用的开源底座。 证据：[never88gone/THLRedGuo/shared/apple/HongguoApkProfile.swift](https://github.com/never88gone/THLRedGuo/blob/f1a8e1b4eadc86d38ba0b7b10e346413458c8df4/shared/apple/HongguoApkProfile.swift)、[never88gone/THLRedGuo/ios/Podfile](https://github.com/never88gone/THLRedGuo/blob/f1a8e1b4eadc86d38ba0b7b10e346413458c8df4/ios/Podfile)。
- Go 业务核心有源码；xcframework 为构建产物载体，不能据此判闭源。直接复用的主要阻碍是缺少项目整体授权，且 README 的 iOS 验收仍未完成。 证据：[zhoufuweigg/guoapp/pubspec.yaml](https://github.com/zhoufuweigg/guoapp/blob/0e60928514c31a96ade9b31866948f15da5ca2a6/pubspec.yaml)、[zhoufuweigg/guoapp/ios/DuanjuCore/DuanjuCore.podspec](https://github.com/zhoufuweigg/guoapp/blob/0e60928514c31a96ade9b31866948f15da5ca2a6/ios/DuanjuCore/DuanjuCore.podspec)、[zhoufuweigg/guoapp/native/go.mod](https://github.com/zhoufuweigg/guoapp/blob/0e60928514c31a96ade9b31866948f15da5ca2a6/native/go.mod)。
- Kotlin 核心为可读 GPL-3.0-only；来源固定到 drpys 提交，并保留许可与修改说明。主要交付 Android TV，移动 iOS 尚未交付。 证据：[N3urda/hongguoTV/kotlin-tv/NOTICE.md](https://github.com/N3urda/hongguoTV/blob/eea73e6a45569a2cbbb9440f7cd5290c459b0b70/kotlin-tv/NOTICE.md)、[N3urda/hongguoTV/kotlin-tv/core/src/main/kotlin/com/hongguotv/core/MediaCrypto.kt](https://github.com/N3urda/hongguoTV/blob/eea73e6a45569a2cbbb9440f7cd5290c459b0b70/kotlin-tv/core/src/main/kotlin/com/hongguotv/core/MediaCrypto.kt)。
- 实际 LICENSE 是 AGPL v3，而 README 徽章及 package.json 写 GPL-3.0-only。复制前须澄清冲突，不按徽章推断。 证据：[zfdang/hongguo-open-player/LICENSE](https://github.com/zfdang/hongguo-open-player/blob/de2e0f9706d95cf321d61d790ea15ba7351dae8b/LICENSE)、[zfdang/hongguo-open-player/package.json](https://github.com/zfdang/hongguo-open-player/blob/de2e0f9706d95cf321d61d790ea15ba7351dae8b/package.json)。
- GPL 桌面项目公开 Node 核心，保留签名及匿名注册的来源提交；Node crypto/fs/zlib 与 FFmpeg 不可直接当作 Expo 移动端模块运行。 证据：[jackotom/hongguo-drama/THIRD-PARTY-NOTICES.md](https://github.com/jackotom/hongguo-drama/blob/5ec431455c5bd6155b52194518948e1f66df98c3/THIRD-PARTY-NOTICES.md)、[jackotom/hongguo-drama/src/native/licenses/NOTICE.txt](https://github.com/jackotom/hongguo-drama/blob/5ec431455c5bd6155b52194518948e1f66df98c3/src/native/licenses/NOTICE.txt)、[jackotom/hongguo-drama/src/native/hongguo-app-search.js](https://github.com/jackotom/hongguo-drama/blob/5ec431455c5bd6155b52194518948e1f66df98c3/src/native/hongguo-app-search.js)。

缺少许可证的判断基于完整递归树（响应 `truncated:false`）；局部第三方 MIT/GPL 文本不会覆盖整个项目。更完整的 SHA、文件 blob SHA、代表文件清单、平台与依赖记录位于工作区 `work/research/source-audit/source-inventory.json`，实际根许可证全文有单独副本。

## 内置开放影片

内置目录名为「开放影片示例」，只包括 Big Buck Bunny、Sintel 预告片，不使用虚构红果条目或红果媒体。

| 媒体 | 版权与许可依据 | HTTPS 播放地址 |
| --- | --- | --- |
| Big Buck Bunny 预告片 | © 2008 Blender Foundation / www.bigbuckbunny.org；[CC BY 3.0，官方说明](https://peach.blender.org/about/) | [W3C 托管预告片](https://media.w3.org/2010/05/bunny/trailer.mp4) |
| Sintel 预告片 | © Blender Foundation / www.sintel.org；[CC BY 3.0，官方说明](https://durian.blender.org/sharing/) | [W3C 托管预告片](https://media.w3.org/2010/05/sintel/trailer.mp4) |

影片署名和许可链接同时保存在 `src/data/sample.ts` 的目录 attribution 及单片简介中；客户端不修改远程媒体。官方说明要求展示整片时保留完整片尾字幕。本项目只链接明确标示的预告片，媒体不被重新打包。两个 HTTPS 地址在核对时均通过 HEAD 请求，返回 200 / video/mp4。另以 `bytes=0-1023` 和 `bytes=1000000-1001023` 进行仅响应头的 Range 检查，两片均返回 206、精确 1024 字节 Content-Length、匹配的 Content-Range 及稳定 ETag。一次浏览器播放验证中有跳转后的瞬时媒体错误，未发现服务端 Range 不一致；实际网络/设备的播放与 seek 仍需验证。原 Blender 的 `BigBuckBunny_320x180.mp4` 路径实际为 ZIP 归档，不可直接替换成播放器 URL。

## 自备目录与备份

自备目录仅接受 HTTPS 媒体和封面，不接受带用户名/密码的 URL、`file:`、`javascript:`、`data:` 或控制字符。`downloadable:true` 是目录作者明确允许本机离线导出的标记，默认关闭；应用不能据此替作者确定媒体版权。

内置示例 `open-film-samples` 为保留 id，用户目录无法覆盖。导入同 id 目录默认替换，API 也提供 keep / reject 策略；同目录重复剧目 id、同剧重复分集 id 会拒绝。备份带 schema/version，校验通过后才提交；备份包含任务资料，不包含视频文件、账号 Cookie 或签名私钥。已完成的下载在可移植备份中降为暂停，并移除设备文件路径。

