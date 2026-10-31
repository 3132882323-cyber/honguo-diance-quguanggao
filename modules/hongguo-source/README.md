# HongguoSource 原生模块

该 Expo 本地模块由 Kotlin/Swift 桥接到随项目提供的 Go 源码。没有从 npm、Maven 或 GitHub Releases 下载红果协议 `.so` / `.aar` / `.xcframework`。`third_party/openhongguo` 保留完整上游代码，原生构建产物由本模块脚本生成。

JavaScript 导出为 `hongguoBridge`；应用侧使用 `src/providers/hongguo.ts` 的 `createHongguoProvider()`。模块提供发现、搜索、详情、联想、播放准备，以及释放播放内存的 `cancelPlayback()`；匿名设备档案持久化在不参与系统备份的应用目录。每个 SDK 请求尝试一次，不自动重置或轮换设备。

## 来源

- Go SDK：[beilunyang/openhongguo](https://github.com/beilunyang/openhongguo/tree/b587ef33068e91f47e1543f3c8be564fad454143)，提交 `b587ef33068e91f47e1543f3c8be564fad454143`，Apache-2.0。
- MP4 解析及标准 CENC 样本处理：[Eyevinn/mp4ff](https://github.com/Eyevinn/mp4ff/tree/702346275b141f91c229e5a759822d70d883d55c)，提交 `702346275b141f91c229e5a759822d70d883d55c`，MIT，完整源码与原许可证位于 `third_party/mp4ff`。
- Kotlin/Swift 桥接结构改写自 OpenHongguo 的 `bindings/react-native`。本模块更名为 HongguoSource，改用本项目自己的 Go 入口，加入取消、内存媒体服务和超时；不向 JavaScript 暴露密钥或设备重置接口。
- 上游 README 另含学习研究、非商业用途的免责声明，原文保留在 `third_party/openhongguo/README.md`。代码许可证不授予剧集和图片的内容权利。

## 从源码构建

需要 Node、Go 1.26+（不自动下载 Go 工具链）。脚本固定 x/mobile 为 `v0.0.0-20261011034528-197770444867`，在模块 build/tools 中从源码构建 gomobile/gobind。脚本先运行离线合同测试，再编译库。

Android 还需要 JDK 17+、Android SDK 和 NDK（建议固定 `27.2.12479018`），设置 `ANDROID_HOME`、`ANDROID_NDK_HOME`、`JAVA_HOME`。

```sh
node modules/hongguo-source/scripts/build.mjs android
# 然后按主项目说明执行 Expo Android 构建
```

输出 `android/libs/core.jar`、`android/src/main/jniLibs/`。绑定的 Android API 最低为 24。Gradle 在库缺失时会说明需要运行哪个命令。

iOS 需要 macOS、Xcode 和 CocoaPods。在安装 Pods 之前生成 framework：

```sh
node modules/hongguo-source/scripts/build.mjs ios
# 然后执行主项目的 iOS prebuild / pod install / Xcode 构建
```

输出 `ios/HongguoCore.xcframework`，包含设备和模拟器，绑定最低 iOS 15.1；主应用最低版本可更高。最终签名/真机安装需要 Apple 开发配置。

Expo 本地模块通过 `expo-module.config.json` 自动链接。应用的 plugins 还需包含 `./modules/hongguo-source/app.plugin.js`：它开启 iOS 本地网络媒体访问，并为 Android 配置仅 `localhost` / `127.0.0.1` 可使用明文 HTTP。远程媒体准备只接受 HTTPS。Expo Go 和普通网页没有此 Go 模块，会返回明确的 UNAVAILABLE 信息。

## 播放边界

本模块直接调用 Go `sdk.ResolvePlayback`。未加密完整媒体交给 expo-video；受保护的标准 CENC MP4 则使用上游公开源码 `sdk.ContentKey` 在 Go 内存中取得当前播放模型的密钥，再由本地 MP4 处理代码还原样本和容器。没有提取官方 APK、导入账号凭据、使用远程解密服务，也不把密钥或原始保护材料返回 JavaScript。

已实现的容器路径包括普通 MP4 的 `senc` 样本记录（8/16 字节 IV、整样本和子样本加密），以及标准 CENC 分片 MP4。普通 MP4 通过等长 free box 替换保护元数据，保持原始样本偏移。分片处理复用 mp4ff。未知布局、分离音视频 DASH、HLS 加密、样本组密钥轮换、外置辅助加密记录等未验证情况返回明确的 UNSUPPORTED / PROTECTED。

为让两端使用同一份完整源码，目前先在内存中准备一集，再通过绑定 `127.0.0.1` 随机端口的临时媒体服务器交给播放器。每个地址使用随机令牌；只支持 GET/HEAD，支持 Range 定位，不写媒体磁盘缓存。媒体输入/输出分别限制在 64 MiB；解析、编码和播放器自身会有额外峰值内存，不能将此限制理解为总进程内存上限。关闭播放会取消准备请求并释放当前缓存。新的选集会取消旧准备请求，旧结果无法覆盖新一集。

远程准备请求禁止账号凭据、IP 字面量、非 HTTPS、私有/本机 DNS 目标、跨主机跳转和超过三次跳转；无 Content-Length 时同样应用字节上限。服务端认证、限流等错误原样分类，媒体地址和密钥不进入日志。

上游 2026-10-31 的[维护者记录](https://github.com/beilunyang/openhongguo/issues/2#issuecomment-6539863101)说明匿名播放模型可能每个设备只有一次成功机会，精确规则未知。本模块保留服务端错误，尊重限流/认证状态。上游 live contract 含设备重置和解密测试，与本模块的测试不同，不能将其成功直接当成本应用播放通过。

离线测试使用上游 `media.invalid` 合成 fixtures 和本项目程序生成的 CENC 容器。测试检查样本字节还原、样本偏移、本机 Range/HEAD、取消、旧结果、令牌隔离和下载边界，没有读取红果剧集。该路径已经通过本地 Go 合同测试；Android/iOS 的编译、安装与真实播放器运行结果仍需以对应 CI 和设备记录为准，不能宣称红果连续播放已经验证通过。
