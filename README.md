# honguo-diance-quguanggao

个人 Android / iOS 短剧客户端。使用 React Native + Expo，原生数据接入由公开 Go 源码构建。应用不集成广告 SDK；收藏、进度、偏好和自备片单保存在本机。

这是 **0.1.0 预览版**，与红果官方无关联。它不是官方 App 的源码公开，也不代表已经合并了互联网上所有相关项目。已调查的 12 个代表项目、准确提交、许可和可复用范围见 [来源审计](docs/SOURCES.md)。

## 已实现

- Android / iOS 共用的发现、搜索、作品详情、分组选集和播放器界面。
- 红果非官方接口的分类浏览、搜索、联想、目录和播放响应适配；保留限流、授权、接口变化和内容不可用等真实错误。
- Go 源码实现的有限标准 CENC MP4 处理与带随机令牌的本机播放服务，支持已实现容器的 Range / HEAD；每集输入／输出各限制为 64 MiB，总进程内存会更高。不支持的容器和服务端拒绝仍返回错误；合成媒体测试不等于真实剧集已验收。
- 本机收藏、每部作品续播进度、观看历史与删除；来源不同的同名标识互不覆盖。
- 原生播放控件、快进后退、倍速、自动下一集、全屏、画中画配置与清屏观看。
- 明确授权的 HTTPS MP4 缓存队列，最多两项同时下载；暂停、会话内继续、删除和本地播放。重新启动后保留任务资料，手动继续会重新取得地址。
- JSON 自备片单导入、分页和搜索，目录导出，以及版本化资料备份／合并恢复。备份不包含视频、设备身份或播放密钥。
- 浅色、深色和跟随系统外观，安全区、可读文本、触控区域和无障碍标签。
- 明确标注为非红果内容的 Blender CC BY 3.0 预告片，用来独立验证播放器与本机功能。

详细完成状态和未实现项见 [功能对照](docs/FEATURES.md)。错误信息不会被替换为虚构剧目或成功状态。

## iPhone 原版 App 的小火箭模块

仓库也收录了你指定的 **红果短剧／红果漫剧 Shadowrocket 去广告模块**，与独立双端客户端分别使用：

- [模块文件](extensions/shadowrocket/hongguo-shadowrocket.sgmodule)
- [完整可复制文本](extensions/shadowrocket/hongguo-shadowrocket-copy.txt)
- [安装、订阅与限制说明](extensions/shadowrocket/README.md)

该模块复用 MIT 许可的 Egern 红果规则并转换为 Shadowrocket 语法，保留原作者署名。完整 HTTPS 重写需要小火箭生成并信任的本机证书；域名拦截不依赖 HTTPS 解密。部分规则在通配符语法中有有限范围扩展，不能保证去除全部广告，也不能伪造看完激励广告的解锁结果。仓库不提供任何证书私钥。

## 在电脑预览

需要 Node.js 22.13+ 和本仓库 `packageManager` 指定的 pnpm：

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm run start:web
```

浏览器打开终端显示的地址。**网页和 Expo Go 不包含红果原生数据模块**；请选择「打开公开样片」，或在设置中导入自己的 JSON 片单。红果接入需要下面的完整设备构建。

## 构建 Android / iOS

原生业务核心的 Go、Kotlin、Swift 和 JS 源码均随仓库提供。没有依赖作者私下分发的 `.so`、`.jar` 或 `.xcframework`；生成的绑定文件不提交到 Git。

```sh
# 安装本机原生工具链后，先从 Go 源码生成对应绑定
node modules/hongguo-source/scripts/build.mjs android
pnpm exec expo prebuild --platform android --non-interactive
pnpm run android

# iOS 需要 macOS、Xcode 和 CocoaPods
node modules/hongguo-source/scripts/build.mjs ios
pnpm exec expo prebuild --platform ios --non-interactive
pnpm run ios
```

准确的工具链版本、GitHub Actions 手动构建、APK 签名与 iOS 签名要求见 [构建说明](docs/BUILD.md)。未签名的 iOS 设备包和模拟器应用都不能直接安装到普通 iPhone；设备分发需要自己的 Apple 签名配置。项目不包含证书或私钥。

## 验证

```sh
pnpm run typecheck
pnpm test
pnpm run export:all
```

数据和接口测试使用合成响应与本地存储；测试不会自动注册大量匿名身份、抓取红果剧集或把上游接口可用性冒充为播放器验收。原生桥接和媒体处理另有 Go 测试，见模块说明。

已执行的检查、失败修复、原生构建及真机验收边界记录在 [验证记录](docs/VERIFICATION.md)。三平台 JS 导出成功不等于 APK／IPA 编译成功，CI 成功也不等于真机长时间播放已验收。

## 自备片单

在「设置 → 片源与目录」中选择 JSON 文件或粘贴：

```json
{
  "version": 1,
  "id": "my-library",
  "name": "我的片单",
  "dramas": [{
    "id": "my-film",
    "title": "我的影片",
    "description": "自己有权播放和分享的内容",
    "tags": ["我的作品"],
    "episodes": [{
      "id": "episode-1",
      "title": "第一集",
      "url": "https://your-media-host.example/episode-1.mp4",
      "mimeType": "video/mp4",
      "downloadable": true
    }]
  }]
}
```

示例域名只是格式说明，导入前必须换成自己的真实地址。`downloadable` 默认为不允许；仅在内容允许下载时设置为 `true`。目录中的执行脚本、文件地址、嵌入账号密码、重复标识和不支持的版本会被拒绝。

## 来源与许可

原创代码按 [Apache-2.0](LICENSE) 发布。

- 数据协议复用 [beilunyang/openhongguo](https://github.com/beilunyang/openhongguo)，固定完整提交，保留上游 LICENSE、NOTICE、README 与来源记录。上游 README 同时包含研究／非商业用途声明，本项目未删除这些文字，也没有代替作者授予额外权利。
- 第三方依赖的原有许可单独保留，见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 和锁文件。
- 开放预告片分别来自 Blender Foundation 的 [Big Buck Bunny](https://peach.blender.org/about/) 与 [Sintel](https://durian.blender.org/sharing/)，通过 W3C 的 HTTPS 地址播放，未冒充红果片源。
- 无许可的现成客户端、明确闭源的原生核心和官方账号凭据没有复制进入本项目。

应用本身不展示广告，不等于能移除所有片源内嵌宣传。服务端授权、地区、频率和内容格式也可能限制播放；不承诺所有剧集可用。
