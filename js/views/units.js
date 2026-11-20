// Units & mobilization tab: every army unit, ship and mobilization option in a grid -- a column per era, a row per
// group, so a row read left to right is that group's upgrade path -- each card dimmed by whether the open country
// can build it.
import { state, current } from "../state.js";
import { asset, esc, ERA_NAMES, hasWord, fmtModifier } from "../helpers.js";
import { syncHash, showView } from "../page.js";
import { renderSidebar } from "../sidebar.js";
import { scrollToTech, techStatus } from "./tech.js";

// --- What the tab works out ---------------------------------------------------------------------------------------

// The sub-tabs. state.unitKind is one of these keys, and state.data[kind] is its list of items.
export const UNIT_KINDS = { units: "Army units", ships: "Ships", mobilization: "Mobilization options" };

// The ship stats a card shows; the rest are folded away under "N more stats".
const KEY_SHIP_STATS = ["ship_hit_points_max_add", "ship_armor_add", "ship_hull_damage_add", "ship_crew_damage_add",
                        "ship_accuracy_add", "ship_movement_speed_add", "ship_crew_max_add"];

// The unit stats drawn with a bar, scaled against the strongest unit of any group.
const BARRED_UNIT_STATS = ["unit_offense_add", "unit_defense_add"];

// The era an item comes in: that of the earliest tech that unlocks it (several techs mean "any of these"), or
// "start" when it needs none.
export function itemEra(item) {
  if (!item.requires.length) return "start";
  const eras = state.data.eras;
  const eraIndexes = item.requires.map(id => eras.indexOf(state.techs[id]?.era)).filter(i => i >= 0);
  return eras[Math.min(...eraIndexes)];
}

// Whether a country can build an item: "has" (yes), "av" (one tech away: it can research a tech that unlocks it)
// or "lk" (locked). A mobilization option that needs a power bloc principle is never simply available.
export function itemStatus(c, item) {
  if (!item.requires.length) return item.principles?.length ? "av" : "has";
  if (item.requires.some(id => c.techSet.has(id))) return "has";
  const researchable = id => state.techs[id] && techStatus(c, state.techs[id]) === "av";
  return item.requires.some(researchable) ? "av" : "lk";
}

export const canBuild = (c, kind) => state.data[kind].filter(item => itemStatus(c, item) === "has").length;

// How many of an army unit or ship the country has.
function fieldedCount(c, kind, item) {
  const forces = { units: c.army, ships: c.navy }[kind] || {};
  return forces[item.id]?.count;
}

// A ship the country has the tech to replace.
const isObsolete = (c, ship) => ship.obsolete_with.some(id => c.techSet.has(id));

// The grid's columns (only eras that have something) and rows (groups, in the data's order).
function gridOf(items) {
  const eras = ["start", ...state.data.eras].filter(era => items.some(item => itemEra(item) === era));
  const groups = [...new Map(items.map(item => [item.group, item.group_name]))].map(([id, name]) => ({ id, name }));
  return { eras, groups };
}

// The strongest value of each barred stat, which its bars are drawn against.
function statMaxes(kind, items) {
  if (kind !== "units") return {};
  const strongest = key => Math.max(...items.flatMap(item => item.stats.filter(s => s.key === key).map(s => s.value)));
  return Object.fromEntries(BARRED_UNIT_STATS.map(key => [key, strongest(key)]));
}

// --- Drawing it --------------------------------------------------------------------------------------------------

export function renderUnits() {
  const c = current(), kind = state.unitKind, items = state.data[kind];
  document.getElementById("unitTabs").innerHTML = kindButtons(c, kind) + LEGEND;

  const { eras, groups } = gridOf(items);
  const maxes = statMaxes(kind, items);
  const cell = (group, era) => items
    .filter(item => item.group === group.id && itemEra(item) === era)
    .map(item => unitCard(c, kind, item, maxes)).join("");
  const row = group => `<div class="urow-head">${esc(group.name)}</div>` +
    eras.map(era => `<div class="ucell">${cell(group, era)}</div>`).join("");

  const grid = document.getElementById("unitGrid");
  grid.style.gridTemplateColumns = `var(--rowhead, 110px) repeat(${eras.length}, 206px)`;
  grid.innerHTML = `<div class="ucol-head"></div>` + eras.map(eraHeading).join("") + groups.map(row).join("");
}

// The sub-tab buttons, each with how many of that kind the country can build.
const kindButtons = (c, open) => Object.entries(UNIT_KINDS).map(([kind, label]) =>
  `<button data-kind="${kind}" class="${kind === open ? "on" : ""}">${label}<span>${canBuild(c, kind)}/${state.data[kind].length}</span></button>`
).join("");

const LEGEND = `<div class="legend"><span><i></i>Can build</span><span><i class="av"></i>One tech away</span><span><i class="lk"></i>Locked</span></div>`;

const eraHeading = era => `<div class="ucol-head">${era === "start" ? "No tech needed" : ERA_NAMES[era]}</div>`;

function unitCard(c, kind, item, maxes) {
  const status = itemStatus(c, item);
  const image = item.image || item.icon;
  return `<div class="ucard ${status}">
    ${image ? `<div class="uimg ${kind}"><img src="${asset(image)}" alt="" loading="lazy"></div>` : ""}
    <div class="ubody"><b>${esc(item.name)}</b>
      <div class="ustatus">${statusLine(item, status)}</div>
      <div class="ubadges">${badges(c, kind, item)}</div>
      ${kind === "mobilization" && item.desc ? `<p class="desc">${esc(item.desc)}</p>` : ""}
      ${statsList(kind, item, maxes)}
      ${goodsLines(kind, item)}
    </div></div>`;
}

// Where the item comes from. The techs that unlock it link to the tech tree.
function statusLine(item, status) {
  if (!item.requires.length) {
    if (item.principles?.length) return `Needs power bloc principle: ${esc(item.principles.join(", "))}`;
    return "Available from the start";
  }
  const prefix = { has: "Unlocked by", av: "Researchable: needs", lk: "Locked: needs" }[status];
  return `${prefix} ${techLinks(item.requires)}`;
}

const techLinks = ids => ids
  .filter(id => state.techs[id])
  .map(id => `<span class="link" data-goto="${id}">${esc(state.techs[id].name)}</span>`)
  .join(" or ");

// How many the country has; for ships, whether it's obsolete for this country and which techs make it so.
function badges(c, kind, item) {
  const count = fieldedCount(c, kind, item);
  let html = count ? `<span class="pill">${esc(c.name)} ${hasWord()} ${count}</span>` : "";
  if (kind === "ships") {
    if (isObsolete(c, item)) html += `<span class="pill">Obsolete</span>`;
    if (item.obsolete_with.length) {
      const techs = item.obsolete_with.map(id => state.techs[id]?.name || id).join(", ");
      html += `<span class="pill quiet">Obsolete with ${esc(techs)}</span>`;
    }
  }
  return html;
}

// Units list their stats, mobilization options their effects; ships their key stats, the rest folded away.
function statsList(kind, item, maxes) {
  const list = stats => `<ul class="ustats">${stats.map(stat => statRow(stat, maxes[stat.key])).join("")}</ul>`;
  if (kind !== "ships") return list(kind === "units" ? item.stats : item.effects);
  const key = KEY_SHIP_STATS.map(k => item.stats.find(s => s.key === k)).filter(Boolean);
  const rest = item.stats.filter(s => !KEY_SHIP_STATS.includes(s.key));
  const more = rest.length ? `<details><summary>${rest.length} more stats</summary>${list(rest)}</details>` : "";
  return list(key) + more;
}

function statRow(stat, max) {
  const bar = max ? `<span class="bar"><i style="width:${stat.value / max * 100}%"></i></span>` : "";
  return `<li><span>${esc(stat.name)}</span><span class="v">${fmtModifier(stat)}</span>${bar}</li>`;
}

// The goods it takes: to build and keep a ship, to keep a unit or an option, and what an option needs on the market.
function goodsLines(kind, item) {
  const line = (label, goods) => goods.length ? `<div class="ugoods">${label}: ${goodsText(goods)}</div>` : "";
  if (kind === "ships") return line("Build", item.construction) + line("Upkeep", item.materiel);
  const market = kind === "mobilization" && item.market_goods.length
    ? `<div class="ugoods">Needs in the market: <span>${esc(item.market_goods.join(", "))}</span></div>` : "";
  return market + line("Upkeep", item.upkeep);
}

const goodsText = goods => goods.map(g => `<span>${esc(g.name)}</span> ${+g.value.toFixed(2)}`).join(" · ");

// --- Clicks ------------------------------------------------------------------------------------------------------

document.getElementById("unitTabs").addEventListener("click", e => {
  const button = e.target.closest("button[data-kind]");
  if (!button) return;
  state.unitKind = button.dataset.kind;
  syncHash(); renderUnits(); renderSidebar();
});

// A tech named on a card opens it in the tech tree.
document.getElementById("unitGrid").addEventListener("click", e => {
  const id = e.target.closest("[data-goto]")?.dataset.goto;
  if (!id) return;
  state.category = state.techs[id].category; state.focusTech = id;
  history.replaceState(null, "", "#" + state.pinned + "/" + id);
  showView("techView", { sync: false }); renderSidebar(); scrollToTech(id);
});
