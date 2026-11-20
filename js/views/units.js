// Units & mobilization tab: every unit, ship and mobilization option by era, dimmed by what the country can build.
import { state, current } from "../state.js";
import { asset, esc, ERA_NAMES, hasWord, fmtModifier } from "../helpers.js";
import { syncHash, showView } from "../page.js";
import { renderSidebar } from "../sidebar.js";
import { scrollToTech, techStatus } from "./tech.js";

// --- Units, ships, mobilization options ------------------------------------
// One grid per kind: columns are the era of the earliest tech that unlocks
// an item (the game treats several unlocking techs as "any of these"),
// rows are its group, so reading a row left to right is its upgrade path.
export const UNIT_KINDS = { units: "Army units", ships: "Ships", mobilization: "Mobilization options" };
const KEY_SHIP_STATS = ["ship_hit_points_max_add", "ship_armor_add", "ship_hull_damage_add", "ship_crew_damage_add",
                        "ship_accuracy_add", "ship_movement_speed_add", "ship_crew_max_add"];
const itemEra = item => item.requires.length
  ? state.data.eras[Math.min(...item.requires.map(id => state.data.eras.indexOf(state.techs[id]?.era)).filter(i => i >= 0))]
  : "start";
function itemStatus(c, item) {
  if (!item.requires.length) return item.principles?.length ? "av" : "has";
  if (item.requires.some(id => c.techSet.has(id))) return "has";
  return item.requires.some(id => state.techs[id] && techStatus(c, state.techs[id]) === "av") ? "av" : "lk";
}
export const canBuild = (c, kind) => state.data[kind].filter(i => itemStatus(c, i) === "has").length;
const techLinks = ids => ids.filter(id => state.techs[id]).map(id => `<span class="link" data-goto="${id}">${esc(state.techs[id].name)}</span>`).join(" or ");
const goodsText = list => list.map(g => `<span>${esc(g.name)}</span> ${+g.value.toFixed(2)}`).join(" · ");

function unitCard(c, kind, item, maxes) {
  const st = itemStatus(c, item);
  const status = !item.requires.length
    ? (item.principles?.length ? `Needs power bloc principle: ${esc(item.principles.join(", "))}` : "Available from the start")
    : `${st === "has" ? "Unlocked by" : st === "av" ? "Researchable: needs" : "Locked: needs"} ${techLinks(item.requires)}`;
  const fielded = (kind === "units" ? c.army : kind === "ships" ? c.navy : {})[item.id]?.count;
  const obsolete = kind === "ships" && item.obsolete_with.some(id => c.techSet.has(id));
  const statRow = m => {
    const bar = maxes[m.key] ? `<span class="bar"><i style="width:${m.value / maxes[m.key] * 100}%"></i></span>` : "";
    return `<li><span>${esc(m.name)}</span><span class="v">${fmtModifier(m)}</span>${bar}</li>`;
  };
  let stats;
  if (kind === "ships") {
    const key = KEY_SHIP_STATS.map(k => item.stats.find(m => m.key === k)).filter(Boolean);
    const rest = item.stats.filter(m => !KEY_SHIP_STATS.includes(m.key));
    stats = `<ul class="ustats">${key.map(statRow).join("")}</ul>` +
      (rest.length ? `<details><summary>${rest.length} more stats</summary><ul class="ustats">${rest.map(statRow).join("")}</ul></details>` : "");
  } else {
    stats = `<ul class="ustats">${(kind === "units" ? item.stats : item.effects).map(statRow).join("")}</ul>`;
  }
  const goods = kind === "ships"
    ? `${item.construction.length ? `<div class="ugoods">Build: ${goodsText(item.construction)}</div>` : ""}${item.materiel.length ? `<div class="ugoods">Upkeep: ${goodsText(item.materiel)}</div>` : ""}`
    : item.upkeep.length ? `<div class="ugoods">Upkeep: ${goodsText(item.upkeep)}</div>` : "";
  const img = item.image || item.icon;
  return `<div class="ucard ${st}">
    ${img ? `<div class="uimg ${kind}"><img src="${asset(img)}" alt="" loading="lazy"></div>` : ""}
    <div class="ubody"><b>${esc(item.name)}</b>
      <div class="ustatus">${status}</div>
      <div class="ubadges">
        ${fielded ? `<span class="pill">${esc(c.name)} ${hasWord()} ${fielded}</span>` : ""}
        ${obsolete ? `<span class="pill">Obsolete</span>` : ""}
        ${kind === "ships" && item.obsolete_with.length ? `<span class="pill" style="background:none;border:1px solid var(--line);color:var(--muted)">Obsolete with ${esc(item.obsolete_with.map(id => state.techs[id]?.name || id).join(", "))}</span>` : ""}
      </div>
      ${kind === "mobilization" && item.desc ? `<p class="desc">${esc(item.desc)}</p>` : ""}
      ${stats}
      ${kind === "mobilization" && item.market_goods.length ? `<div class="ugoods">Needs in the market: <span>${esc(item.market_goods.join(", "))}</span></div>` : ""}
      ${goods}
    </div></div>`;
}

export function renderUnits() {
  const c = current(), kind = state.unitKind, items = state.data[kind];
  document.getElementById("unitTabs").innerHTML = Object.entries(UNIT_KINDS).map(([k, label]) =>
    `<button data-kind="${k}" class="${k === kind ? "on" : ""}">${label}<span>${canBuild(c, k)}/${state.data[k].length}</span></button>`).join("") +
    `<div class="legend"><span><i></i>Can build</span><span><i class="av"></i>One tech away</span><span><i class="lk"></i>Locked</span></div>`;

  const cols = ["start", ...state.data.eras].filter(e => items.some(i => itemEra(i) === e));
  const groups = [...new Map(items.map(i => [i.group, i.group_name])).entries()];
  // Offense/defense bars are scaled against the strongest unit of any group.
  const maxes = {};
  if (kind === "units") for (const k of ["unit_offense_add", "unit_defense_add"])
    maxes[k] = Math.max(...items.flatMap(i => i.stats.filter(m => m.key === k).map(m => m.value)));

  const grid = document.getElementById("unitGrid");
  grid.style.gridTemplateColumns = `var(--rowhead, 110px) repeat(${cols.length}, 206px)`;
  grid.innerHTML = `<div class="ucol-head"></div>` +
    cols.map(e => `<div class="ucol-head">${e === "start" ? "No tech needed" : ERA_NAMES[e]}</div>`).join("") +
    groups.map(([g, name]) => `<div class="urow-head">${esc(name)}</div>` + cols.map(e =>
      `<div class="ucell">${items.filter(i => i.group === g && itemEra(i) === e).map(i => unitCard(c, kind, i, maxes)).join("")}</div>`).join("")).join("");
}

document.getElementById("unitTabs").addEventListener("click", e => {
  const b = e.target.closest("button[data-kind]"); if (!b) return;
  state.unitKind = b.dataset.kind; syncHash(); renderUnits(); renderSidebar();
});
// A tech named on a unit card jumps to it in the tech tree.
document.getElementById("unitGrid").addEventListener("click", e => {
  const id = e.target.closest("[data-goto]")?.dataset.goto; if (!id) return;
  state.category = state.techs[id].category; state.focusTech = id;
  history.replaceState(null, "", "#" + state.pinned + "/" + id);
  showView("techView", { sync: false }); renderSidebar(); scrollToTech(id);
});
