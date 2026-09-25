# Netflix Dual Official Subs for Safari

English | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md)

This is a small Safari Web Extension source folder for showing a second official Netflix subtitle track as an overlay.

It does not machine-translate subtitles and does not load community subtitle files. It watches for the subtitle manifest that Netflix sends to the browser, lets you choose one of those Netflix-provided tracks, fetches that text subtitle track, and syncs it to the current video time.

## What Works

- Second subtitle overlay on `www.netflix.com`
- Official Netflix subtitle tracks only
- Popup controls for language, size, position, opacity, and enable/disable
- TTML/DFXP and WebVTT text subtitle parsing

## Limits

- Netflix changes its player internals often, so this may need adjustment after Netflix updates.
- Image-based subtitle tracks are detected but may not render; this version focuses on text subtitle tracks.
- It cannot show languages that Netflix does not already provide for the current title and region.
- Safari cannot load a loose extension folder directly like Chrome. You need to wrap it with Xcode.

## Package for Safari

Install the full Xcode app, then run:

```sh
xcrun safari-web-extension-converter \
  /path/to/safari-netflix-dual-subs \
  --macos-only \
  --copy-resources \
  --app-name "Netflix Dual Official Subs" \
  --bundle-identifier "local.netflix-dual-official-subs"
```

If that command says it cannot find `safari-web-extension-converter`, install or open the full Xcode app once, then run the command again from a normal Terminal window.

Open the generated Xcode project. For both the macOS app target and extension
target, open `Signing & Capabilities`. Then choose one of these approaches:

- For free local use, set `Signing Certificate` to `Sign to Run Locally` and
  leave `Team` as `None`.
- For the least daily friction, sign both targets with a valid Apple developer
  identity. A signed build does not need Safari's unsigned-extension switch.

Select the macOS app scheme and use `Product > Run` once. The containing app
registers the extension with Safari, so you no longer need to choose the loose
folder with `Add Temporary Extension`. Then in Safari:

1. Enable `Safari > Settings > Advanced > Show features for web developers`.
2. If using `Sign to Run Locally`, enable `Safari > Settings > Developer > Allow unsigned extensions`.
3. Open `Safari > Settings > Extensions`.
4. Enable `Netflix Dual Official Subs`.
5. Allow website access for `netflix.com`.

Safari resets `Allow unsigned extensions` when Safari quits. The Xcode-wrapped
extension stays registered, but an unsigned build needs that switch enabled again
after relaunch. For a completely set-and-forget build, use a valid signing identity;
for distribution to other people, use App Store distribution or a Developer ID-
signed and notarized macOS app.

## Use

For the most reliable local-development flow:

1. Run the generated app from Xcode once so Safari can discover/register the extension.
2. In Safari, enable `Develop > Allow Unsigned Extensions`.
3. If the extension does not appear in Safari Settings, use `Develop > Add Temporary Extension` and choose this source folder:

```text
/path/to/safari-netflix-dual-subs
```

4. Open a Netflix title in Safari.
5. Start playback and choose your normal Netflix subtitle as the primary subtitle.
6. Open the extension popup.
7. Choose the second subtitle track.

The popup now waits and updates while Netflix exposes the subtitle tracks. If it
still has no tracks after playback has started for several seconds, refreshing the
Netflix tab remains a fallback and is useful diagnostic information.

When Netflix opens a title from the browse page, the extension caches recently
observed manifests and reuses the one matching the new `/watch/` title ID. This is
needed because Netflix may parse the player manifest before it updates the page URL.

If tracks are detected but loading fails, Netflix may be using a subtitle CDN hostname not listed in `manifest.json`. Open Safari's Web Inspector, check the failed subtitle request host, and add that host to `host_permissions`.

Safari removes temporary extensions after 24 hours or when Safari quits. If you
use the Xcode project, rebuild it after source changes; because the converter
command above uses `--copy-resources`, rerun the converter when you want to copy a
new source snapshot into a fresh project.

## Privacy

The extension runs locally in your browser. It has no backend and sends no subtitle text to any third-party service.
