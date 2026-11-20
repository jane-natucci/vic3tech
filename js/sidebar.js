// The country list on the left: search, Europe / Whole world, and ranking by whatever the open tab is about.
import { state } from "./state.js";
import { flagHtml, esc, isEurope, battalions, ships, menOf, catCount, viewOn, noHover, isPhone } from "./helpers.js";
import { render, pin } from "./page.js";
import { renderArmies } from "./views/armies.js";
import { UNIT_KINDS, canBuild } from "./views/units.js";
import { SECTORS, economy, econOf, resName, resourceTotal, renderEconomy } from "./views/economy.js";
import { treatiesOf, renderTrade } from "./views/trade.js";
import { progressiveness, renderLaws } from "./views/laws.js";

// --- Sidebar / header --------------------------------------------------
// The sidebar ranks countries by whatever the open tab is about: tech
// count in the open tech category, the army table's sort column,
// buildable units/ships/options, or the economy table's sort column.
// Ties go to the bigger army, then the name.
function sidebarMetric() {
  const numeric = (label, value, total) => ({ label, value, total });
  if (viewOn("armyView")) {
    return {
      ships: numeric("ships", ships),
      military: numeric("military techs", c => catCount(c, "military"), state.layout.military.techs.length),
      men: numeric("men", menOf)
    }[state.armySort] || numeric("battalions", battalions);
  }
  if (viewOn("lawView")) return numeric("progressiveness", progressiveness);
  if (viewOn("tradeView")) return state.tradeKind === "centers"
    ? numeric("trade center levels", c => econOf(c).levels?.building_trade_center || 0)
    : numeric("treaties", c => treatiesOf(c.tag).length);
  if (viewOn("unitView")) {
    const kind = state.unitKind;
    return numeric(`${UNIT_KINDS[kind].toLowerCase()} it can build`, c => canBuild(c, kind), state.data[kind].length);
  }
  if (viewOn("economyView") && economy) {
    const k = state.econSort;
    if (state.econKind === "resources") {
      const id = k === "name" ? "arable_land" : k;
      return numeric(resName(id).toLowerCase(), c => Math.round(resourceTotal(c, id)));
    }
    const sector = SECTORS.find(s => s.id === k);
    return sector ? numeric(`${sector.label.toLowerCase()} building levels`, c => econOf(c).sectors[k] || 0)
                  : numeric("building levels", c => econOf(c).total);
  }
  const cat = state.category;
  return numeric(`${cat} techs`, c => catCount(c, cat), state.layout[cat].techs.length);
}

export function renderSidebar() {
  const q = document.getElementById("search").value.trim().toLowerCase();
  const m = sidebarMetric();
  const plain = x => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const match = c => !q || plain(c.name).includes(plain(q)) || plain(state.data.country_names?.[c.tag] || "").includes(plain(q)) || c.tag.toLowerCase() === q;
  // A search always looks through every country, whatever the scope.
  const inScope = c => q || state.scope === "all" || isEurope(c);
  const list = state.data.countries.filter(c => inScope(c) && match(c))
    .sort((a, b) => m.value(b) - m.value(a) || battalions(b) - battalions(a) || a.name.localeCompare(b.name));
  const max = m.total || Math.max(1, ...list.map(m.value));
  // Progressiveness goes negative: meters then start from the lowest value.
  const min = Math.min(0, ...list.map(m.value));
  const row = c => `<div class="country${c.tag === state.pinned ? " pinned" : ""}" data-tag="${c.tag}">
      ${flagHtml(c)}<span class="name">${esc(c.name)}</span><span class="count">${m.value(c).toLocaleString("en")}${m.total ? `/${m.total}` : ""}</span>
      <span class="meter"><i style="width:${(m.value(c) - min) / (max - min || 1) * 100}%"></i></span></div>`;
  const label = state.scope === "all" ? "All countries" : "Europe";
  document.getElementById("countries").innerHTML =
    list.length ? `<h3>${label} · by ${esc(m.label)}</h3>${list.map(row).join("")}` : `<p class="hint">No matches.</p>`;
}

const aside = document.querySelector("aside");
aside.addEventListener("mouseover", e => {
  if (noHover) return;
  const row = e.target.closest(".country");
  if (row && row.dataset.tag !== state.preview) { state.preview = row.dataset.tag; render(); }
});
aside.addEventListener("mouseleave", () => { if (state.preview) { state.preview = null; render(); } });

// Phones: the header's country button opens the full-screen country picker.
document.getElementById("current").addEventListener("click", () => {
  if (!isPhone()) return;
  document.body.classList.add("picker-open");
  aside.scrollTop = 0;
});
document.getElementById("pickerDone").addEventListener("click", () => document.body.classList.remove("picker-open"));
aside.addEventListener("click", e => { const row = e.target.closest(".country"); if (row) pin(row.dataset.tag); });
document.getElementById("search").addEventListener("input", renderSidebar);

document.querySelectorAll("input[name=scope]").forEach(r => r.addEventListener("change", () => {
  state.scope = r.value;
  renderSidebar();
  if (viewOn("armyView")) renderArmies();
  if (viewOn("economyView")) renderEconomy();
  if (viewOn("tradeView")) renderTrade();
  if (viewOn("lawView")) renderLaws();
}));
