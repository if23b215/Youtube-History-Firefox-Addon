/* YouTube Local History — content script
 *
 * Detects when the user lands on a watchable YouTube page (regular
 * video or Short) and records it to local storage via the background
 * script. YouTube is a single-page app, so we listen to its internal
 * navigation events as well as polling for URL changes.
 */

(function () {
  "use strict";

  var LOG = "[YT Local History]";
  var MIN_WATCH_MS = 3000;       // dwell time before recording a view
  var TITLE_TIMEOUT_MS = 20000;  // stop retrying title lookup after this
  var RETRY_EVERY_MS = 500;

  var currentVideoId = null;
  var pendingTimer = null;
  var savedForVideoId = null; // last video ID that was actually saved

  console.log(LOG, "content script loaded @", window.location.href);

  function parseLocation() {
    var path = window.location.pathname;
    var search = new URLSearchParams(window.location.search);

    if (path === "/watch" || path.indexOf("/watch") === 0) {
      var v = search.get("v");
      if (v) return { id: v, kind: "video" };
    }
    if (path.indexOf("/shorts/") === 0) {
      var rest = path.split("/shorts/")[1];
      if (rest) {
        var id = rest.split(/[/?#]/)[0];
        if (id) return { id: id, kind: "short" };
      }
    }
    return null;
  }

  function findTitle() {
    var docTitle = (document.title || "").trim();
    if (docTitle && docTitle !== "YouTube" && !/^\(\d+\)\s*YouTube$/i.test(docTitle)) {
      return docTitle
        .replace(/^\(\d+\)\s*/, "")
        .replace(/\s*[-\u2013\u2014]\s*YouTube\s*$/i, "")
        .trim();
    }

    var selectors = [
      "h1.ytd-watch-metadata yt-formatted-string",
      "h1.ytd-watch-metadata",
      "h1.title.style-scope.ytd-video-primary-info-renderer",
      "h1.ytd-video-primary-info-renderer",
      "ytd-reel-video-renderer[is-active] h2.title",
      "ytd-reel-player-header-renderer h2",
      "meta[name='title']",
      "meta[property='og:title']"
    ];
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (!el) continue;
      var text = el.tagName === "META" ? el.getAttribute("content") : el.textContent;
      if (text && text.trim()) return text.trim();
    }
    return null;
  }

  function findChannel() {
    var selectors = [
      "ytd-video-owner-renderer ytd-channel-name #text-container a",
      "ytd-video-owner-renderer ytd-channel-name a",
      "#owner #channel-name a",
      "#channel-name a",
      "a.ytd-channel-name",
      "ytd-reel-player-header-renderer #channel-name a",
      "ytd-reel-player-header-renderer a.yt-simple-endpoint"
    ];
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (el && el.textContent && el.textContent.trim()) {
        return { name: el.textContent.trim(), url: el.href || "" };
      }
    }
    var metaEl =
      document.querySelector("link[itemprop='name']") ||
      document.querySelector("meta[itemprop='author']");
    var meta = metaEl && metaEl.getAttribute("content");
    if (meta) return { name: meta, url: "" };
    return { name: "Unknown", url: "" };
  }

  function buildUrl(videoId, kind) {
    return kind === "short"
      ? "https://www.youtube.com/shorts/" + videoId
      : "https://www.youtube.com/watch?v=" + videoId;
  }

  function sendSave(payload) {
    console.log(LOG, "saving", payload.id, "-", payload.title);
    try {
      browser.runtime
        .sendMessage({ type: "SAVE_VIDEO", video: payload })
        .then(function (r) { console.log(LOG, "save response:", r); })
        .catch(function (err) { console.error(LOG, "send failed:", err); });
    } catch (err) {
      console.error(LOG, "sendMessage threw:", err);
    }
  }

  function saveWithRetry(videoId, kind, startedAt) {
    if (currentVideoId !== videoId) return;           // user moved on
    if (savedForVideoId === videoId) return;          // already saved

    var title = findTitle();
    if (!title) {
      if (Date.now() - startedAt > TITLE_TIMEOUT_MS) {
        // Give up on a nice title, but still record the ID so history isn't empty.
        console.warn(LOG, "title lookup timed out for", videoId, "- saving with fallback title");
        title = "YouTube video " + videoId;
      } else {
        setTimeout(function () { saveWithRetry(videoId, kind, startedAt); }, RETRY_EVERY_MS);
        return;
      }
    }

    var channel = findChannel();
    savedForVideoId = videoId;
    var isPrivate = false;
    try {
      isPrivate = !!browser.extension.inIncognitoContext;
    } catch (e) { /* ignore */ }
    sendSave({
      id: videoId,
      title: title,
      channel: channel.name,
      channelUrl: channel.url,
      url: buildUrl(videoId, kind),
      thumbnail: "https://i.ytimg.com/vi/" + videoId + "/hqdefault.jpg",
      timestamp: Date.now(),
      kind: kind,
      private: isPrivate
    });
  }

  function handleNavigation(reason) {
    var loc = parseLocation();

    if (!loc) {
      // Navigated away from a watchable page.
      if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; }
      currentVideoId = null;
      return;
    }

    // Same video — do NOT disturb the pending timer. YouTube mutates the
    // URL frequently (adding &pp=, &t=, &list=, etc.) without changing
    // the video, and we don't want those mutations to cancel our save.
    if (loc.id === currentVideoId) return;

    // Real navigation to a different video.
    if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; }
    currentVideoId = loc.id;
    savedForVideoId = null;
    console.log(LOG, "navigation (" + reason + "): " + loc.kind + " id=" + loc.id);

    var targetId = loc.id;
    var targetKind = loc.kind;
    pendingTimer = setTimeout(function () {
      pendingTimer = null;
      if (currentVideoId === targetId) {
        saveWithRetry(targetId, targetKind, Date.now());
      }
    }, MIN_WATCH_MS);
  }

  // Fire at boot.
  handleNavigation("initial");

  // YouTube's SPA events. Listen to multiple — YouTube has changed
  // which one fires over the years.
  window.addEventListener("yt-navigate-finish", function () { handleNavigation("yt-navigate-finish"); });
  window.addEventListener("yt-page-data-updated", function () { handleNavigation("yt-page-data-updated"); });
  window.addEventListener("popstate", function () { handleNavigation("popstate"); });

  // Fallback URL poller.
  var lastHref = window.location.href;
  setInterval(function () {
    if (window.location.href !== lastHref) {
      lastHref = window.location.href;
      handleNavigation("url-poll");
    }
  }, 1000);
})();
