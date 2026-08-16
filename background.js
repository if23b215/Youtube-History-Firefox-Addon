/* YouTube Local History — background script
 *
 * Handles persistence of watched-video records to browser.storage.local.
 * Storage is local to the user's Firefox profile and survives restarts.
 */

const STORAGE_KEY = "ytHistory";
const MAX_ENTRIES = 20000; // soft cap to keep UI responsive
const LOG = "[YT Local History bg]";

console.log(LOG, "background script loaded");

browser.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || !msg.type) return;
  console.log(LOG, "msg:", msg.type, "from tab", sender && sender.tab && sender.tab.id);

  switch (msg.type) {
    case "SAVE_VIDEO":
      return saveVideo(msg.video, sender);
    case "GET_HISTORY":
      return getHistory();
    case "DELETE_ENTRY":
      return deleteEntry(msg.id);
    case "CLEAR_HISTORY":
      return clearHistory(msg.scope);
    case "REPLACE_HISTORY":
      return replaceHistory(msg.history);
  }
});

async function getHistory() {
  const data = await browser.storage.local.get(STORAGE_KEY);
  return data[STORAGE_KEY] || [];
}

async function saveVideo(video, sender) {
  if (!video || !video.id || !video.title) {
    console.warn(LOG, "saveVideo rejected (missing id/title):", video);
    return { ok: false };
  }

  const isPrivate =
    video.private === true ||
    (sender && sender.tab && sender.tab.incognito === true) ||
    false;

  const history = await getHistory();
  // Only merge with an existing entry if it was in the SAME mode
  // (private stays separate from normal).
  const existingIdx = history.findIndex(
    (v) => v.id === video.id && !!v.private === !!isPrivate
  );

  let watchCount = 1;
  let firstSeen = video.timestamp;
  if (existingIdx !== -1) {
    const prev = history[existingIdx];
    watchCount = (prev.watchCount || 1) + 1;
    firstSeen = prev.firstSeen || prev.timestamp;
    history.splice(existingIdx, 1);
  }

  const entry = {
    id: video.id,
    title: video.title,
    channel: video.channel || "Unknown",
    channelUrl: video.channelUrl || "",
    url: video.url,
    thumbnail: video.thumbnail,
    timestamp: video.timestamp,
    firstSeen: firstSeen,
    watchCount: watchCount,
    kind: video.kind || "video",
    private: isPrivate
  };

  history.unshift(entry);

  if (history.length > MAX_ENTRIES) {
    history.length = MAX_ENTRIES;
  }

  await browser.storage.local.set({ [STORAGE_KEY]: history });
  console.log(
    LOG,
    "saved",
    isPrivate ? "[PRIVATE]" : "[normal]",
    entry.title,
    "(" + entry.id + ")"
  );
  return { ok: true };
}

async function deleteEntry(id) {
  const history = await getHistory();
  const filtered = history.filter((v) => v.id !== id);
  await browser.storage.local.set({ [STORAGE_KEY]: filtered });
  return { ok: true, remaining: filtered.length };
}

async function clearHistory(scope) {
  // scope: "all" (default), "normal", or "private"
  if (!scope || scope === "all") {
    await browser.storage.local.set({ [STORAGE_KEY]: [] });
    return { ok: true, removed: "all" };
  }
  const history = await getHistory();
  const keep = history.filter((v) => {
    const isPriv = !!v.private;
    if (scope === "private") return !isPriv;  // keep normal, drop private
    if (scope === "normal") return isPriv;    // keep private, drop normal
    return true;
  });
  await browser.storage.local.set({ [STORAGE_KEY]: keep });
  return { ok: true, remaining: keep.length };
}

async function replaceHistory(history) {
  if (!Array.isArray(history)) return { ok: false };
  const clean = history
    .filter((v) => v && v.id && v.title && v.url)
    .slice(0, MAX_ENTRIES);
  await browser.storage.local.set({ [STORAGE_KEY]: clean });
  return { ok: true, count: clean.length };
}
