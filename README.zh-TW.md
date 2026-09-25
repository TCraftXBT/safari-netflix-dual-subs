# Safari 版 Netflix 雙官方字幕

[English](README.md) | [简体中文](README.zh-CN.md) | 繁體中文 | [日本語](README.ja.md)

這是一個小型 Safari 網頁擴充功能原始碼資料夾，可將第二條 Netflix 官方字幕以覆蓋層形式顯示。

它不會以機器翻譯字幕，也不會載入社群字幕檔案。擴充功能會監聽 Netflix 傳送到瀏覽器的字幕清單，讓你從 Netflix 提供的字幕軌道中選擇一條、取得該文字字幕軌道，並將其與目前的影片播放時間同步。

## 功能

- 在 `www.netflix.com` 上疊加顯示第二條字幕
- 僅支援 Netflix 官方字幕軌道
- 可在擴充功能彈出視窗中設定語言、字體大小、位置、透明度，以及啟用或停用擴充功能
- 解析 TTML/DFXP 和 WebVTT 文字字幕

## 限制

- Netflix 經常更改播放器的內部實作，因此 Netflix 更新後可能需要調整本擴充功能。
- 擴充功能可偵測圖片格式的字幕軌道，但可能無法顯示；此版本主要支援文字字幕軌道。
- 如果 Netflix 沒有為目前的影片和地區提供某種語言，本擴充功能也無法顯示該語言的字幕。
- Safari 無法像 Chrome 一樣直接載入未封裝的擴充功能資料夾；你需要使用 Xcode 將其封裝。

## 為 Safari 封裝

安裝完整的 Xcode App，然後執行：

```sh
xcrun safari-web-extension-converter \
  /path/to/safari-netflix-dual-subs \
  --macos-only \
  --copy-resources \
  --app-name "Netflix Dual Official Subs" \
  --bundle-identifier "local.netflix-dual-official-subs"
```

如果指令顯示找不到 `safari-web-extension-converter`，請先安裝或開啟一次完整的 Xcode App，然後在一般的「終端機」視窗中重新執行該指令。

開啟產生的 Xcode 專案。針對 macOS App 目標和擴充功能目標，分別開啟 `Signing & Capabilities`，然後選擇以下其中一種方式：

- 如果只在本機免費使用，將 `Signing Certificate` 設為 `Sign to Run Locally`，並將 `Team` 保持為 `None`。
- 如果希望日常使用更省事，請使用有效的 Apple 開發者身分為兩個目標簽署。已簽署的建置版本不需要啟用 Safari 的未簽署擴充功能開關。

選擇 macOS App 的 scheme，並執行一次 `Product > Run`。容器 App 會向 Safari 註冊擴充功能，因此不再需要透過 `Add Temporary Extension` 選取未封裝的資料夾。接著在 Safari 中：

1. 啟用 `Safari > Settings > Advanced > Show features for web developers`。
2. 如果使用 `Sign to Run Locally`，啟用 `Safari > Settings > Developer > Allow unsigned extensions`。
3. 開啟 `Safari > Settings > Extensions`。
4. 啟用 `Netflix Dual Official Subs`。
5. 允許存取 `netflix.com` 網站。

Safari 結束時會重設 `Allow unsigned extensions`。由 Xcode 封裝的擴充功能仍會保持註冊，但未簽署的建置版本在 Safari 重新啟動後需要再次啟用該開關。如果希望建置後無須反覆設定，請使用有效的簽署身分；如果要發佈給其他人，請透過 App Store 發佈，或使用經 Developer ID 簽署並通過公證的 macOS App。

## 使用方法

最可靠的本機開發流程如下：

1. 從 Xcode 執行一次產生的 App，讓 Safari 發現並註冊擴充功能。
2. 在 Safari 中啟用 `Develop > Allow Unsigned Extensions`。
3. 如果擴充功能沒有出現在 Safari 設定中，請使用 `Develop > Add Temporary Extension`，並選取此原始碼資料夾：

```text
/path/to/safari-netflix-dual-subs
```

4. 在 Safari 中開啟一部 Netflix 影片。
5. 開始播放，並在 Netflix 中選擇你平常使用的主要字幕。
6. 開啟擴充功能的彈出視窗。
7. 選擇第二條字幕軌道。

當 Netflix 提供字幕軌道時，彈出視窗會等待並更新。如果開始播放數秒後仍沒有軌道，可以嘗試重新整理 Netflix 分頁；這也有助於診斷問題。

從瀏覽頁面開啟影片時，擴充功能會快取最近發現的字幕清單，並重複使用與新的 `/watch/` 影片 ID 相符的清單。這是因為 Netflix 可能在更新頁面 URL 之前，就已經解析播放器清單。

如果已偵測到軌道卻無法載入，Netflix 使用的字幕 CDN 主機名稱可能未列在 `manifest.json` 中。開啟 Safari 的網頁檢閱器，查看失敗的字幕請求所使用的主機名稱，並將該主機名稱加入 `host_permissions`。

Safari 會在 24 小時後或結束時移除暫時擴充功能。如果使用 Xcode 專案，原始碼變更後需要重新建置；由於上述轉換指令使用了 `--copy-resources`，如果想將新的原始碼快照複製到全新專案中，還需要重新執行轉換指令。

## 隱私

擴充功能在你的瀏覽器本機執行，沒有後端，也不會將字幕文字傳送給任何第三方服務。
