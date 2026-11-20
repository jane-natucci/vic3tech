// Technology tab: the tech tree of one category for the open country -- what it has, can research, or can't yet --
// and the panel for the open tech: what it does, what it costs that country, and which countries have it.
import { state, current } from "../state.js";
import { asset, flagHtml, esc, ERA_NAMES, isEurope, battalions, hasWord, catCount, fmtModifier, noHover, isPhone } from "../helpers.js";
import { render } from "../page.js";
import { renderSidebar } from "../sidebar.js";

// Sizes in pixels: a tech's box, the gaps between boxes, and the room above the first row for the era names.
const NODE_W = 172, NODE_H = 48, COL_GAP = 46, ROW_GAP = 12, HEAD = 44;
const columnX = col => col * (NODE_W + COL_GAP);
const rowY = row => HEAD + row * (NODE_H + ROW_GAP);

// --- What the tab works out ---------------------------------------------------------------------------------------

// Whether a country has a tech, can research it (it has every prerequisite), or not yet: "has", "av" or "lk".
export function techStatus(c, t) {
  if (c.techSet.has(t.id)) return "has";
  return t.requires.every(id => c.techSet.has(id)) ? "av" : "lk";
}

// Research cost as the game computes it: the era's base cost, plus the ahead-of-time penalty -- for every tech of
// the same category from an earlier era the country doesn't have, a share of the base cost per era of gap.
export function researchCost(c, t) {
  const R = state.data.research, eras = state.data.eras, base = R.era_cost[t.era];
  const eraGap = other => eras.indexOf(t.era) - eras.indexOf(other.era);
  const missing = state.data.techs.filter(o => o.category === t.category && !c.techSet.has(o.id) && eraGap(o) > 0);
  const penalty = missing.reduce((sum, o) => sum + R.ahead_of_time_penalty * base * eraGap(o), 0);
  return { base, penalty, total: base + penalty, missing: missing.length };
}

// --- Laying out the tree -----------------------------------------------------------------------------------------

// Each category's tree (state.layout[category]): where each tech's box goes, the era columns, and the size.
// Columns: eras left to right, and within an era one column per step of a same-era prerequisite chain
// (Navigation -> Drydocks). Rows: each tech goes to the free row nearest the average row of its prerequisites.
export function layoutTrees() {
  state.layout = {};
  for (const category of state.data.categories) state.layout[category] = layoutCategory(category);
}

function layoutCategory(category) {
  const techs = state.data.techs.filter(t => t.category === category);
  const depth = chainDepths(techs);
  const { eraCols, columns } = eraColumns(techs, depth);
  const pos = placeRows(techs, t => eraCols[t.era].start + depth[t.id], columns);
  const rows = Math.max(...Object.values(pos).map(p => p.row)) + 1;
  return { techs, pos, eraCols, width: columnX(columns), height: rowY(rows) };
}

// How far down a chain of same-era prerequisites in the category each tech is: Navigation 0, Drydocks 1.
function chainDepths(techs) {
  const inCategory = new Set(techs.map(t => t.id)), depth = {};
  const depthOf = t => depth[t.id] ??= Math.max(-1, ...t.requires.map(id => state.techs[id])
    .filter(p => inCategory.has(p.id) && p.era === t.era).map(depthOf)) + 1;
  techs.forEach(depthOf);
  return depth;
}

// Each era's first column and how many columns it takes (its longest chain).
function eraColumns(techs, depth) {
  const eraCols = {};
  let columns = 0;
  for (const era of state.data.eras) {
    const width = Math.max(0, ...techs.filter(t => t.era === era).map(t => depth[t.id])) + 1;
    eraCols[era] = { start: columns, width };
    columns += width;
  }
  return { eraCols, columns };
}

// The rows, a column at a time from the left. Techs whose prerequisites sit higher up go first (then by name);
// techs with no prerequisites placed yet take the first free rows.
function placeRows(techs, columnOf, columns) {
  const pos = {};
  for (let col = 0; col < columns; col++) {
    const taken = new Set();
    const queue = techs.filter(t => columnOf(t) === col).map(t => ({ t, want: averageRow(t, pos) }))
      .sort((a, b) => (a.want ?? 1e9) - (b.want ?? 1e9) || a.t.name.localeCompare(b.t.name));
    for (const { t, want } of queue) {
      const row = want === null ? firstFreeRow(taken) : nearestFreeRow(taken, want);
      taken.add(row);
      pos[t.id] = { col, row, x: columnX(col), y: rowY(row) };
    }
  }
  return pos;
}

// The average row of a tech's prerequisites already placed (in earlier columns), or null if none are.
function averageRow(t, pos) {
  const rows = t.requires.filter(id => pos[id]).map(id => pos[id].row);
  return rows.length ? rows.reduce((a, b) => a + b) / rows.length : null;
}

function firstFreeRow(taken) {
  let row = 0;
  while (taken.has(row)) row++;
  return row;
}

// The free row nearest the wanted one, looking one further down, then one further up, and so on.
function nearestFreeRow(taken, want) {
  const wanted = Math.max(0, Math.round(want));
  for (let d = 0; ; d++) {
    if (!taken.has(wanted + d)) return wanted + d;
    if (wanted - d >= 0 && !taken.has(wanted - d)) return wanted - d;
  }
}

// Scrolls a tech into view, a little in from the top-left so its prerequisites show too.
export function scrollToTech(id) {
  const p = state.layout[state.category]?.pos[id];
  if (!p) return;
  document.getElementById("treeWrap").scrollTo({ left: p.x - 200, top: p.y - 120, behavior: "smooth" });
}

// --- Drawing the tree --------------------------------------------------------------------------------------------

export function renderTree() {
  const c = current(), L = state.layout[state.category];
  const tree = document.getElementById("tree");
  tree.style.width = L.width + "px"; tree.style.height = L.height + "px";
  tree.innerHTML = state.data.eras.map(era => eraBand(era, L.eraCols[era])).join("") +
    arrows(c, L) + L.techs.map(t => techBox(c, t, L)).join("");
}

// An era's background band, with its name, from halfway into the gap before its first column.
const eraBand = (era, cols) =>
  `<div class="era-band" style="left:${columnX(cols.start) - COL_GAP / 2}px;width:${columnX(cols.width)}px"><h2>${ERA_NAMES[era] || era}</h2></div>`;

// The arrow heads: plain, lit (the country has both ends) and highlighted (the open tech's).
const ARROW_HEADS = [["hd", "--arrow"], ["hd-on", "--arrow-on"], ["hd-hl", "--accent"]].map(([id, color]) =>
  `<marker id="${id}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="var(${color})"/></marker>`
).join("");

// An arrow from each prerequisite in the category to the tech.
function arrows(c, L) {
  const paths = L.techs.flatMap(t => t.requires.filter(id => L.pos[id]).map(id => arrow(c, id, t.id, L)));
  return `<svg width="${L.width}" height="${L.height}"><defs>
    ${ARROW_HEADS}
    </defs>${paths.join("")}</svg>`;
}

// A curve from the right edge of one box to the left edge of the other, bending halfway.
function arrow(c, fromId, toId, L) {
  const from = L.pos[fromId], to = L.pos[toId];
  const x1 = from.x + NODE_W, y1 = from.y + NODE_H / 2, x2 = to.x - 3, y2 = to.y + NODE_H / 2, mid = (x1 + x2) / 2;
  const lit = c.techSet.has(fromId) && c.techSet.has(toId);
  const highlighted = state.focusTech && (state.focusTech === toId || state.focusTech === fromId);
  const head = highlighted ? "hd-hl" : lit ? "hd-on" : "hd";
  return `<path class="arr${lit ? " on" : ""}${highlighted ? " hl" : ""}" marker-end="url(#${head})" d="M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}"/>`;
}

// A tech's box, coloured by the country's status; ↗ marks prerequisites from another category.
function techBox(c, t, L) {
  const p = L.pos[t.id];
  const elsewhere = t.requires.filter(id => !L.pos[id]);
  const alsoNeeds = elsewhere.length
    ? `<span class="x" title="Also needs: ${esc(elsewhere.map(id => state.techs[id].name).join(", "))}">↗</span>` : "";
  return `<div class="node ${techStatus(c, t)}${state.focusTech === t.id ? " focus" : ""}" data-tech="${t.id}" style="left:${p.x}px;top:${p.y}px;width:${NODE_W}px;height:${NODE_H}px">
    ${t.icon ? `<img src="${asset(t.icon)}" alt="" loading="lazy">` : ""}<span>${esc(t.name)}</span>
    ${alsoNeeds}</div>`;
}

const capitalize = s => s[0].toUpperCase() + s.slice(1);

// The category buttons, each with how many of its techs the country has, and the colour legend.
export function renderSubtabs() {
  const c = current();
  const button = category =>
    `<button data-cat="${category}" class="${category === state.category ? "on" : ""}">${capitalize(category)}<span>${catCount(c, category)}/${state.layout[category].techs.length}</span></button>`;
  document.getElementById("subtabs").innerHTML = state.data.categories.map(button).join("") +
    `<div class="legend"><span><i></i>Has it</span><span><i class="av"></i>Can research</span><span><i class="lk"></i>Locked</span></div>`;
}

// --- The open tech's panel ---------------------------------------------------------------------------------------

export function renderDetail() {
  const el = document.getElementById("detail");
  const t = state.techs[state.focusTech];
  if (!t) {
    el.innerHTML = `<p class="empty">Hover over a technology to see what it does and which countries start with it.</p>`;
    return;
  }
  const c = current(), status = techStatus(c, t);
  const statusText = { has: `${c.name} ${hasWord()} this`, av: `${c.name} can research this`, lk: `${c.name} is missing prerequisites` }[status];
  const techLink = id => `<span class="link" data-goto="${id}">${esc(state.techs[id].name)}</span>`;
  el.innerHTML = `<button type="button" class="sheet-close" data-close aria-label="Close">✕</button>
    <div class="top">${t.icon ? `<img src="${asset(t.icon)}" alt="">` : ""}<div><h2>${esc(t.name)}</h2>
      <div class="meta">${ERA_NAMES[t.era] || t.era} · ${capitalize(t.category)}</div></div></div>
    <span class="pill status">${esc(statusText)}</span>
    ${t.desc ? `<h3>Description</h3><p class="desc">${esc(t.desc)}</p>` : ""}
    ${t.modifiers.length ? `<h3>Effects</h3><ul>${t.modifiers.map(m => `<li><span>${esc(m.name)}</span><span class="v">${fmtModifier(m)}</span></li>`).join("")}</ul>` : ""}
    ${t.unlocks.length ? `<h3>Unlocks</h3><ul>${t.unlocks.map(u => `<li><span>${esc(u.name)}</span><span class="k">${esc(u.kind)}</span></li>`).join("")}</ul>` : ""}
    ${researchSection(c, t, status)}
    ${t.requires.length ? `<h3>Requires</h3><p>${t.requires.map(techLink).join(", ")}</p>` : ""}
    ${countriesWith(t)}`;
}

// Years at a steady number of innovation points a week. Only an estimate: real innovation depends on universities
// and literacy, and tech spread gives free progress on top.
const TYPICAL_INNOVATION = 100;

function researchSection(c, t, status) {
  const R = state.data.research, cost = researchCost(c, t);
  const points = n => Math.round(n).toLocaleString("en");
  const years = perWeek => (cost.total / (perWeek * 52)).toFixed(1);
  const row = (label, value, { cls = "v", title } = {}) =>
    `<li><span${title ? ` title="${title}"` : ""}>${label}</span><span class="${cls}">${value}</span></li>`;
  const eraName = ERA_NAMES[t.era]?.split(" ·")[0] || t.era;
  const rows = [row(`Base cost (${eraName})`, points(cost.base))];
  if (status === "has") {
    rows.push(row(esc(c.name), "already has it", { cls: "k" }));
  } else {
    if (cost.penalty) {
      const title = `The game's ahead-of-time penalty: ${cost.missing} earlier-era ${t.category} techs missing`;
      rows.push(row(`+ ahead-of-time penalty for ${esc(c.name)}`, points(cost.penalty), { title }));
    }
    rows.push(row(`Total for ${esc(c.name)}`, points(cost.total)));
    rows.push(row(`≈ at ${R.base_innovation}/week (base innovation, no universities)`, `${years(R.base_innovation)} yrs`));
    rows.push(row(`≈ at ${TYPICAL_INNOVATION}/week (estimate for a developed power)`, `${years(TYPICAL_INNOVATION)} yrs`));
  }
  return `<h3>Research cost</h3><ul>${rows.join("")}</ul>`;
}

// The European countries that have the tech and those that don't, biggest army first.
function countriesWith(t) {
  const europe = state.data.countries.filter(isEurope).sort((a, b) => battalions(b) - battalions(a));
  const holders = europe.filter(x => x.techSet.has(t.id)), lacking = europe.filter(x => !x.techSet.has(t.id));
  const flags = list => list.map(x => flagHtml(x, "")).join("");
  return `<h3>European countries that ${state.saveInfo ? "have" : "start with"} it (${holders.length}/${europe.length})</h3>
    <div class="flags">${flags(holders) || "<em>None</em>"}</div>
    ${lacking.length && holders.length ? `<h3>…and those that don't</h3><div class="flags">${flags(lacking)}</div>` : ""}`;
}

// --- How the rest of the page sees this tab (see allTabs in page.js) --------------------------------------------

export const techTab = {
  view: "techView", hash: null,
  // Drawn on every redraw, even while another tab is open (it always has been; it's cheap).
  alwaysDrawn: true,
  render() { renderSubtabs(); renderTree(); renderDetail(); },
  // The sidebar ranks countries by how many techs of the open category they have. It's also the ranking for a
  // tab that has none to offer yet.
  ranking() {
    const category = state.category;
    return { label: `${category} techs`, value: c => catCount(c, category), total: state.layout[category].techs.length };
  },
};

// --- Clicks and hovering -----------------------------------------------------------------------------------------

document.getElementById("subtabs").addEventListener("click", e => {
  const button = e.target.closest("button[data-cat]");
  if (!button) return;
  state.category = button.dataset.cat; state.focusTech = null;
  renderSidebar(); render();
});

const tree = document.getElementById("tree");

// Hovering a tech opens it in the panel (not on touch screens, where a tap does).
tree.addEventListener("mouseover", e => {
  if (noHover) return;
  const box = e.target.closest(".node");
  if (box && box.dataset.tech !== state.focusTech) { state.focusTech = box.dataset.tech; renderTree(); renderDetail(); }
});

// A click also writes the tech into the address, so a link copied from it reopens on this tech for this country.
// On a phone the panel opens as a sheet.
tree.addEventListener("click", e => {
  const box = e.target.closest(".node");
  if (!box) return;
  state.focusTech = box.dataset.tech;
  history.replaceState(null, "", "#" + state.pinned + "/" + state.focusTech);
  renderTree(); renderDetail();
  if (isPhone()) document.body.classList.add("sheet-open");
});

// In the panel: ✕ closes the phone sheet; a required tech opens that tech, in its own category.
document.getElementById("detail").addEventListener("click", e => {
  if (e.target.closest("[data-close]")) { document.body.classList.remove("sheet-open"); return; }
  const id = e.target.closest("[data-goto]")?.dataset.goto;
  if (!id) return;
  state.category = state.techs[id].category; state.focusTech = id;
  history.replaceState(null, "", "#" + state.pinned + "/" + state.focusTech);
  renderSidebar(); render(); scrollToTech(id);
});
