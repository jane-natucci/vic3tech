// Armies & navies tab: the sortable table of battalions, men, ships and military techs, the army composition bar,
// and what the army and navy tooltips show.
import { state } from "../state.js";
import { flagHtml, esc, isEurope, battalions, ships, menOf, catCount } from "../helpers.js";
import { pin } from "../page.js";
import { renderSidebar } from "../sidebar.js";
import { sortRows, headerRow, nextSort } from "../table.js";
import { tipRow } from "../tooltip.js";

// --- What the tab works out ---------------------------------------------------------------------------------------

// The unit groups the composition bar shows, each with its colour (a CSS variable). Units of any other group
// (the game has a few more) are counted as "Other".
export const ARMY_GROUPS = [
  { id: "infantry", label: "Infantry", color: "--inf" },
  { id: "cavalry", label: "Cavalry", color: "--cav" },
  { id: "artillery", label: "Artillery", color: "--art" },
  { id: "other", label: "Other", color: "--other" },
];
const groupOf = unit => ARMY_GROUPS.some(g => g.id === unit.group && g.id !== "other") ? unit.group : "other";

// A country's army by group, in the order above, with each group's unit types biggest first. Groups it has
// no battalions in are left out.
export function armyByGroup(country) {
  return ARMY_GROUPS
    .map(group => {
      const units = Object.values(country.army).filter(u => groupOf(u) === group.id).sort((a, b) => b.count - a.count);
      return { ...group, units, count: units.reduce((n, u) => n + u.count, 0) };
    })
    .filter(group => group.count > 0);
}

// The table's columns: each one's header, and what it shows and sorts by.
const COLUMNS = [
  { key: "name", label: "Country", value: c => c.name },
  { key: "battalions", label: "Battalions", value: battalions },
  { key: "men", label: "Men", value: menOf },
  { key: "bar", label: "Army composition", value: battalions },
  { key: "ships", label: "Ships", value: ships },
  { key: "military", label: "Military techs", value: c => catCount(c, "military") },
];

// Europe; with "Whole world", every country that has an army or a navy.
const shownCountries = () =>
  state.data.countries.filter(c => state.scope === "all" ? battalions(c) + ships(c) > 0 : isEurope(c));

// --- Drawing it --------------------------------------------------------------------------------------------------

export function renderArmies() {
  const column = COLUMNS.find(col => col.key === state.armySort);
  const countries = sortRows(shownCountries(), column.value, state.armyDesc);
  const biggest = Math.max(...countries.map(battalions), 1);

  document.getElementById("armyLegend").innerHTML = ARMY_GROUPS.map(legendItem).join("");
  document.getElementById("armyTable").innerHTML =
    headerRow(COLUMNS, state.armySort, state.armyDesc) + countries.map(c => countryRow(c, biggest)).join("");
}

function countryRow(c, biggest) {
  return `<tr data-tag="${c.tag}" class="${c.tag === state.pinned ? "pinned" : ""}">
    <td>${flagHtml(c, "")} ${esc(c.name)}</td>
    <td class="num">${battalions(c)}</td>
    <td class="num">${Math.round(menOf(c)).toLocaleString("en")}</td>
    <td class="bar" data-tip="army">${compositionBar(c, biggest)}</td>
    <td class="num" data-tip="navy">${ships(c) || "–"}</td>
    <td class="num">${catCount(c, "military")}</td>
  </tr>`;
}

// As long as the country's army compared with the biggest in the table, split into its unit groups.
function compositionBar(c, biggest) {
  const parts = armyByGroup(c).map(g => `<i style="flex:${g.count};background:var(${g.color})"></i>`).join("");
  return `<div class="stack" style="width:${battalions(c) / biggest * 100}%">${parts}</div>`;
}

const legendItem = group => `<span><span class="sw" style="background:var(${group.color})"></span>${group.label}</span>`;

// The tooltips over the composition bar and the ships column.
export function armyTip(c) {
  const total = battalions(c);
  return `<b>${esc(c.name)} · ${total} battalions</b>` + armyByGroup(c).map(g =>
    tipRow("g", `${g.label} (${Math.round(g.count / total * 100)}%)`, g.count, g.color) +
    g.units.map(u => tipRow("u", u.name, u.count)).join("")
  ).join("");
}

export function navyTip(c) {
  const shipTypes = Object.values(c.navy).sort((a, b) => b.count - a.count);
  const rows = shipTypes.map(s => tipRow("u", s.name, s.count)).join("") || `<div class="u">No starting navy</div>`;
  return `<b>${esc(c.name)} · ${ships(c)} ships</b>` + rows;
}

// --- How the rest of the page sees this tab (see allTabs in page.js) --------------------------------------------

export const armiesTab = {
  view: "armyView", hash: "army", followsScope: true,
  render: renderArmies,
  // The sidebar follows the table's sort column (battalions when it's sorted by name or by the bar).
  ranking() {
    return {
      ships: { label: "ships", value: ships },
      military: { label: "military techs", value: c => catCount(c, "military"), total: state.layout.military.techs.length },
      men: { label: "men", value: menOf },
    }[state.armySort] || { label: "battalions", value: battalions };
  },
};

// --- Clicks ------------------------------------------------------------------------------------------------------

document.getElementById("armyTable").addEventListener("click", e => {
  const header = e.target.closest("th");
  if (header) {
    const next = nextSort(header.dataset.sort, state.armySort, state.armyDesc);
    state.armySort = next.sortKey; state.armyDesc = next.desc;
    renderArmies(); renderSidebar();
    return;
  }
  const row = e.target.closest("tr[data-tag]");
  if (row) pin(row.dataset.tag);
});
