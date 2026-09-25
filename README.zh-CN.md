# Safari 版 Netflix 双官方字幕

[English](README.md) | 简体中文 | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md)

这是一个小型 Safari 网页扩展源码文件夹，可将第二条 Netflix 官方字幕以叠加层形式显示。

它不会机器翻译字幕，也不会加载社区字幕文件。扩展会监听 Netflix 发送给浏览器的字幕清单，让你从 Netflix 提供的字幕轨道中选择一条，获取该文字字幕轨道，并将其与当前视频播放时间同步。

## 功能

- 在 `www.netflix.com` 上叠加显示第二条字幕
- 仅支持 Netflix 官方字幕轨道
- 可在扩展弹出窗口中设置语言、字号、位置、透明度，以及启用或停用扩展
- 解析 TTML/DFXP 和 WebVTT 文字字幕

## 限制

- Netflix 经常更改播放器的内部实现，因此 Netflix 更新后可能需要调整本扩展。
- 扩展可以检测到图片格式的字幕轨道，但可能无法显示；此版本主要支持文字字幕轨道。
- 如果 Netflix 没有为当前影片和地区提供某种语言，本扩展也无法显示该语言的字幕。
- Safari 不能像 Chrome 那样直接加载未打包的扩展文件夹；你需要使用 Xcode 将其打包。

## 为 Safari 打包

安装完整的 Xcode 应用，然后运行：

```sh
xcrun safari-web-extension-converter \
  /path/to/safari-netflix-dual-subs \
  --macos-only \
  --copy-resources \
  --app-name "Netflix Dual Official Subs" \
  --bundle-identifier "local.netflix-dual-official-subs"
```

如果命令提示找不到 `safari-web-extension-converter`，请先安装或打开一次完整的 Xcode 应用，然后在普通的“终端”窗口中重新运行该命令。

打开生成的 Xcode 项目。对 macOS 应用目标和扩展目标，分别打开 `Signing & Capabilities`，然后选择以下一种方式：

- 如果只在本机免费使用，将 `Signing Certificate` 设为 `Sign to Run Locally`，并将 `Team` 保持为 `None`。
- 如果希望日常使用更省事，请使用有效的 Apple 开发者身份为两个目标签名。已签名的构建无需启用 Safari 的未签名扩展开关。

选择 macOS 应用方案，并执行一次 `Product > Run`。容器应用会向 Safari 注册扩展，因此不再需要通过 `Add Temporary Extension` 选择未打包的文件夹。然后在 Safari 中：

1. 启用 `Safari > Settings > Advanced > Show features for web developers`。
2. 如果使用 `Sign to Run Locally`，启用 `Safari > Settings > Developer > Allow unsigned extensions`。
3. 打开 `Safari > Settings > Extensions`。
4. 启用 `Netflix Dual Official Subs`。
5. 允许访问 `netflix.com` 网站。

Safari 退出时会重置 `Allow unsigned extensions`。由 Xcode 打包的扩展仍会保持注册，但未签名的构建在 Safari 重新启动后需要再次启用该开关。如果希望构建完成后无需反复设置，请使用有效的签名身份；如果要分发给其他人，请通过 App Store 分发，或使用 Developer ID 签名并经过公证的 macOS 应用。

## 使用方法

最可靠的本地开发流程如下：

1. 从 Xcode 运行一次生成的应用，以便 Safari 发现并注册扩展。
2. 在 Safari 中启用 `Develop > Allow Unsigned Extensions`。
3. 如果扩展没有出现在 Safari 设置中，请使用 `Develop > Add Temporary Extension`，并选择此源码文件夹：

```text
/path/to/safari-netflix-dual-subs
```

4. 在 Safari 中打开一部 Netflix 影片。
5. 开始播放，并在 Netflix 中选择你平常使用的主字幕。
6. 打开扩展的弹出窗口。
7. 选择第二条字幕轨道。

弹出窗口现在会在 Netflix 提供字幕轨道时等待并更新。如果播放开始数秒后仍未出现轨道，可以尝试刷新 Netflix 标签页；这也有助于诊断问题。

从浏览页面打开影片时，扩展会缓存最近发现的字幕清单，并复用与新 `/watch/` 影片 ID 匹配的清单。这是因为 Netflix 可能在更新页面 URL 之前就已解析播放器清单。

如果已检测到轨道却无法加载，Netflix 使用的字幕 CDN 主机名可能未列在 `manifest.json` 中。打开 Safari 的网页检查器，查看失败的字幕请求所使用的主机名，并将该主机名添加到 `host_permissions`。

Safari 会在 24 小时后或退出时移除临时扩展。如果使用 Xcode 项目，源码更改后需要重新构建；由于上述转换命令使用了 `--copy-resources`，如果想将新的源码快照复制到全新项目中，还需要重新运行转换命令。

## 隐私

扩展在你的浏览器本地运行，没有后端，也不会将字幕文本发送给任何第三方服务。
