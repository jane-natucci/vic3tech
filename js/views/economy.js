// Economy tab: each country's buildings and resource potential, at the 1836 start or in a loaded save, as a sortable
// table and a panel for the open country. The data is economy.json (written by extract.rb), loaded the first time
// this tab -- or anything else that needs it -- opens.
import { state, current } from "../state.js";
import { asset, flagHtml, esc, isEurope } from "../helpers.js";
import { syncHash, render, pin } from "../page.js";
import { renderSidebar } from "../sidebar.js";
import { sortRows, headerRow, nextSort } from "../table.js";
import { tipRow } from "../tooltip.js";

// This tab's own state: the open sub-tab, and the table's sort column and direction.
state.econKind = "buildings"; state.econSort = "total"; state.econDesc = true;

// The sectors buildings are counted in, each with its colour (a CSS variable).
export const SECTORS = [
  { id: "industry", label: "Industry", color: "--art" },
  { id: "agriculture", label: "Agriculture", color: "--inf" },
  { id: "extraction", label: "Extraction", color: "--cav" },
  { id: "infrastructure", label: "Infrastructure", color: "--sotl" },
  { id: "government", label: "Government", color: "--gov" },
  { id: "urban", label: "Urban", color: "--other" },
];

// Urban (services, owner buildings) is tiny in 1836 but the biggest sector by the 1900s: its column only shows
// once a country in the table has this many levels.
const URBAN_COLUMN_FROM = 10;

// --- Loading economy.json ----------------------------------------------------------------------------------------

export let economy = null, economyPromise = null;

export function loadEconomy() {
  if (economyPromise) return economyPromise;
  return economyPromise = fetch(asset("economy.json")).then(r => r.json()).then(e => {
    economy = e;
    aggregateEconomy(e);
    renderSidebar(); render();
    return e;
  });
}

// --- What the tab works out ---------------------------------------------------------------------------------------

// Each country's totals from its states: building levels per type and per sector, and its resources; then the
// resource columns. Also run on a loaded save's states (save/load.js).
export function aggregateEconomy(e) {
  for (const c of Object.values(e.countries)) {
    c.levels = {}; c.sectors = {}; c.resources = {};
    for (const st of c.states) {
      addBuildings(c, st, e.buildings);
      addResources(c, st);
    }
    c.total = Object.values(c.sectors).reduce((a, b) => a + b, 0);
  }
  e.resourceIds = resourceColumns(e.countries);
}

function addBuildings(c, st, buildings) {
  for (const [id, levels] of Object.entries(st.buildings)) {
    c.levels[id] = (c.levels[id] || 0) + levels;
    const sector = buildings[id]?.sector;
    if (sector) c.sectors[sector] = (c.sectors[sector] || 0) + levels;
  }
}

// A state split between countries shares one pool of arable land and resources in the game, so each owner is
// credited by its share of the state region's provinces -- except arable land from a save, which is per owner.
function addResources(c, st) {
  const add = (id, amount, undiscovered = 0) => {
    const r = c.resources[id] ??= { amount: 0, undiscovered: 0 };
    r.amount += amount * st.share; r.undiscovered += undiscovered * st.share;
  };
  if (st.arable_owned != null) (c.resources.arable_land ??= { amount: 0, undiscovered: 0 }).amount += st.arable_owned;
  else add("arable_land", st.arable_land);
  for (const [id, cap] of Object.entries(st.capped)) add(id, cap);
  for (const [id, d] of Object.entries(st.discoverable)) add(id, d.discovered, d.undiscovered);
}

// The resource columns: every capped or discoverable resource, most plentiful worldwide first (arable land is
// always the first column, so it isn't in this list).
function resourceColumns(countries) {
  const world = {};
  for (const c of Object.values(countries)) {
    for (const [id, r] of Object.entries(c.resources)) world[id] = (world[id] || 0) + r.amount + r.undiscovered;
  }
  return Object.keys(world).filter(id => id !== "arable_land").sort((a, b) => world[b] - world[a]);
}

// A country's economy (empty until economy.json has loaded, or for a country it doesn't have).
export const econOf = c => economy?.countries[c.tag] || { levels: {}, sectors: {}, resources: {}, states: [], total: 0 };

// All of a resource a country's states can ever support, found or not.
export const resourceTotal = (c, id) => (econOf(c).resources[id]?.amount || 0) + (econOf(c).resources[id]?.undiscovered || 0);

// The building types of one sector a country has, most levels first.
const buildingsInSector = (e, sector) =>
  Object.keys(e.levels).filter(id => economy.buildings[id]?.sector === sector).sort((a, b) => e.levels[b] - e.levels[a]);

const levelsIn = st => Object.values(st.buildings).reduce((a, b) => a + b, 0);

// --- Names and numbers -------------------------------------------------------------------------------------------

export const bName = id => economy.buildings[id]?.name || id;
export const resName = id => id === "arable_land" ? "Arable land" : bName(id);
const buildingIcon = id => economy.buildings[id]?.icon ? `<img class="ico" src="${asset(economy.buildings[id].icon)}" alt="">` : "";
const resourceIcon = id => id === "arable_land" ? "" : buildingIcon(id);
const n0 = n => Math.round(n).toLocaleString("en");
const undiscoveredNote = n => ` <i class="muted">+${n0(n)}</i>`;

// --- Drawing it --------------------------------------------------------------------------------------------------

const NOTES = {
  buildings: {
    start: "Building levels each country starts with, by sector. Hover over (or tap) a bar for the building types. Military buildings are left out (starting barracks come from the army setup; see the Armies tab).",
    save: "Building levels each country has in your save, by sector. Hover over (or tap) a bar for the building types. Military buildings and subsistence farms are left out.",
  },
  resources: {
    start: "How much of each resource a country's states can ever support: arable land, and the maximum levels of each mine, forestry, fishery and so on. <i>+N</i> is undiscovered (gold, oil, rubber). States split between countries are credited by their share of provinces, which the game does slightly differently, so countries owning part of a state can be off by a few percent (Prussia shows 681 arable land here, 691 in game; countries whose states are all whole match exactly).",
    save: "How much of each resource a country's states can ever support, from your save: arable land is the game's own figure; resource caps are split by the provinces each country actually owns. <i>+N</i> is how much was undiscovered in 1836 (the save doesn't say what's been found since).",
  },
};

export function renderEconomy() {
  if (!economy) {
    loadEconomy();
    document.getElementById("econTable").innerHTML = `<tr><td class="muted">Loading…</td></tr>`;
    return;
  }
  const kind = state.econKind;
  document.getElementById("econTabs").innerHTML = kindButtons(kind) + (kind === "buildings" ? sectorLegend() : "");
  document.getElementById("econNote").innerHTML = NOTES[kind][state.saveInfo ? "save" : "start"];

  const countries = state.data.countries.filter(c => economy.countries[c.tag] && (state.scope === "all" || isEurope(c)));
  const columns = kind === "buildings" ? buildingColumns(countries) : resourceColumnsOf();
  if (!columns.some(col => col.key === state.econSort)) {
    state.econSort = kind === "buildings" ? "total" : "arable_land"; state.econDesc = true;
  }
  const sortColumn = columns.find(col => col.key === state.econSort);
  const row = c => `<tr data-tag="${c.tag}" class="${c.tag === state.pinned ? "pinned" : ""}"><td>${flagHtml(c, "")} ${esc(c.name)}</td>` +
    columns.slice(1).map(col => col.cell(c)).join("") + `</tr>`;
  document.getElementById("econTable").innerHTML = headerRow(columns, state.econSort, state.econDesc) +
    sortRows(countries, sortColumn.value, state.econDesc).map(row).join("");
  renderEconDetail();
}

const kindButtons = open => [["buildings", state.saveInfo ? "Buildings" : "Buildings in 1836"], ["resources", "Resources"]]
  .map(([kind, label]) => `<button data-econ="${kind}" class="${kind === open ? "on" : ""}">${label}</button>`).join("");

const sectorLegend = () =>
  `<div class="legend">${SECTORS.map(s => `<span><span class="sw" style="background:var(${s.color})"></span>${s.label}</span>`).join("")}</div>`;

// The buildings table: total levels, the bar by sector, and a column per sector. Each column says what it shows
// (cell) and sorts by (value); the first, the country, is drawn by the row itself.
function buildingColumns(countries) {
  const biggest = Math.max(1, ...countries.map(c => econOf(c).total));
  const urbanShown = countries.some(c => (econOf(c).sectors.urban || 0) >= URBAN_COLUMN_FROM);
  const sectors = SECTORS.filter(s => s.id !== "urban" || urbanShown);
  return [
    { key: "name", label: "Country", value: c => c.name },
    { key: "total", label: "Levels", value: c => econOf(c).total, cell: c => `<td class="num">${econOf(c).total}</td>` },
    { key: "bar", label: "By sector", value: c => econOf(c).total, cell: c => `<td class="bar" data-tip="econ">${sectorBar(c, biggest)}</td>` },
    ...sectors.map(s => ({
      key: s.id, label: s.label, value: c => econOf(c).sectors[s.id] || 0,
      cell: c => `<td class="num">${econOf(c).sectors[s.id] || "–"}</td>`,
    })),
  ];
}

// As long as the country's levels compared with the most in the table, split into its sectors.
function sectorBar(c, biggest) {
  const e = econOf(c);
  const parts = SECTORS.map(s => e.sectors[s.id] ? `<i style="flex:${e.sectors[s.id]};background:var(${s.color})"></i>` : "").join("");
  return `<div class="stack" style="width:${e.total / biggest * 100}%">${parts}</div>`;
}

// The resources table: arable land, then a column per resource.
function resourceColumnsOf() {
  const shortName = id => resName(id).replace(/ (Mines|Camps|Rigs|Plantations|Wharves|Stations)$/, "");
  return [
    { key: "name", label: "Country", value: c => c.name },
    ...["arable_land", ...economy.resourceIds].map(id => ({
      key: id, label: `${resourceIcon(id)}${esc(shortName(id))}`, value: c => resourceTotal(c, id),
      cell: c => `<td class="num">${resourceCell(econOf(c).resources[id])}</td>`,
    })),
  ];
}

// A resource in the table: how much, + how much is undiscovered, or – for none.
function resourceCell(r) {
  if (!r || !(r.amount >= 0.5 || r.undiscovered >= 0.5)) return "–";
  return `${r.amount >= 0.5 ? n0(r.amount) : "0"}${r.undiscovered >= 0.5 ? undiscoveredNote(r.undiscovered) : ""}`;
}

// --- The open country's panel ------------------------------------------------------------------------------------

function renderEconDetail() {
  const c = current(), e = econOf(c);
  const heading = `<div class="top"><div><h2>${esc(c.name)}</h2><div class="meta">${e.states.length} states · ${e.total} building levels</div></div></div>`;
  const sections = state.econKind === "buildings"
    ? buildingsBySector(e) + buildingsByState(e)
    : resourceTotals(e) + cropsItCanBuild(e) + resourcesByState(e);
  document.getElementById("econDetail").innerHTML = heading + sections;
}

const buildingItem = (id, levels) => `<li><span>${buildingIcon(id)}${esc(bName(id))}</span><span class="v">${levels}</span></li>`;

function buildingsBySector(e) {
  return SECTORS.map(s => {
    const ids = buildingsInSector(e, s.id);
    if (!ids.length) return "";
    return `<h3><span class="sw" style="background:var(${s.color})"></span>${s.label} · ${e.sectors[s.id]}</h3>` +
      `<ul class="blist">${ids.map(id => buildingItem(id, e.levels[id])).join("")}</ul>`;
  }).join("");
}

// Each state, most building levels first, folded open on a click.
function buildingsByState(e) {
  const states = [...e.states].sort((a, b) => levelsIn(b) - levelsIn(a));
  return `<h3>By state</h3>` + states.map(st => {
    const items = Object.entries(st.buildings).sort((a, b) => b[1] - a[1]).map(([id, levels]) => buildingItem(id, levels)).join("");
    return `<details><summary>${esc(st.name)} <span class="k">${levelsIn(st)}</span></summary>` +
      `<ul>${items || "<li class='muted'>No buildings</li>"}</ul></details>`;
  }).join("");
}

// Arable land first, then the most plentiful.
function resourceTotals(e) {
  const potential = id => e.resources[id].amount + e.resources[id].undiscovered;
  const ids = Object.keys(e.resources).sort((a, b) => a === "arable_land" ? -1 : b === "arable_land" ? 1 : potential(b) - potential(a));
  const item = id => {
    const r = e.resources[id];
    return `<li><span>${resourceIcon(id)}${esc(resName(id))}</span>` +
      `<span class="v">${n0(r.amount)}${r.undiscovered >= 0.5 ? undiscoveredNote(r.undiscovered) : ""}</span></li>`;
  };
  return `<h3>Total potential</h3><ul class="blist">${ids.map(item).join("")}</ul>`;
}

function cropsItCanBuild(e) {
  const crops = [...new Set(e.states.flatMap(st => st.arable))];
  if (!crops.length) return "";
  const item = id => `<li><span>${buildingIcon(id)}${esc(bName(id))}</span><span class="k">${e.states.filter(st => st.arable.includes(id)).length} states</span></li>`;
  return `<h3>Farms & plantations it can build</h3><ul class="blist">${crops.map(item).join("")}</ul>`;
}

// Each state, most arable land first: its share of the region, and what it can support.
function resourcesByState(e) {
  const states = [...e.states].sort((a, b) => b.arable_land * b.share - a.arable_land * a.share);
  return `<h3>By state</h3>` + states.map(st => {
    const share = st.share < 1 ? ` <span class="muted">(${Math.round(st.share * 100)}% of region)</span>` : "";
    const resources = [
      ...Object.entries(st.capped).map(([id, cap]) => [id, cap, 0]),
      ...Object.entries(st.discoverable).map(([id, d]) => [id, d.discovered, d.undiscovered]),
    ];
    const item = ([id, amount, undiscovered]) => `<li><span>${buildingIcon(id)}${esc(bName(id))}</span>` +
      `<span class="v">${n0(amount * st.share)}${undiscovered ? undiscoveredNote(undiscovered * st.share) : ""}</span></li>`;
    return `<details><summary>${esc(st.name)}${share} <span class="k">${n0(st.arable_land * st.share)} arable</span></summary><ul>` +
      resources.map(item).join("") +
      `<li><span class="muted">Crops: ${esc(st.arable.map(bName).join(", ") || "none")}</span></li></ul></details>`;
  }).join("");
}

// The tooltip over the "By sector" bar: each sector's share, and its six biggest building types.
const TIP_BUILDINGS = 6;
export function econTip(c) {
  const e = econOf(c);
  return `<b>${esc(c.name)} · ${e.total} building levels</b>` + SECTORS.filter(s => e.sectors[s.id]).map(s => {
    const ids = buildingsInSector(e, s.id);
    const more = ids.length > TIP_BUILDINGS ? `<div class="u"><span>+${ids.length - TIP_BUILDINGS} more</span><span></span></div>` : "";
    return tipRow("g", `${s.label} (${Math.round(e.sectors[s.id] / e.total * 100)}%)`, e.sectors[s.id], s.color) +
      ids.slice(0, TIP_BUILDINGS).map(id => tipRow("u", bName(id), e.levels[id])).join("") + more;
  }).join("");
}

// --- How the rest of the page sees this tab (see allTabs in page.js) --------------------------------------------

export const economyTab = {
  view: "economyView", hash: "economy", followsScope: true,
  subTabs: { key: "econKind", values: ["buildings", "resources"] },
  render: renderEconomy,
  // The sidebar follows the table's sort column (arable land when resources are sorted by name). Until
  // economy.json has loaded there's nothing to rank by, so the sidebar ranks as on the Technology tab.
  ranking() {
    if (!economy) return null;
    const sortKey = state.econSort;
    if (state.econKind === "resources") {
      const id = sortKey === "name" ? "arable_land" : sortKey;
      return { label: resName(id).toLowerCase(), value: c => Math.round(resourceTotal(c, id)) };
    }
    const sector = SECTORS.find(s => s.id === sortKey);
    if (sector) return { label: `${sector.label.toLowerCase()} building levels`, value: c => econOf(c).sectors[sector.id] || 0 };
    return { label: "building levels", value: c => econOf(c).total };
  },
};

// --- Clicks ------------------------------------------------------------------------------------------------------

document.getElementById("econTabs").addEventListener("click", e => {
  const button = e.target.closest("button[data-econ]");
  if (!button) return;
  state.econKind = button.dataset.econ;
  syncHash(); renderEconomy(); renderSidebar();
});

document.getElementById("econTable").addEventListener("click", e => {
  const header = e.target.closest("th");
  if (header) {
    const next = nextSort(header.dataset.sort, state.econSort, state.econDesc);
    state.econSort = next.sortKey; state.econDesc = next.desc;
    renderEconomy(); renderSidebar();
    return;
  }
  const row = e.target.closest("tr[data-tag]");
  if (row) pin(row.dataset.tag);
});
