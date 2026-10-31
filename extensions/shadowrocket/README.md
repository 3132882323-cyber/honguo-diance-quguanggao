# 红果 Shadowrocket 模块

这里保存此前转换得到的三份文件，已按原始字节复制；原文件不被改写。模块与可复制文本内容完全相同。本目录是独立的 iOS Shadowrocket 扩展，不需要安装本仓库的播放器，也不会更改播放器的片源。

- [hongguo-shadowrocket.sgmodule](hongguo-shadowrocket.sgmodule)：可导入的模块。
- [hongguo-shadowrocket-copy.txt](hongguo-shadowrocket-copy.txt)：相同内容，方便手机全选复制。
- [hongguo-shadowrocket-使用说明.txt](hongguo-shadowrocket-%E4%BD%BF%E7%94%A8%E8%AF%B4%E6%98%8E.txt)：原转换时的完整安装与限制说明。

## 远程安装与更新

仓库发布到 `main` 后，可在 Shadowrocket「配置 → 模块 → ＋」中填入下面的 HTTPS 模块地址；该地址是本仓库维护的版本，**不会自动跟随上游 Egern 仓库变化**。是否自动刷新取决于客户端设置。

```text
https://raw.githubusercontent.com/3132882323-cyber/honguo-diance-quguanggao/main/extensions/shadowrocket/hongguo-shadowrocket.sgmodule
```

[打开模块原文](https://raw.githubusercontent.com/3132882323-cyber/honguo-diance-quguanggao/main/extensions/shadowrocket/hongguo-shadowrocket.sgmodule) · [仓库目录](https://github.com/3132882323-cyber/honguo-diance-quguanggao/tree/main/extensions/shadowrocket)

也可使用可复制文本新建本地模块。远程下载框接收网址，不接收电脑文件路径。启用后使用「配置」路由，完全退出红果短剧/红果漫剧，再重新打开测试。

## 证书与兼容性

域名拦截可独立于 HTTPS 解密工作；三条 URL 重写需要启用 HTTPS 解密并信任**你自己在 Shadowrocket 生成的本机 CA**。本目录不包含 CA 证书或私钥。若已有受信任的小火箭证书可沿用；具体安装步骤见原使用说明。

模块以 `%APPEND%` 加入原来的五个 MITM 域名，保留当前配置其他主机。证书固定的接口可能仍无法解密。不能模拟激励广告完成、发奖或服务端解锁，不能保证清除每一种广告。播放/网络异常时先停用本模块作对照；避免重复叠加同类规则。

## 来源、转换与许可

原规则：[bluee1111/egern-hongguo-adblock](https://github.com/bluee1111/egern-hongguo-adblock)。2026-10-31 重新核对时，最新提交仍为 [`54412489b99934abf4652ee7729cb3e1bdaf3528`](https://github.com/bluee1111/egern-hongguo-adblock/commit/54412489b99934abf4652ee7729cb3e1bdaf3528)，提交时间 2026-10-09 11:09:01 UTC；[源 YAML](https://github.com/bluee1111/egern-hongguo-adblock/blob/54412489b99934abf4652ee7729cb3e1bdaf3528/hongguo-adblock.yaml) 及 [实际 MIT LICENSE](https://github.com/bluee1111/egern-hongguo-adblock/blob/54412489b99934abf4652ee7729cb3e1bdaf3528/LICENSE) 已核对。

复用原来的 14 条域名规则、3 条 URL 重写、5 个 MITM 主机。六条域名正则近似转换为十条 `* / ?` 通配规则，得到 18 条域名拦截；数字字符限制无法逐字保留，匹配范围略宽。没有加入 `reading-video` 正片拦截、外部脚本或额外主机。来源固定记录及三个文件的 SHA-256 见 [PROVENANCE.json](PROVENANCE.json)。

本目录按 MIT 许可分发，保留 Copyright (c) 2026 bluee1111 及全部许可正文。Shadowrocket 格式转换、说明与仓库包装为派生整理，修改范围不改变上游 MIT 条款；播放器其他目录的 Apache-2.0 不替代此许可。

静态检查覆盖文件一致性、规则结构、正则及拦截/放行样本。尚未在真实 iPhone / Shadowrocket 导入和实播验收。

