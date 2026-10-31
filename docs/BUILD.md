# 从源码构建

安装后显示名称为「红果-店策-去广告」，仓库名和 Expo slug 为 `honguo-diance-quguanggao`。本工程使用 Expo SDK 58、React Native 0.88、一个位于 `modules/hongguo-source` 的本地 Expo 原生模块，以及随源码提供的 Go 核心。原生模块不能在 Expo Go 中运行；请构建本工程自己的应用。

## 工具与依赖

- 所有平台：Node.js 24、pnpm 11.25.0、Go 1.26.0 或更新版本。CI 固定使用 Go 1.27.3。
- Android：JDK 17、Android SDK Platform 37.0 预览包、Build-Tools 37.0.0、Android NDK 27.2.12479018；设置 `ANDROID_HOME` 和 `ANDROID_NDK_HOME`。Android 17 仍处于预览阶段，命令行安装需使用 `sdkmanager --channel=3` 和包名 `platforms;android-37.0`。
- iOS：macOS、Xcode 26.4 或兼容更新版本、CocoaPods。Windows 无法编译 iOS 应用。

在项目根目录先执行：

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm typecheck
pnpm test
pnpm export:all
```

`export:all` 只编译 JavaScript 和资源，不会生成原生安装包。`pnpm run doctor` 可检查 Expo 依赖；该工具还需要系统上的 `npm` 命令。源码中的本地原生模块使用 Expo Autolinking 的默认 `modules/` 目录。

## Android APK

```sh
pnpm native:prepare:android
pnpm exec expo prebuild --platform android --no-install
cd android
./gradlew :app:assembleRelease --no-daemon
```

Windows PowerShell 中最后一行使用 `.\gradlew.bat :app:assembleRelease --no-daemon`。生成的 `android/app/build/outputs/apk/release/app-release.apk` 包含 JS bundle，可独立安装。Expo 当前生成的 Gradle 模板用调试密钥给 release 变体签名，因此这里的 APK 是**预览包**，不应上传应用商店。正式发行需用自己的密钥配置签名和发行流程。

`native:prepare:android` 从随附 Go 源码构建 `core.jar` 与各 ABI 的 `libgojni.so`，并运行 Go 测试。该步骤必须在 Gradle 编译前完成。第一次执行会下载锁定版本的 Go 模块；构建脚本要求 NDK 路径显式设置。

## iOS 模拟器应用

在 macOS 上执行：

```sh
pnpm native:prepare:ios
pnpm exec expo prebuild --platform ios --no-install
cd ios
pod install
xcodebuild -workspace <生成的工作区>.xcworkspace -scheme <生成的 Scheme> \
  -configuration Release -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO build
```

`native:prepare:ios` 先从 Go 源码生成 `HongguoCore.xcframework`，`pod install` 随后才能引用它。输出的模拟器 `.app` 只能在 iOS 模拟器运行。CI 还会尝试用 `iphoneos` SDK 编译未签名的真机 `.app`，并包装为 `Payload/*.app` 结构的 `.ipa`，供源码构建检查；这个 `.ipa` **不能直接安装到 iPhone，也不能上架**。真机安装和分发需要 Apple 签名身份与相应配置；本工程没有内置他人的凭据。

## CI 和源码包

[GitHub Actions 工作流](../.github/workflows/build.yml) 只能手动触发，分别执行源码检查、Android 预览 APK、未签名 iOS 模拟器应用和未签名 iOS 真机应用编译。它不会提交到应用商店，也不依赖 Expo EAS 帐号。工作流先编译 Go 核心，再生成并编译原生工程。Actions 固定到核查过的提交 SHA。

在本地从项目根目录运行 `pnpm package:source`，会在项目同级目录生成 `honguo-diance-quguanggao-source.tar.gz`。归档包括应用、锁文件、构建脚本、本地模块和第三方源码；排除依赖安装目录、生成的二进制、`.env` 文件。可以把其他绝对路径作为参数传给脚本。

## 参考

- [Expo SDK 58 版本与平台要求](https://docs.expo.dev/versions/v58.0.0/)
- [Expo 本地构建说明](https://docs.expo.dev/guides/local-app-development/)
- [Expo 本地模块自动链接](https://docs.expo.dev/modules/autolinking/)
- [GitHub 托管运行器](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
