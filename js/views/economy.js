// Economy tab: buildings and resources per country, from economy.json (loaded the first time it's needed).
import { state, current } from "../state.js";
import { asset, flagHtml, esc, isEurope } from "../helpers.js";
import { syncHash, render, pin } from "../page.js";
import { renderSidebar } from "../sidebar.js";

// --- Economy: 1836 buildings and resource potential -------------------------
// economy.json (vic3:extract) is loaded the first time this tab opens. A
// country's resources are summed over its states, each weighted by the
// share of the state region's provinces it owns (split states share one
// pool of arable land and resources in-game).
export const SECTORS = [["industry", "Industry", "--art"], ["agriculture", "Agriculture", "--inf"], ["extraction", "Extraction", "--cav"],
                 ["infrastructure", "Infrastructure", "--sotl"], ["government", "Government", "--gov"], ["urban", "Urban", "--other"]];
state.econKind = "buildings"; state.econSort = "total"; state.econDesc = true;
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
// Per-country totals (levels, sectors, resources) from its states, and
// the resource columns. Also run on a loaded save's states.
export function aggregateEconomy(e) {
    for (const c of Object.values(e.countries)) {
      c.levels = {}; c.sectors = {}; c.resources = {};
      for (const st of c.states) {
        for (const [id, n] of Object.entries(st.buildings)) {
          c.levels[id] = (c.levels[id] || 0) + n;
          const sec = e.buildings[id]?.sector; if (sec) c.sectors[sec] = (c.sectors[sec] || 0) + n;
        }
        const add = (id, n, undiscovered = 0) => {
          const r = c.resources[id] ??= { amount: 0, undiscovered: 0 };
          r.amount += n * st.share; r.undiscovered += undiscovered * st.share;
        };
        if (st.arable_owned != null) { const r = c.resources.arable_land ??= { amount: 0, undiscovered: 0 }; r.amount += st.arable_owned; }
        else add("arable_land", st.arable_land);
        for (const [id, n] of Object.entries(st.capped)) add(id, n);
        for (const [id, d] of Object.entries(st.discoverable)) add(id, d.discovered, d.undiscovered);
      }
      c.total = Object.values(c.sectors).reduce((a, b) => a + b, 0);
    }
    // Resource columns: every capped/discoverable resource, most plentiful worldwide first.
    const world = {};
    for (const c of Object.values(e.countries)) for (const [id, r] of Object.entries(c.resources)) world[id] = (world[id] || 0) + r.amount + r.undiscovered;
    e.resourceIds = Object.keys(world).filter(id => id !== "arable_land").sort((a, b) => world[b] - world[a]);
}
export const econOf = c => economy?.countries[c.tag] || { levels: {}, sectors: {}, resources: {}, states: [], total: 0 };
const bIcon = id => economy.buildings[id]?.icon ? `<img class="ico" src="${asset(economy.buildings[id].icon)}" alt="">` : "";
export const bName = id => economy.buildings[id]?.name || id;
export const resName = id => id === "arable_land" ? "Arable land" : bName(id);
const n0 = n => Math.round(n).toLocaleString("en");

export function renderEconomy() {
  if (!economy) { loadEconomy(); document.getElementById("econTable").innerHTML = `<tr><td class="muted">Loading…</td></tr>`; return; }
  const kind = state.econKind;
  document.getElementById("econTabs").innerHTML = [["buildings", state.saveInfo ? "Buildings" : "Buildings in 1836"], ["resources", "Resources"]].map(([k, label]) =>
    `<button data-econ="${k}" class="${k === kind ? "on" : ""}">${label}</button>`).join("") +
    (kind === "buildings" ? `<div class="legend">${SECTORS.map(([, label, v]) => `<span><span class="sw" style="background:var(${v})"></span>${label}</span>`).join("")}</div>` : "");
  document.getElementById("econNote").innerHTML = kind === "buildings"
    ? (state.saveInfo
      ? "Building levels each country has in your save, by sector. Hover over (or tap) a bar for the building types. Military buildings and subsistence farms are left out."
      : "Building levels each country starts with, by sector. Hover over (or tap) a bar for the building types. Military buildings are left out (starting barracks come from the army setup; see the Armies tab).")
    : state.saveInfo
    ? "How much of each resource a country's states can ever support, from your save: arable land is the game's own figure; resource caps are split by the provinces each country actually owns. <i>+N</i> is how much was undiscovered in 1836 (the save doesn't say what's been found since)."
    : "How much of each resource a country's states can ever support: arable land, and the maximum levels of each mine, forestry, fishery and so on. <i>+N</i> is undiscovered (gold, oil, rubber). States split between countries are credited by their share of provinces, which the game does slightly differently, so countries owning part of a state can be off by a few percent (Prussia shows 681 arable land here, 691 in game; countries whose states are all whole match exactly).";

  const list = state.data.countries.filter(c => economy.countries[c.tag] && (state.scope === "all" ? true : isEurope(c)));
  let cols, val, cells;
  if (kind === "buildings") {
    // Urban (services, owner buildings) is tiny in 1836 but the biggest sector by the 1900s.
    const shown = SECTORS.filter(([s]) => s !== "urban" || list.some(c => (econOf(c).sectors.urban || 0) >= 10));
    cols = [["name", "Country"], ["total", "Levels"], ["bar", "By sector"], ...shown.map(([s, l]) => [s, l])];
    val = (c, k) => k === "name" ? c.name : k === "total" || k === "bar" ? econOf(c).total : econOf(c).sectors[k] || 0;
    const max = Math.max(1, ...list.map(c => econOf(c).total));
    cells = c => { const e = econOf(c); return `<td class="num">${e.total}</td>
      <td class="bar" data-tip="econ"><div class="stack" style="width:${e.total / max * 100}%">${SECTORS.map(([s, , v]) => e.sectors[s] ? `<i style="flex:${e.sectors[s]};background:var(${v})"></i>` : "").join("")}</div></td>
      ${shown.map(([s]) => `<td class="num">${e.sectors[s] || "–"}</td>`).join("")}`; };
  } else {
    const ids = ["arable_land", ...economy.resourceIds];
    cols = [["name", "Country"], ...ids.map(id => [id, `${id === "arable_land" ? "" : bIcon(id)}${esc(resName(id).replace(/ (Mines|Camps|Rigs|Plantations|Wharves|Stations)$/, ""))}`])];
    val = (c, k) => k === "name" ? c.name : (econOf(c).resources[k]?.amount || 0) + (econOf(c).resources[k]?.undiscovered || 0);
    cells = c => ids.map(id => { const r = econOf(c).resources[id];
      return `<td class="num">${r && (r.amount >= 0.5 || r.undiscovered >= 0.5) ? `${r.amount >= 0.5 ? n0(r.amount) : "0"}${r.undiscovered >= 0.5 ? ` <i class="muted">+${n0(r.undiscovered)}</i>` : ""}` : "–"}</td>`; }).join("");
  }
  if (!cols.some(([k]) => k === state.econSort)) { state.econSort = kind === "buildings" ? "total" : "arable_land"; state.econDesc = true; }
  list.sort((a, b) => { const x = val(a, state.econSort), y = val(b, state.econSort);
    return (typeof x === "string" ? x.localeCompare(y) : x - y) * (state.econDesc ? -1 : 1); });
  document.getElementById("econTable").innerHTML =
    `<tr>${cols.map(([k, label]) => `<th data-sort="${k}" class="${k === state.econSort ? "sorted" : ""}">${label}${k === state.econSort ? (state.econDesc ? " ↓" : " ↑") : ""}</th>`).join("")}</tr>` +
    list.map(c => `<tr data-tag="${c.tag}" class="${c.tag === state.pinned ? "pinned" : ""}"><td>${flagHtml(c, "")} ${esc(c.name)}</td>${cells(c)}</tr>`).join("");
  renderEconDetail();
}

function renderEconDetail() {
  const c = current(), e = econOf(c), el = document.getElementById("econDetail");
  const states = [...e.states].sort((a, b) => Object.values(b.buildings).reduce((x, y) => x + y, 0) - Object.values(a.buildings).reduce((x, y) => x + y, 0));
  let html = `<div class="top"><div><h2>${esc(c.name)}</h2><div class="meta">${e.states.length} states · ${e.total} building levels</div></div></div>`;
  if (state.econKind === "buildings") {
    for (const [s, label, v] of SECTORS) {
      const ids = Object.keys(e.levels).filter(id => economy.buildings[id]?.sector === s).sort((a, b) => e.levels[b] - e.levels[a]);
      if (!ids.length) continue;
      html += `<h3><span class="sw" style="background:var(${v})"></span>${label} · ${e.sectors[s]}</h3><ul class="blist">` +
        ids.map(id => `<li><span>${bIcon(id)}${esc(bName(id))}</span><span class="v">${e.levels[id]}</span></li>`).join("") + `</ul>`;
    }
    html += `<h3>By state</h3>` + states.map(st => { const ids = Object.entries(st.buildings).sort((a, b) => b[1] - a[1]);
      return `<details><summary>${esc(st.name)} <span class="k">${ids.reduce((n, [, x]) => n + x, 0)}</span></summary><ul>${ids.map(([id, n]) => `<li><span>${bIcon(id)}${esc(bName(id))}</span><span class="v">${n}</span></li>`).join("") || "<li class='muted'>No buildings</li>"}</ul></details>`; }).join("");
  } else {
    const ids = Object.keys(e.resources).sort((a, b) => a === "arable_land" ? -1 : b === "arable_land" ? 1 : (e.resources[b].amount + e.resources[b].undiscovered) - (e.resources[a].amount + e.resources[a].undiscovered));
    html += `<h3>Total potential</h3><ul class="blist">` + ids.map(id => { const r = e.resources[id];
      return `<li><span>${id === "arable_land" ? "" : bIcon(id)}${esc(resName(id))}</span><span class="v">${n0(r.amount)}${r.undiscovered >= 0.5 ? ` <i class="muted">+${n0(r.undiscovered)}</i>` : ""}</span></li>`; }).join("") + `</ul>`;
    const crops = [...new Set(e.states.flatMap(st => st.arable))];
    if (crops.length) html += `<h3>Farms & plantations it can build</h3><ul class="blist">${crops.map(id => `<li><span>${bIcon(id)}${esc(bName(id))}</span><span class="k">${e.states.filter(st => st.arable.includes(id)).length} states</span></li>`).join("")}</ul>`;
    html += `<h3>By state</h3>` + [...e.states].sort((a, b) => b.arable_land * b.share - a.arable_land * a.share).map(st =>
      `<details><summary>${esc(st.name)}${st.share < 1 ? ` <span class="muted">(${Math.round(st.share * 100)}% of region)</span>` : ""} <span class="k">${n0(st.arable_land * st.share)} arable</span></summary><ul>` +
      [...Object.entries(st.capped).map(([id, n]) => [id, n, 0]), ...Object.entries(st.discoverable).map(([id, d]) => [id, d.discovered, d.undiscovered])]
        .map(([id, n, u]) => `<li><span>${bIcon(id)}${esc(bName(id))}</span><span class="v">${n0(n * st.share)}${u ? ` <i class="muted">+${n0(u * st.share)}</i>` : ""}</span></li>`).join("") +
      `<li><span class="muted">Crops: ${esc(st.arable.map(bName).join(", ") || "none")}</span></li></ul></details>`).join("");
  }
  el.innerHTML = html;
}

document.getElementById("econTabs").addEventListener("click", e => {
  const b = e.target.closest("button[data-econ]"); if (!b) return;
  state.econKind = b.dataset.econ; syncHash(); renderEconomy(); renderSidebar();
});
document.getElementById("econTable").addEventListener("click", e => {
  const th = e.target.closest("th");
  if (th) { const k = th.dataset.sort; state.econDesc = state.econSort === k ? !state.econDesc : k !== "name"; state.econSort = k; renderEconomy(); renderSidebar(); return; }
  const tr = e.target.closest("tr[data-tag]"); if (tr) pin(tr.dataset.tag);
});
