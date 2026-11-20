// "Share this save": uploading a save's summary, and opening a shared ?s= link.
import { state } from "../state.js";
import { esc } from "../helpers.js";
import { setSaveStatus, applySave, renderSaveBanner } from "./load.js";
import { markShared, gzip } from "./recent.js";

// POSTs the gzipped summary to /api/share (CloudFront -> the vic3tech-share
// Lambda, lambda/share.mjs), which stores it as /shares/<id>.json.gz. The
// link carries the id in ?s= (the #hash keeps tracking country/tab).
export async function shareSave() {
  const btn = document.getElementById("shareSave");
  if (btn) { btn.disabled = true; btn.textContent = "Uploading…"; }
  try {
    const body = await gzip(JSON.stringify(state.saveSummary));
    const res = await fetch("/api/share", { method: "POST", headers: { "content-type": "application/octet-stream" }, body });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
    const { id } = await res.json();
    markShared(state.historyKey, id);
    const url = `${location.origin}/?s=${id}#${state.pinned}`;
    let copied = false;
    try { await navigator.clipboard.writeText(url); copied = true; } catch {}
    renderSaveBanner(`<input class="link" readonly value="${esc(url)}" onclick="this.select()"><button class="share" disabled>${copied ? "Link copied!" : "Copy the link"}</button>`);
  } catch (e) {
    renderSaveBanner(`<span style="margin-left:auto;color:var(--accent)">Couldn't share: ${esc(e.message)}</span><button class="share" id="shareSave">Try again</button>`);
  }
}

// Opening a shared link: ?s=<12-character id>.
export async function openSharedFromUrl() {
  const id = new URLSearchParams(location.search).get("s");
  if (!id) return;
  if (!/^[A-Za-z0-9_-]{12}$/.test(id)) { setSaveStatus("This shared link isn't valid.", true); return; }
  setSaveStatus("Loading the shared save…");
  try {
    const res = await fetch(`/shares/${id}.json.gz`);
    if (!res.ok) throw new Error(res.status === 403 || res.status === 404 ? "it doesn't exist (anymore)" : `HTTP ${res.status}`);
    await applySave(await res.json(), null, id);
  } catch (e) {
    setSaveStatus(`Couldn't open this shared save: ${esc(e.message)}.`, true);
  }
}
