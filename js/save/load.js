// Loading a melted save (dialog, drag and drop) and swapping its countries in for the 1836 ones.
import { state } from "../state.js";
import { asset, esc } from "../helpers.js";
import { parseHash, render } from "../page.js";
import { renderSidebar } from "../sidebar.js";
import { economy, loadEconomy, aggregateEconomy } from "../views/economy.js";
import { shareSave } from "./share.js";
import { rememberSave } from "./recent.js";

// vic3/save-worker.js reads the file in a Web Worker and returns a per-country summary; applySave puts its countries
// in place of the 1836 ones (and its states in place of the economy's), so every tab shows the save instead.
// "Back to 1836" restores them. Nothing leaves the browser.

// --- Reading the file --------------------------------------------------------------------------------------------

// The strip under the header: what's happening, or which save is open.
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

// --- Showing a save ----------------------------------------------------------------------------------------------

export async function applySave(sum, fileName, sharedId = null) {
  const econ = await loadEconomy();
  state.base ??= { countries: state.data.countries, econCountries: econ.countries, resourceIds: econ.resourceIds, pinned: state.pinned };
  const types = {
    units: Object.fromEntries(state.data.units.map(u => [u.id, u])),
    ships: Object.fromEntries(state.data.ships.map(s => [s.id, s])),
  };
  const countries = sum.countries.map(sc => countryFromSave(sc, econ, types));
  econ.countries = Object.fromEntries(sum.countries.map(sc => [sc.tag, { states: sc.states.map(st => stateFromSave(st, econ)) }]));
  aggregateEconomy(econ);
  useCountries(countries);
  state.saveInfo = { date: sum.date, player: sum.player, fileName };
  state.saveTrade = { treaties: sum.treaties || [], prices: sum.prices || [] };
  state.saveSummary = sum; state.sharedId = sharedId;
  // Just the date: the save strip under the header already says "Your save".
  document.getElementById("eraLabel").textContent = gameDate(sum.date);
  state.pinned = countryToOpen(sum, sharedId, countries);
  renderSaveBanner();
  state.preview = null;
  renderSidebar(); render();
  rememberSave(sum, fileName, sharedId);
}

// A country from the save, shaped like the 1836 ones in data.json (with its real manpower and the years its laws
// were enacted). Techs and laws the game data doesn't know are left out.
function countryFromSave(sc, econ, types) {
  const army = {}, navy = {};
  for (const [id, a] of Object.entries(sc.army)) army[id] = { name: types.units[id]?.name || id, group: types.units[id]?.group, count: a.count, manpower: a.manpower };
  for (const [id, n] of Object.entries(sc.navy)) navy[id] = { name: types.ships[id]?.name || id, count: n };
  const techs = sc.techs.filter(t => state.techs[t]);
  return {
    // Countries formed mid-game (tags like D09) have no name in the game files; the game names them after their
    // capital's state, so the page does too.
    tag: sc.tag, name: state.data.country_names?.[sc.tag] || econ.regions[sc.capitalRegion]?.name || sc.tag, tier: null,
    region: state.data.state_regions?.[sc.capitalRegion] || null,
    techs, techSet: new Set(techs), army, navy, prestige: sc.prestige, gdp: sc.gdp,
    // Saves shared before laws were read have none.
    laws: (sc.laws || []).map(l => l.id).filter(id => state.data.laws?.[id]),
    lawSince: Object.fromEntries((sc.laws || []).map(l => [l.id, l.since])),
    men: Object.values(sc.army).reduce((n, a) => n + a.manpower, 0),
  };
}

// A state from the save, shaped like economy.json's: its region's name, resources and crops, the country's share of
// the region (by provinces: a split state shares one pool of resources), its own arable land, and the buildings
// the page shows.
function stateFromSave(st, econ) {
  const region = econ.regions[st.region] || { name: st.region, provinces: 0, arable_land: 0, arable: [], capped: {}, discoverable: {} };
  return {
    id: st.region, name: region.name, share: region.provinces ? Math.min(1, st.provinces / region.provinces) : 1,
    arable_land: region.arable_land, arable_owned: st.arable_land, arable: region.arable, capped: region.capped, discoverable: region.discoverable,
    buildings: Object.fromEntries(Object.entries(st.buildings).filter(([id]) => econ.buildings[id])),
    trade: st.trade || {}, tradeCenter: st.tradeCenter || null,
  };
}

// The country to open: a shared link's own (#TAG), else the player's, else the one open now if the save has it.
function countryToOpen(sum, sharedId, countries) {
  const linked = sharedId ? parseHash().tag : null;
  if (linked && state.byTag[linked]) return linked;
  if (sum.player && state.byTag[sum.player]) return sum.player;
  return state.byTag[state.pinned] ? state.pinned : countries[0]?.tag;
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

// --- Back to 1836 ------------------------------------------------------------------------------------------------

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

// --- The dialog, and dropping a file ------------------------------------------------------------------------------

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
