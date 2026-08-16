/* YouTube Local History — popup UI */

const listEl = document.getElementById("list");
const searchEl = document.getElementById("search");
const countEl = document.getElementById("count-badge");
const statusEl = document.getElementById("status");
const tpl = document.getElementById("tpl-entry");

let allHistory = [];
let filterText = "";
let activeScope = "all"; // "all" | "normal" | "private"

document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindEvents();
  await refresh();
}

function bindEvents() {
  searchEl.addEventListener("input", (e) => {
    filterText = e.target.value.trim().toLowerCase();
    render();
  });

  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeScope = btn.dataset.scope;
      document.querySelectorAll(".tab").forEach((b) => {
        const on = b === btn;
        b.classList.toggle("active", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
      });
      render();
    });
  });

  document.getElementById("btn-clear").addEventListener("click", onClear);
  document.getElementById("btn-export").addEventListener("click", onExport);
  document.getElementById("btn-import").addEventListener("click", () => {
    document.getElementById("import-file").click();
  });
  document
    .getElementById("import-file")
    .addEventListener("change", onImport);
}

async function refresh() {
  allHistory = await browser.runtime.sendMessage({ type: "GET_HISTORY" });
  render();
}

function scopeMatches(entry, scope) {
  if (scope === "all") return true;
  const isPriv = !!entry.private;
  if (scope === "private") return isPriv;
  if (scope === "normal") return !isPriv;
  return true;
}

function render() {
  // Update tab counts based on ALL history (not filtered by search).
  const counts = { all: 0, normal: 0, private: 0 };
  for (const v of allHistory) {
    counts.all++;
    if (v.private) counts.private++;
    else counts.normal++;
  }
  document.querySelector('[data-count="all"]').textContent = counts.all;
  document.querySelector('[data-count="normal"]').textContent = counts.normal;
  document.querySelector('[data-count="private"]').textContent = counts.private;

  const scoped = allHistory.filter((v) => scopeMatches(v, activeScope));
  const items = filterText
    ? scoped.filter(
        (v) =>
          v.title.toLowerCase().includes(filterText) ||
          (v.channel || "").toLowerCase().includes(filterText)
      )
    : scoped;

  countEl.textContent = allHistory.length.toLocaleString();
  const scopeLabel =
    activeScope === "all" ? "" : activeScope === "private" ? "private " : "normal ";
  const wordForView =
    items.length === 1 ? `${scopeLabel}video` : `${scopeLabel}videos`;
  statusEl.textContent = filterText
    ? `Showing ${items.length} of ${scoped.length} ${wordForView}`
    : `${items.length} ${wordForView}`;

  listEl.textContent = "";

  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    if (allHistory.length === 0) {
      empty.innerHTML =
        "<strong>No history yet</strong>Watch a YouTube video for a few seconds and it will show up here.";
    } else if (scoped.length === 0) {
      const msg =
        activeScope === "private"
          ? "No private-window videos tracked yet. Remember to enable the extension in private browsing in <em>about:addons</em>."
          : "Nothing watched in normal mode yet.";
      empty.innerHTML = `<strong>Empty</strong>${msg}`;
    } else {
      empty.innerHTML = `<strong>No matches</strong>Nothing matches "${escapeHtml(
        filterText
      )}".`;
    }
    listEl.appendChild(empty);
    return;
  }

  const frag = document.createDocumentFragment();
  for (const entry of items) {
    frag.appendChild(buildEntryNode(entry));
  }
  listEl.appendChild(frag);
}

function buildEntryNode(entry) {
  const node = tpl.content.firstElementChild.cloneNode(true);

  const thumbWrap = node.querySelector(".thumb-wrap");
  const thumb = node.querySelector(".thumb");
  const kindPill = node.querySelector(".kind-pill");
  const title = node.querySelector(".title");
  const privatePill = node.querySelector(".private-pill");
  const channel = node.querySelector(".channel");
  const watchedAt = node.querySelector(".watched-at");
  const watchCount = node.querySelector(".watch-count");
  const del = node.querySelector(".delete");

  thumbWrap.href = entry.url;
  thumb.src = entry.thumbnail;
  thumb.alt = entry.title;
  thumb.addEventListener(
    "error",
    () => {
      thumb.src = `https://i.ytimg.com/vi/${entry.id}/mqdefault.jpg`;
    },
    { once: true }
  );

  if (entry.kind === "short") {
    kindPill.textContent = "Short";
    kindPill.hidden = false;
  }

  title.textContent = entry.title;
  title.href = entry.url;
  title.title = entry.title;

  // Only show the "Private" pill when we're mixing modes (All view).
  if (entry.private && activeScope === "all") {
    privatePill.hidden = false;
  }
  // When on the Private tab, give the whole entry a subtle accent.
  if (entry.private) {
    node.classList.add("is-private");
  }

  channel.textContent = entry.channel || "Unknown";
  channel.href = entry.channelUrl || "#";
  if (!entry.channelUrl) channel.removeAttribute("href");

  watchedAt.textContent = formatWhen(entry.timestamp);
  watchedAt.title = new Date(entry.timestamp).toLocaleString();

  if (entry.watchCount && entry.watchCount > 1) {
    watchCount.textContent = `${entry.watchCount}x`;
    watchCount.hidden = false;
    watchCount.title = `Watched ${entry.watchCount} times`;
  }

  del.addEventListener("click", async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    await browser.runtime.sendMessage({
      type: "DELETE_ENTRY",
      id: entry.id
    });
    // Remove the matching (id + private-flag) entry from local cache.
    allHistory = allHistory.filter(
      (v) => !(v.id === entry.id && !!v.private === !!entry.private)
    );
    render();
  });

  return node;
}

function formatWhen(ts) {
  const now = Date.now();
  const diff = now - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} day${day === 1 ? "" : "s"} ago`;
  const week = Math.floor(day / 7);
  if (week < 5) return `${week} wk ago`;
  const month = Math.floor(day / 30);
  if (month < 12) return `${month} mo ago`;
  const year = Math.floor(day / 365);
  return `${year} yr ago`;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);
}

async function onClear() {
  const labels = {
    all: "ALL local YouTube history (normal + private)",
    normal: "all NORMAL-mode history (private entries kept)",
    private: "all PRIVATE-mode history (normal entries kept)"
  };
  if (!confirm(`Delete ${labels[activeScope]}?\nThis cannot be undone.`)) {
    return;
  }
  await browser.runtime.sendMessage({
    type: "CLEAR_HISTORY",
    scope: activeScope
  });
  await refresh();
}

async function onExport() {
  const payload = {
    format: "youtube-local-history",
    version: 2,
    exportedAt: new Date().toISOString(),
    entries: allHistory
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, 19);
  const a = document.createElement("a");
  a.href = url;
  a.download = `youtube-history-${stamp}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function onImport(ev) {
  const file = ev.target.files && ev.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const entries = Array.isArray(data) ? data : data.entries;
    if (!Array.isArray(entries)) throw new Error("bad format");

    const choice = confirm(
      `Import ${entries.length} entries?\n\n` +
        "OK = MERGE with existing history (duplicates by video ID + mode are kept once).\n" +
        "Cancel = do nothing."
    );
    if (!choice) {
      ev.target.value = "";
      return;
    }

    // Merge on (id + private-flag) so normal and private stay separate.
    const keyOf = (e) => `${e.id}::${e.private ? 1 : 0}`;
    const byKey = new Map();
    for (const e of [...allHistory, ...entries]) {
      if (!e || !e.id) continue;
      const k = keyOf(e);
      const prev = byKey.get(k);
      if (!prev) {
        byKey.set(k, { ...e, private: !!e.private });
      } else {
        byKey.set(k, {
          ...prev,
          ...e,
          private: !!(prev.private || e.private),
          watchCount: Math.max(prev.watchCount || 1, e.watchCount || 1),
          timestamp: Math.max(prev.timestamp || 0, e.timestamp || 0),
          firstSeen: Math.min(
            prev.firstSeen || prev.timestamp || Infinity,
            e.firstSeen || e.timestamp || Infinity
          )
        });
      }
    }
    const merged = [...byKey.values()].sort(
      (a, b) => (b.timestamp || 0) - (a.timestamp || 0)
    );
    await browser.runtime.sendMessage({
      type: "REPLACE_HISTORY",
      history: merged
    });
    allHistory = merged;
    render();
  } catch (err) {
    alert("Import failed: " + err.message);
  } finally {
    ev.target.value = "";
  }
}
