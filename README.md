# YouTube Local History (Firefox Addon)

A Firefox extension that keeps a **local** history of every YouTube video and Short you watch. History is stored in your Firefox profile — it persists across browser restarts, requires no Google account, and never leaves your machine.

## Features

- Tracks every video/Short you actually watch (small delay before recording, so accidental clicks don't pollute the list)
- Records title, channel, thumbnail, timestamp, and a rewatch counter
- Popup UI with search, export to JSON, import from JSON, single-entry delete, and clear-all
- Plays the current filtered view, or any visible entry onward, as an ad-hoc playlist on YouTube's normal watch page
- Works for both regular videos (`/watch?v=...`) and Shorts (`/shorts/...`)
- 100% local — uses `browser.storage.local`, no network calls except loading thumbnails from YouTube

## Install (temporary, for development / personal use)

1. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on...**
3. Select the `manifest.json` file in this folder
4. **Reload any YouTube tabs you already have open** — Firefox does NOT inject content scripts into tabs that were open before the extension loaded. New tabs are fine.
5. The addon icon will appear in your toolbar. Click it to see your history.
6. **(Optional) Enable in private windows:** open `about:addons`, click "YouTube Local History", and set **Run in Private Windows** to **Allow**. Private-window views will then be recorded under the separate **Private** tab in the popup. If you skip this step, private-window activity is simply not tracked.

## Debugging

If videos aren't being recorded:

- Open DevTools (`F12` or `Ctrl+Shift+I`) on a YouTube tab and check the **Console**. You should see log lines prefixed with `[YT Local History]` when you load a video.
- Open the background script console: in `about:debugging#/runtime/this-firefox`, find the extension and click **Inspect** next to it. You should see `[YT Local History bg]` messages arrive when videos are saved.
- If you see "content script loaded" but no "saving" log after a few seconds, the title selectors may have failed — please share the console output.

> Temporary add-ons are removed when Firefox restarts. To install permanently without Mozilla signing you can either:
> - Use **Firefox Developer Edition** or **Firefox Nightly** and set `xpinstall.signatures.required` to `false` in `about:config`, then package as `.xpi` (zip the folder contents and rename to `.xpi`).
> - Or submit it to [addons.mozilla.org](https://addons.mozilla.org) for signing.

## Packaging as .xpi

From inside this folder:

```bash
# Windows (PowerShell)
Compress-Archive -Path * -DestinationPath youtube-local-history.zip
Rename-Item youtube-local-history.zip youtube-local-history.xpi

# macOS / Linux
zip -r youtube-local-history.xpi . -x "*.git*" "README.md"
```

Then drag the `.xpi` into Firefox.

## How it works

- `content.js` runs on `youtube.com`, listens for SPA navigations, and after ~5 seconds on a watch page sends the metadata to the background script.
- `background.js` writes to `browser.storage.local`. Rewatches bump a `watchCount` instead of duplicating the entry.
- `popup.html/js/css` renders the UI when you click the toolbar icon.

## Files

| File | Role |
|------|------|
| `manifest.json` | Extension manifest (MV3) |
| `background.js` | Storage layer, message router |
| `content.js` | Detects watched videos on youtube.com |
| `popup.html/js/css` | Toolbar UI |
| `icon.svg` | Toolbar icon |

## Privacy

The only data sent over the network is the thumbnail image request to `i.ytimg.com` when the popup is open. Everything else is stored locally in your Firefox profile.
