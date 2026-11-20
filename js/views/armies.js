// Armies & navies tab: the sortable table of battalions, men, ships and military techs.
import { state } from "../state.js";
import { flagHtml, esc, UNIT_GROUPS, isEurope, battalions, ships, menOf, catCount } from "../helpers.js";
import { pin } from "../page.js";
import { renderSidebar } from "../sidebar.js";

// --- Armies ------------------------------------------------------------
export function renderArmies() {
  const cols = [
    ["name", "Country"], ["battalions", "Battalions"], ["men", "Men"], ["bar", "Army composition"],
    ["ships", "Ships"], ["military", "Military techs"]
  ];
  const val = (c, k) => ({ name: c.name, battalions: battalions(c), men: menOf(c), ships: ships(c), military: catCount(c, "military"), bar: battalions(c) })[k];
  const list = state.data.countries.filter(c => state.scope === "all" ? battalions(c) + ships(c) > 0 : isEurope(c))
    .sort((a, b) => { const x = val(a, state.armySort), y = val(b, state.armySort);
      return (typeof x === "string" ? x.localeCompare(y) : x - y) * (state.armyDesc ? -1 : 1); });
  const maxBat = Math.max(...list.map(battalions), 1);
  const groupCount = (c, g) => Object.values(c.army).filter(u => (UNIT_GROUPS.some(([id]) => id === u.group) ? u.group : "other") === g).reduce((n, u) => n + u.count, 0);
  document.getElementById("armyLegend").innerHTML = [...UNIT_GROUPS, ["other", "Other", "--other"]]
    .map(([, label, v]) => `<span><span class="sw" style="background:var(${v})"></span>${label}</span>`).join("");
  document.getElementById("armyTable").innerHTML =
    `<tr>${cols.map(([k, label]) => `<th data-sort="${k}" class="${k === state.armySort ? "sorted" : ""}">${label}${k === state.armySort ? (state.armyDesc ? " ↓" : " ↑") : ""}</th>`).join("")}</tr>` +
    list.map(c => `<tr data-tag="${c.tag}" class="${c.tag === state.pinned ? "pinned" : ""}">
      <td>${flagHtml(c, "")} ${esc(c.name)}</td>
      <td class="num">${battalions(c)}</td>
      <td class="num">${Math.round(menOf(c)).toLocaleString("en")}</td>
      <td class="bar" data-tip="army"><div class="stack" style="width:${battalions(c) / maxBat * 100}%">
        ${[...UNIT_GROUPS, ["other", "", "--other"]].map(([g, , v]) => { const n = groupCount(c, g); return n ? `<i style="flex:${n};background:var(${v})"></i>` : ""; }).join("")}
      </div></td>
      <td class="num" data-tip="navy">${ships(c) || "–"}</td>
      <td class="num">${catCount(c, "military")}</td>
    </tr>`).join("");
}

document.getElementById("armyTable").addEventListener("click", e => {
  const th = e.target.closest("th");
  if (th) { const k = th.dataset.sort; state.armyDesc = state.armySort === k ? !state.armyDesc : k !== "name"; state.armySort = k; renderArmies(); renderSidebar(); return; }
  const tr = e.target.closest("tr[data-tag]"); if (tr) pin(tr.dataset.tag);
});
