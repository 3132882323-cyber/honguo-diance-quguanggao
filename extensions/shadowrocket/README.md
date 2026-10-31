# 红果去广告 · 小火箭模块

如果你的 iPhone 已经安装小火箭（Shadowrocket），可以添加这个模块，拦截红果短剧、红果漫剧中的部分广告。

它不能清除所有广告，也不能代替观看激励广告、领取奖励或解锁剧集。

## 三步安装

1. **添加模块**：复制下面的订阅地址，打开小火箭 →「配置」→「模块」→「＋」，粘贴地址，下载并启用。
2. **开启连接**：回到小火箭首页，将全局路由选为「配置」，再打开连接。部分广告还需要开启证书解密，方法见下方。
3. **重新打开红果**：从 iPhone 后台彻底关闭红果短剧或红果漫剧，再打开，看看广告是否减少。

订阅地址：

```text
https://raw.githubusercontent.com/3132882323-cyber/honguo-diance-quguanggao/main/extensions/shadowrocket/hongguo-shadowrocket.sgmodule
```

[打开模块文件](https://raw.githubusercontent.com/3132882323-cyber/honguo-diance-quguanggao/main/extensions/shadowrocket/hongguo-shadowrocket.sgmodule)

如果不方便用订阅地址，也可以打开[可复制文本](hongguo-shadowrocket-copy.txt)，全选复制，在小火箭中新建本地模块并粘贴。远程下载框里要填网址，不能填电脑上的文件路径。

## 关于证书

有些广告需要小火箭开启「HTTPS 解密」后才能拦截。请在你自己的小火箭里生成证书，按提示安装，再到 iPhone「设置 → 通用 → 关于本机 → 证书信任设置」中开启完全信任。已有可用的小火箭证书可以沿用。

本模块没有附带证书或私钥，不需要导入别人提供的证书。详细菜单步骤见[原使用说明](hongguo-shadowrocket-%E4%BD%BF%E7%94%A8%E8%AF%B4%E6%98%8E.txt)。

## 使用前请了解

- **不能保证去掉全部广告。** 即使证书已安装，部分广告仍可能出现。
- **不能代替看广告解锁。** 如果某一集要求观看激励广告，这个模块不能替你完成观看或领取奖励。
- **出现播放或网络异常，先关闭模块试试。** 不建议同时开启多份同类红果拦截规则。
- **尚未在真实 iPhone 上完成安装和播放测试。** 目前只检查过文件内容、规则格式和测试网址的匹配情况。

更新时可在小火箭中刷新模块；是否自动刷新取决于你的小火箭设置。本仓库维护自己的版本，不会自动同步原作者后续的每次修改。

<details>
<summary>来源与开发信息</summary>

### 来源、转换与许可

原规则：[bluee1111/egern-hongguo-adblock](https://github.com/bluee1111/egern-hongguo-adblock)。2026-10-31 重新核对时，最新提交仍为 [`54412489b99934abf4652ee7729cb3e1bdaf3528`](https://github.com/bluee1111/egern-hongguo-adblock/commit/54412489b99934abf4652ee7729cb3e1bdaf3528)，提交时间 2026-10-09 11:09:01 UTC；[源 YAML](https://github.com/bluee1111/egern-hongguo-adblock/blob/54412489b99934abf4652ee7729cb3e1bdaf3528/hongguo-adblock.yaml) 及 [实际 MIT LICENSE](https://github.com/bluee1111/egern-hongguo-adblock/blob/54412489b99934abf4652ee7729cb3e1bdaf3528/LICENSE) 已核对。

复用原来的 14 条域名规则、3 条 URL 重写、5 个 MITM 主机。六条域名正则近似转换为十条 `* / ?` 通配规则，得到 18 条域名拦截；数字字符限制无法逐字保留，匹配范围略宽。没有加入 `reading-video` 正片拦截、外部脚本或额外主机。来源固定记录及三个文件的 SHA-256 见 [PROVENANCE.json](PROVENANCE.json)。

本目录按 MIT 许可分发，保留 Copyright (c) 2026 bluee1111 及全部许可正文。Shadowrocket 格式转换、说明与仓库包装为派生整理，修改范围不改变上游 MIT 条款；播放器其他目录的 Apache-2.0 不替代此许可。

静态检查覆盖文件一致性、规则结构、正则及拦截/放行样本。尚未在真实 iPhone / Shadowrocket 导入和实播验收。

模块与可复制文本内容一致；此前转换的三个原文件保持不变。相关文件：

- [模块文件](hongguo-shadowrocket.sgmodule)
- [可复制文本](hongguo-shadowrocket-copy.txt)
- [原使用说明](hongguo-shadowrocket-%E4%BD%BF%E7%94%A8%E8%AF%B4%E6%98%8E.txt)
- [MIT 许可证](LICENSE)
- [来源和文件校验记录](PROVENANCE.json)

</details>

