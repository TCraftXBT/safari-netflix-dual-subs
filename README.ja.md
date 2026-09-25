# Safari 用 Netflix 公式字幕の二重表示

[English](README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | 日本語

これは、Netflix が提供する 2 つ目の公式字幕トラックをオーバーレイ表示するための、小さな Safari Web 拡張機能のソースフォルダーです。

字幕の機械翻訳や、コミュニティ製の字幕ファイルの読み込みは行いません。Netflix がブラウザーに送信する字幕マニフェストを監視し、Netflix が提供するトラックから 1 つを選択して、そのテキスト字幕トラックを取得し、現在の動画の再生時刻に同期します。

## 機能

- `www.netflix.com` 上で 2 つ目の字幕を重ねて表示
- Netflix の公式字幕トラックのみを使用
- ポップアップから言語、文字サイズ、位置、不透明度、有効・無効を設定
- TTML/DFXP と WebVTT のテキスト字幕を解析

## 制限事項

- Netflix はプレーヤーの内部仕様を頻繁に変更するため、Netflix の更新後には拡張機能の調整が必要になる場合があります。
- 画像形式の字幕トラックは検出できますが、表示できない場合があります。このバージョンはテキスト字幕トラックを主な対象としています。
- 現在の作品や地域向けに Netflix が提供していない言語の字幕は表示できません。
- Safari では、Chrome のように拡張機能のフォルダーをそのまま読み込めません。Xcode を使ってアプリに組み込む必要があります。

## Safari 用にパッケージ化する

完全版の Xcode アプリをインストールし、次のコマンドを実行します。

```sh
xcrun safari-web-extension-converter \
  /path/to/safari-netflix-dual-subs \
  --macos-only \
  --copy-resources \
  --app-name "Netflix Dual Official Subs" \
  --bundle-identifier "local.netflix-dual-official-subs"
```

`safari-web-extension-converter` が見つからないと表示された場合は、完全版の Xcode アプリをインストールするか一度起動してから、通常のターミナル画面でコマンドを再実行してください。

生成された Xcode プロジェクトを開きます。macOS アプリのターゲットと拡張機能のターゲットの両方で `Signing & Capabilities` を開き、次のいずれかの方法を選びます。

- 無料でローカル使用する場合は、`Signing Certificate` を `Sign to Run Locally` に設定し、`Team` は `None` のままにします。
- 日常的な設定の手間を減らすには、有効な Apple Developer の署名 ID で両方のターゲットに署名します。署名済みのビルドでは、Safari の未署名拡張機能の設定を有効にする必要はありません。

macOS アプリのスキームを選び、`Product > Run` を一度実行します。拡張機能を含むアプリが Safari に拡張機能を登録するため、`Add Temporary Extension` でフォルダーを直接選ぶ必要がなくなります。その後、Safari で次の操作を行います。

1. `Safari > Settings > Advanced > Show features for web developers` を有効にします。
2. `Sign to Run Locally` を使う場合は、`Safari > Settings > Developer > Allow unsigned extensions` を有効にします。
3. `Safari > Settings > Extensions` を開きます。
4. `Netflix Dual Official Subs` を有効にします。
5. `netflix.com` への Web サイトアクセスを許可します。

Safari を終了すると `Allow unsigned extensions` の設定はリセットされます。Xcode で組み込んだ拡張機能の登録は残りますが、未署名のビルドでは Safari の再起動後にこの設定を再度有効にする必要があります。毎回設定せずに使うには、有効な署名 ID を使用してください。他の人に配布する場合は、App Store で配布するか、Developer ID で署名し、公証を受けた macOS アプリを使用してください。

## 使い方

ローカル開発で最も確実な手順は次のとおりです。

1. 生成されたアプリを Xcode から一度実行し、Safari に拡張機能を検出・登録させます。
2. Safari で `Develop > Allow Unsigned Extensions` を有効にします。
3. Safari の設定に拡張機能が表示されない場合は、`Develop > Add Temporary Extension` を使い、次のソースフォルダーを選びます。

```text
/path/to/safari-netflix-dual-subs
```

4. Safari で Netflix の作品を開きます。
5. 再生を開始し、通常使う Netflix の字幕をメイン字幕として選びます。
6. 拡張機能のポップアップを開きます。
7. 2 つ目の字幕トラックを選びます。

Netflix が字幕トラックを公開するまで、ポップアップは待機して表示を更新します。再生開始から数秒経ってもトラックが表示されない場合は、Netflix のタブを再読み込みしてみてください。問題の切り分けにも役立ちます。

閲覧ページから作品を開くと、拡張機能は最近確認したマニフェストをキャッシュし、新しい `/watch/` の作品 ID に一致するものを再利用します。Netflix がページの URL を更新する前にプレーヤーのマニフェストを解析する場合があるためです。

トラックが検出されても読み込めない場合は、Netflix が使用する字幕 CDN のホスト名が `manifest.json` に記載されていない可能性があります。Safari の Web インスペクターを開いて失敗した字幕リクエストのホスト名を確認し、そのホスト名を `host_permissions` に追加してください。

Safari は一時的な拡張機能を 24 時間後、または Safari の終了時に削除します。Xcode プロジェクトを使う場合は、ソースを変更した後に再ビルドしてください。上記の変換コマンドでは `--copy-resources` を使用しているため、新しいソースの内容を新規プロジェクトにコピーするには、変換コマンドを再実行する必要があります。

## プライバシー

拡張機能はブラウザー内でローカルに動作します。バックエンドはなく、字幕テキストを第三者のサービスに送信しません。
