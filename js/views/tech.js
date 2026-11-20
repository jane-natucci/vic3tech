// Technology tab: laying out the tree, drawing it, and the detail panel for the hovered tech.
import { state, current } from "../state.js";
import { asset, flagHtml, esc, ERA_NAMES, isEurope, battalions, hasWord, catCount, fmtModifier, noHover, isPhone } from "../helpers.js";
import { render } from "../page.js";
import { renderSidebar } from "../sidebar.js";

const NODE_W = 172, NODE_H = 48, COL_GAP = 46, ROW_GAP = 12, HEAD = 44;

export function scrollToTech(id) {
  const p = state.layout[state.category]?.pos[id];
  if (!p) return;
  document.getElementById("treeWrap").scrollTo({ left: p.x - 200, top: p.y - 120, behavior: "smooth" });
}

// --- Tree layout -------------------------------------------------------
// Columns: eras left to right, and within an era, one column per step of
// same-era prerequisite chain (e.g. Navigation -> Drydocks). Rows: each
// tech goes to the free row nearest the average row of its prerequisites.
export function layoutTrees() {
  state.layout = {};
  for (const cat of state.data.categories) {
    const techs = state.data.techs.filter(t => t.category === cat);
    const inCat = new Set(techs.map(t => t.id));
    const depth = {};
    const depthOf = t => depth[t.id] ??= Math.max(-1, ...t.requires.map(id => state.techs[id])
      .filter(p => inCat.has(p.id) && p.era === t.era).map(depthOf)) + 1;
    techs.forEach(depthOf);

    let offset = 0; const eraCols = {};
    for (const era of state.data.eras) {
      const width = Math.max(0, ...techs.filter(t => t.era === era).map(t => depth[t.id])) + 1;
      eraCols[era] = { start: offset, width }; offset += width;
    }
    const col = t => eraCols[t.era].start + depth[t.id];
    const pos = {}; const used = {};
    for (let c = 0; c < offset; c++) {
      used[c] = new Set();
      const here = techs.filter(t => col(t) === c).map(t => {
        const rows = t.requires.filter(id => pos[id]).map(id => pos[id].row);
        return { t, want: rows.length ? rows.reduce((a, b) => a + b) / rows.length : null };
      }).sort((a, b) => (a.want ?? 1e9) - (b.want ?? 1e9) || a.t.name.localeCompare(b.t.name));
      for (const { t, want } of here) {
        let row;
        if (want === null) { row = 0; while (used[c].has(row)) row++; }
        else {
          const base = Math.max(0, Math.round(want));
          for (let d = 0; ; d++) {
            if (!used[c].has(base + d)) { row = base + d; break; }
            if (base - d >= 0 && !used[c].has(base - d)) { row = base - d; break; }
          }
        }
        used[c].add(row);
        pos[t.id] = { col: c, row, x: c * (NODE_W + COL_GAP), y: HEAD + row * (NODE_H + ROW_GAP) };
      }
    }
    const rows = Math.max(...Object.values(pos).map(p => p.row)) + 1;
    state.layout[cat] = { techs, pos, eraCols, width: offset * (NODE_W + COL_GAP), height: HEAD + rows * (NODE_H + ROW_GAP) };
  }
}

export function techStatus(c, t) {
  if (c.techSet.has(t.id)) return "has";
  return t.requires.every(id => c.techSet.has(id)) ? "av" : "lk";
}

export function renderTree() {
  const c = current(); const L = state.layout[state.category];
  const tree = document.getElementById("tree");
  tree.style.width = L.width + "px"; tree.style.height = L.height + "px";
  let html = "";
  for (const era of state.data.eras) {
    const e = L.eraCols[era];
    html += `<div class="era-band" style="left:${e.start * (NODE_W + COL_GAP) - COL_GAP / 2}px;width:${e.width * (NODE_W + COL_GAP)}px"><h2>${ERA_NAMES[era] || era}</h2></div>`;
  }
  let paths = "";
  for (const t of L.techs) {
    const to = L.pos[t.id];
    for (const id of t.requires) {
      const from = L.pos[id]; if (!from) continue;
      const x1 = from.x + NODE_W, y1 = from.y + NODE_H / 2, x2 = to.x - 3, y2 = to.y + NODE_H / 2, mx = (x1 + x2) / 2;
      const on = c.techSet.has(id) && c.techSet.has(t.id);
      const hl = state.focusTech && (state.focusTech === t.id || state.focusTech === id);
      paths += `<path class="arr${on ? " on" : ""}${hl ? " hl" : ""}" marker-end="url(#${hl ? "hd-hl" : on ? "hd-on" : "hd"})" d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}"/>`;
    }
  }
  html += `<svg width="${L.width}" height="${L.height}"><defs>
    ${[["hd", "--arrow"], ["hd-on", "--arrow-on"], ["hd-hl", "--accent"]].map(([id, v]) =>
      `<marker id="${id}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="var(${v})"/></marker>`).join("")}
    </defs>${paths}</svg>`;
  for (const t of L.techs) {
    const p = L.pos[t.id];
    const foreign = t.requires.filter(id => !L.pos[id]);
    html += `<div class="node ${techStatus(c, t)}${state.focusTech === t.id ? " focus" : ""}" data-tech="${t.id}" style="left:${p.x}px;top:${p.y}px;width:${NODE_W}px;height:${NODE_H}px">
      ${t.icon ? `<img src="${asset(t.icon)}" alt="" loading="lazy">` : ""}<span>${esc(t.name)}</span>
      ${foreign.length ? `<span class="x" title="Also needs: ${esc(foreign.map(id => state.techs[id].name).join(", "))}">↗</span>` : ""}</div>`;
  }
  tree.innerHTML = html;
}

// Research cost as the game computes it: the era's base cost, plus the
// ahead-of-time penalty -- for every tech in the same category from an
// earlier era the country doesn't have, a share of the cost per era of
// gap. Years are only an estimate: real innovation depends on
// universities and literacy, and tech spread gives free progress on top.
const TYPICAL_INNOVATION = 100;
export function researchCost(c, t) {
  const R = state.data.research, eras = state.data.eras, base = R.era_cost[t.era];
  const missing = state.data.techs.filter(o => o.category === t.category && !c.techSet.has(o.id) && eras.indexOf(o.era) < eras.indexOf(t.era));
  const penalty = missing.reduce((sum, o) => sum + R.ahead_of_time_penalty * base * (eras.indexOf(t.era) - eras.indexOf(o.era)), 0);
  return { base, penalty, total: base + penalty, missing: missing.length };
}
function researchHtml(c, t, st) {
  const R = state.data.research, cost = researchCost(c, t);
  const years = rate => (cost.total / (rate * 52)).toFixed(1);
  const pts = n => Math.round(n).toLocaleString("en");
  return `<h3>Research cost</h3><ul>
    <li><span>Base cost (${ERA_NAMES[t.era]?.split(" ·")[0] || t.era})</span><span class="v">${pts(cost.base)}</span></li>
    ${st === "has" ? `<li><span>${esc(c.name)}</span><span class="k">already has it</span></li>` : `
      ${cost.penalty ? `<li><span title="The game's ahead-of-time penalty: ${cost.missing} earlier-era ${t.category} techs missing">+ ahead-of-time penalty for ${esc(c.name)}</span><span class="v">${pts(cost.penalty)}</span></li>` : ""}
      <li><span>Total for ${esc(c.name)}</span><span class="v">${pts(cost.total)}</span></li>
      <li><span>≈ at ${R.base_innovation}/week (base innovation, no universities)</span><span class="v">${years(R.base_innovation)} yrs</span></li>
      <li><span>≈ at ${TYPICAL_INNOVATION}/week (estimate for a developed power)</span><span class="v">${years(TYPICAL_INNOVATION)} yrs</span></li>`}
    </ul>`;
}

export function renderDetail() {
  const el = document.getElementById("detail");
  const t = state.techs[state.focusTech];
  if (!t) { el.innerHTML = `<p class="empty">Hover over a technology to see what it does and which countries start with it.</p>`; return; }
  const c = current(); const st = techStatus(c, t);
  const statusText = { has: `${c.name} ${hasWord()} this`, av: `${c.name} can research this`, lk: `${c.name} is missing prerequisites` }[st];
  const europe = state.data.countries.filter(isEurope).sort((a, b) => battalions(b) - battalions(a));
  const holders = europe.filter(x => x.techSet.has(t.id)), lacking = europe.filter(x => !x.techSet.has(t.id));
  const techLink = id => `<span class="link" data-goto="${id}">${esc(state.techs[id].name)}</span>`;
  el.innerHTML = `<button type="button" class="sheet-close" data-close aria-label="Close">✕</button>
    <div class="top">${t.icon ? `<img src="${asset(t.icon)}" alt="">` : ""}<div><h2>${esc(t.name)}</h2>
      <div class="meta">${ERA_NAMES[t.era] || t.era} · ${t.category[0].toUpperCase() + t.category.slice(1)}</div></div></div>
    <span class="pill status">${esc(statusText)}</span>
    ${t.desc ? `<h3>Description</h3><p class="desc">${esc(t.desc)}</p>` : ""}
    ${t.modifiers.length ? `<h3>Effects</h3><ul>${t.modifiers.map(m => `<li><span>${esc(m.name)}</span><span class="v">${fmtModifier(m)}</span></li>`).join("")}</ul>` : ""}
    ${t.unlocks.length ? `<h3>Unlocks</h3><ul>${t.unlocks.map(u => `<li><span>${esc(u.name)}</span><span class="k">${esc(u.kind)}</span></li>`).join("")}</ul>` : ""}
    ${researchHtml(c, t, st)}
    ${t.requires.length ? `<h3>Requires</h3><p>${t.requires.map(techLink).join(", ")}</p>` : ""}
    <h3>European countries that ${state.saveInfo ? "have" : "start with"} it (${holders.length}/${europe.length})</h3>
    <div class="flags">${holders.map(x => flagHtml(x, "")).join("") || "<em>None</em>"}</div>
    ${lacking.length && holders.length ? `<h3>…and those that don't</h3><div class="flags">${lacking.map(x => flagHtml(x, "")).join("")}</div>` : ""}`;
}

export function renderSubtabs() {
  const c = current();
  document.getElementById("subtabs").innerHTML = state.data.categories.map(cat =>
    `<button data-cat="${cat}" class="${cat === state.category ? "on" : ""}">${cat[0].toUpperCase() + cat.slice(1)}<span>${catCount(c, cat)}/${state.layout[cat].techs.length}</span></button>`).join("") +
    `<div class="legend"><span><i></i>Has it</span><span><i class="av"></i>Can research</span><span><i class="lk"></i>Locked</span></div>`;
}

document.getElementById("subtabs").addEventListener("click", e => {
  const b = e.target.closest("button[data-cat]"); if (!b) return;
  state.category = b.dataset.cat; state.focusTech = null;
  renderSidebar(); render();
});
const tree = document.getElementById("tree");
tree.addEventListener("mouseover", e => {
  if (noHover) return;
  const n = e.target.closest(".node");
  if (n && n.dataset.tech !== state.focusTech) { state.focusTech = n.dataset.tech; renderTree(); renderDetail(); }
});
// Click (not just hover) writes the tech into the URL hash, so the
// resulting link -- copied straight from the address bar -- reopens
// scrolled to and highlighting this exact tech for the pinned country.
tree.addEventListener("click", e => {
  const n = e.target.closest(".node"); if (!n) return;
  state.focusTech = n.dataset.tech;
  history.replaceState(null, "", "#" + state.pinned + "/" + state.focusTech);
  renderTree(); renderDetail();
  if (isPhone()) document.body.classList.add("sheet-open");
});
document.getElementById("detail").addEventListener("click", e => {
  if (e.target.closest("[data-close]")) { document.body.classList.remove("sheet-open"); return; }
  const id = e.target.closest("[data-goto]")?.dataset.goto; if (!id) return;
  state.category = state.techs[id].category; state.focusTech = id;
  history.replaceState(null, "", "#" + state.pinned + "/" + state.focusTech);
  renderSidebar(); render(); scrollToTech(id);
});
