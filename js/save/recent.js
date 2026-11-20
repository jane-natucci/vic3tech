// The recent-saves menu under the date, kept in this browser's IndexedDB.
import { state } from "../state.js";
import { flagHtml, esc } from "../helpers.js";
import { setSaveStatus, applySave, gameDate, backTo1836 } from "./load.js";

// --- Recent saves --------------------------------------------------------------
// Every save that loads -- from a file or a shared link -- is kept in this
// browser's IndexedDB as its gzipped summary (60-150 KB, vs 5 MB for all
// of localStorage), so clicking the date in the header reopens it without
// re-reading the file. Newest RECENT_MAX are kept. If storage isn't
// available (private windows, blocked site data) the page works as before,
// just without a list.
const RECENT_MAX = 20;
let recentDb = null;
function openRecentDb() {
  return recentDb ??= new Promise((resolve, reject) => {
    const req = indexedDB.open("vic3tech", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("saves", { keyPath: "key" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function recentStore(mode, fn) {
  const db = await openRecentDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("saves", mode), req = fn(tx.objectStore("saves"));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}
const recentList = () => recentStore("readonly", s => s.getAll()).then(all => all.sort((a, b) => b.loadedAt - a.loadedAt));
export const gzip = async text => new Uint8Array(await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
const gunzip = bytes => new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).json();

// One entry per shared link, and per file + in-game date + player (loading
// the same save again just moves it to the top).
export async function rememberSave(sum, fileName, sharedId) {
  const key = sharedId ? `s:${sharedId}` : `f:${fileName}|${sum.date}|${sum.player || ""}`;
  state.historyKey = key;
  try {
    const old = await recentStore("readonly", s => s.get(key));
    const entry = {
      key, date: sum.date, player: sum.player || null, playerName: sum.player ? state.byTag[sum.player]?.name || sum.player : null,
      fileName, sharedId: sharedId || old?.sharedId || null, loadedAt: Date.now(), gz: old?.gz || await gzip(JSON.stringify(sum)),
    };
    await recentStore("readwrite", s => s.put(entry));
    const stale = (await recentList()).slice(RECENT_MAX);
    if (stale.length) await recentStore("readwrite", s => stale.forEach(e => s.delete(e.key)));
  } catch (e) { console.warn("Couldn't remember this save:", e); }
}
// A save you loaded and then shared keeps its link, shown in the list.
export async function markShared(key, sharedId) {
  if (!key) return;
  try {
    const entry = await recentStore("readonly", s => s.get(key));
    if (entry) await recentStore("readwrite", s => s.put({ ...entry, sharedId }));
  } catch {}
}

const eraBtn = document.getElementById("eraBtn"), recentMenu = document.getElementById("recentMenu");
async function openRecentMenu() {
  let list = [];
  try { list = await recentList(); } catch (e) { console.warn("No saved history:", e); }
  const ago = t => {
    const m = (Date.now() - t) / 6e4;
    return m < 1 ? "just now" : m < 60 ? `${Math.round(m)} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  };
  const who = e => {
    const c = e.player && (state.byTag[e.player] || state.base?.countries.find(x => x.tag === e.player));
    return c ? flagHtml(c) : `<span class="none">${esc(e.player || "–")}</span>`;
  };
  recentMenu.innerHTML =
    `<div class="row${state.saveInfo ? "" : " on"}"><button class="open" data-recent="1836"><span class="flag">📜</span><span><b>1836 start</b><i>The game's starting date, for every country</i></span></button></div>` +
    `<h4>Recent saves</h4>` +
    (list.length ? list.map(e => `<div class="row${e.key === state.historyKey && state.saveInfo ? " on" : ""}">
        <button class="open" data-recent="${esc(e.key)}">${who(e)}<span><b>${esc(gameDate(e.date))}</b>${e.playerName ? ` · ${esc(e.playerName)}` : ""}
          <i>${e.fileName ? esc(e.fileName) : "Shared link"}${e.fileName && e.sharedId ? " · shared" : ""} · ${ago(e.loadedAt)}</i></span></button>
        <button class="del" data-forget="${esc(e.key)}" title="Remove from this list" aria-label="Remove from this list">✕</button></div>`).join("")
      : `<p class="empty">Saves you load or open from a shared link show up here, kept in this browser only.</p>`);
  recentMenu.hidden = false; eraBtn.setAttribute("aria-expanded", "true");
}
function closeRecentMenu() { recentMenu.hidden = true; eraBtn.setAttribute("aria-expanded", "false"); }
async function openRecent(key) {
  closeRecentMenu();
  if (key === "1836") { backTo1836(); return; }
  try {
    const e = await recentStore("readonly", s => s.get(key));
    if (!e) throw new Error("it's no longer stored");
    setSaveStatus("Opening…");
    const sum = await gunzip(e.gz);
    // A shared link's entry gets its ?s= back, so reloading keeps it; your own file doesn't have one.
    const params = new URLSearchParams(location.search);
    if (e.fileName) params.delete("s"); else params.set("s", e.sharedId);
    const query = params.toString();
    history.replaceState(null, "", location.pathname + (query ? "?" + query : "") + location.hash);
    await applySave(sum, e.fileName, e.fileName ? null : e.sharedId);
  } catch (err) {
    console.error(err);
    setSaveStatus(`Couldn't open this save: ${esc(err.message)}.`, true);
  }
}
eraBtn.addEventListener("click", e => { e.stopPropagation(); recentMenu.hidden ? openRecentMenu() : closeRecentMenu(); });
recentMenu.addEventListener("click", async e => {
  e.stopPropagation();
  const forget = e.target.closest("[data-forget]")?.dataset.forget;
  if (forget) { try { await recentStore("readwrite", s => s.delete(forget)); } catch {} openRecentMenu(); return; }
  const key = e.target.closest("[data-recent]")?.dataset.recent;
  if (key) openRecent(key);
});
document.addEventListener("click", () => { if (!recentMenu.hidden) closeRecentMenu(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !recentMenu.hidden) { closeRecentMenu(); eraBtn.focus(); } });
