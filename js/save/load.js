// Loading a melted save (dialog, drag and drop) and swapping its countries in for the 1836 ones.
import { state } from "../state.js";
import { asset, esc } from "../helpers.js";
import { parseHash, render } from "../page.js";
import { renderSidebar } from "../sidebar.js";
import { economy, loadEconomy, aggregateEconomy } from "../views/economy.js";
import { shareSave } from "./share.js";
import { rememberSave } from "./recent.js";

// --- Loading a melted save -------------------------------------------------
// public/vic3/save-worker.js reads the file in a Web Worker and returns a
// per-country summary; here it replaces the 1836 countries (and economy
// countries) so every tab shows the save instead. "Back to 1836" restores
// them. Nothing leaves the browser.
const saveStatus = document.getElementById("saveStatus");
export function setSaveStatus(html, err = false) { saveStatus.innerHTML = html; saveStatus.classList.toggle("err", err); }
function loadSaveFile(file) {
  if (!file) return;
  if (saveDialog.open) saveDialog.close();
  setSaveStatus(`Reading ${esc(file.name)}… <span class="bar"><i id="saveBar"></i></span>`);
  const worker = new Worker(asset("save-worker.js"));
  worker.onmessage = async ({ data: m }) => {
    if (m.type === "progress") { const bar = document.getElementById("saveBar"); if (bar) bar.style.width = Math.round(m.done * 100) + "%"; return; }
    worker.terminate();
    if (m.type === "error") { setSaveStatus(`${esc(m.message)} <a href="#" data-open-save-help>How?</a>`, true); return; }
    try {
      await applySave(m.summary, file.name);
    } catch (e) {
      console.error(e);
      setSaveStatus(`Couldn't show this save: ${esc(e.message)}. Try reloading the page.`, true);
    }
  };
  worker.onerror = e => { worker.terminate(); setSaveStatus("Couldn't read that file: " + esc(e.message || "unknown error"), true); };
  worker.postMessage(file);
}

export async function applySave(sum, fileName, sharedId = null) {
  const econ = await loadEconomy();
  state.base ??= { countries: state.data.countries, econCountries: econ.countries, resourceIds: econ.resourceIds, pinned: state.pinned };
  const units = Object.fromEntries(state.data.units.map(u => [u.id, u]));
  const shipTypes = Object.fromEntries(state.data.ships.map(s => [s.id, s]));
  const countries = [], econCountries = {};
  for (const sc of sum.countries) {
    const army = {}, navy = {};
    for (const [id, a] of Object.entries(sc.army)) army[id] = { name: units[id]?.name || id, group: units[id]?.group, count: a.count, manpower: a.manpower };
    for (const [id, n] of Object.entries(sc.navy)) navy[id] = { name: shipTypes[id]?.name || id, count: n };
    const techs = sc.techs.filter(t => state.techs[t]);
    countries.push({
      // Countries created mid-game (tags like D09) have no name in the files;
      // the game names them from their capital, so do the same.
      tag: sc.tag, name: state.data.country_names?.[sc.tag] || econ.regions[sc.capitalRegion]?.name || sc.tag, tier: null,
      region: state.data.state_regions?.[sc.capitalRegion] || null,
      techs, techSet: new Set(techs), army, navy, prestige: sc.prestige, gdp: sc.gdp,
      // Saves shared before laws were read have none.
      laws: (sc.laws || []).map(l => l.id).filter(id => state.data.laws?.[id]),
      lawSince: Object.fromEntries((sc.laws || []).map(l => [l.id, l.since])),
      men: Object.values(sc.army).reduce((n, a) => n + a.manpower, 0),
    });
    econCountries[sc.tag] = { states: sc.states.map(st => {
      const r = econ.regions[st.region] || { name: st.region, provinces: 0, arable_land: 0, arable: [], capped: {}, discoverable: {} };
      return {
        id: st.region, name: r.name, share: r.provinces ? Math.min(1, st.provinces / r.provinces) : 1,
        arable_land: r.arable_land, arable_owned: st.arable_land, arable: r.arable, capped: r.capped, discoverable: r.discoverable,
        buildings: Object.fromEntries(Object.entries(st.buildings).filter(([id]) => econ.buildings[id])),
        trade: st.trade || {}, tradeCenter: st.tradeCenter || null,
      };
    }) };
  }
  econ.countries = econCountries;
  aggregateEconomy(econ);
  useCountries(countries);
  state.saveInfo = { date: sum.date, player: sum.player, fileName };
  state.saveTrade = { treaties: sum.treaties || [], prices: sum.prices || [] };
  state.saveSummary = sum; state.sharedId = sharedId;
  // Just the date: the save strip under the header already says "Your save".
  document.getElementById("eraLabel").textContent = gameDate(sum.date);
  // A shared link keeps the country it was shared with (#TAG); otherwise pin the player.
  const linked = sharedId ? parseHash().tag : null;
  if (linked && state.byTag[linked]) state.pinned = linked;
  else if (sum.player && state.byTag[sum.player]) state.pinned = sum.player;
  else if (!state.byTag[state.pinned]) state.pinned = countries[0]?.tag;
  renderSaveBanner();
  state.preview = null;
  renderSidebar(); render();
  rememberSave(sum, fileName, sharedId);
}
// "1841.3.8" -> "8 Mar 1841"
export function gameDate(date) {
  const [y, mo, d] = date.split(".").map(Number);
  return new Date(Date.UTC(y, mo - 1, d)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function renderSaveBanner(extra = "") {
  const sum = state.saveSummary, you = sum?.player ? state.byTag[sum.player]?.name || sum.player : null;
  setSaveStatus(state.sharedId
    ? `<b>Shared save</b>${you ? `<span>playing ${esc(you)}</span>` : ""} <button class="back" id="back1836">Back to 1836</button>`
    : `<b>Your save</b>${you ? `<span>playing ${esc(you)}</span>` : ""} <span class="file">${esc(state.saveInfo?.fileName || "")}</span>${extra || `<button class="share" id="shareSave" title="Upload this save's summary and copy a link anyone can open">Share this save</button>`}<button class="back" id="back1836">Back to 1836</button>`);
}

function useCountries(countries) {
  state.data.countries = countries;
  state.byTag = {};
  countries.forEach(c => { c.techSet ??= new Set(c.techs); state.byTag[c.tag] = c; });
}

export function backTo1836() {
  const b = state.base; if (!b) return;
  useCountries(b.countries);
  economy.countries = b.econCountries; economy.resourceIds = b.resourceIds;
  state.saveInfo = null; state.saveTrade = null; state.saveSummary = null; state.sharedId = null; state.historyKey = null; state.base = null; state.preview = null;
  if (location.search) history.replaceState(null, "", location.pathname + location.hash);
  if (!state.byTag[state.pinned]) state.pinned = b.pinned;
  document.getElementById("eraLabel").textContent = "1836 start";
  setSaveStatus("");
  renderSidebar(); render();
}

const saveDialog = document.getElementById("saveDialog");
document.getElementById("loadSave").addEventListener("click", () => saveDialog.showModal());
saveDialog.addEventListener("click", e => {
  // Close on ✕ or a click on the backdrop (outside the dialog's box).
  const r = saveDialog.getBoundingClientRect();
  const outside = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  if (e.target.closest("[data-close-dialog]") || (e.target === saveDialog && outside)) saveDialog.close();
});
const saveDrop = document.getElementById("saveDrop");
saveDrop.addEventListener("click", () => document.getElementById("saveFile").click());
saveDrop.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); document.getElementById("saveFile").click(); } });
saveDrop.addEventListener("dragover", e => { e.preventDefault(); saveDrop.classList.add("over"); });
saveDrop.addEventListener("dragleave", () => saveDrop.classList.remove("over"));
document.getElementById("saveFile").addEventListener("change", e => { loadSaveFile(e.target.files[0]); e.target.value = ""; });
saveStatus.addEventListener("click", e => {
  if (e.target.id === "back1836") backTo1836();
  if (e.target.id === "shareSave") shareSave();
  if (e.target.closest("[data-open-save-help]")) { e.preventDefault(); saveDialog.showModal(); }
});
// Dropping a file anywhere on the page loads it.
let dragDepth = 0;
addEventListener("dragenter", e => { if (e.dataTransfer?.types.includes("Files")) { dragDepth++; document.body.classList.add("dragging"); } });
addEventListener("dragleave", () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove("dragging"); } });
addEventListener("dragover", e => { if (e.dataTransfer?.types.includes("Files")) e.preventDefault(); });
addEventListener("drop", e => {
  if (!e.dataTransfer?.files.length) return;
  e.preventDefault(); dragDepth = 0; document.body.classList.remove("dragging");
  loadSaveFile(e.dataTransfer.files[0]);
});
