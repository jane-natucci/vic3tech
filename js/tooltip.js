// The hover box over the army and economy tables' bars (per unit or building type).
import { state } from "./state.js";
import { esc, UNIT_GROUPS, battalions, ships } from "./helpers.js";
import { SECTORS, economy, econOf, bName } from "./views/economy.js";

// Hover breakdown for the army composition bar (per group, then per unit
// type) and the ships column (per ship type).
function tipHtml(c, kind) {
  if (kind === "econ") {
    const e = econOf(c);
    return `<b>${esc(c.name)} · ${e.total} building levels</b>` + SECTORS.filter(([s]) => e.sectors[s]).map(([s, label, v]) => {
      const ids = Object.keys(e.levels).filter(id => economy.buildings[id]?.sector === s).sort((a, b) => e.levels[b] - e.levels[a]);
      return `<div class="g"><span><span class="sw" style="background:var(${v})"></span>${label} (${Math.round(e.sectors[s] / e.total * 100)}%)</span><span class="n">${e.sectors[s]}</span></div>` +
        ids.slice(0, 6).map(id => `<div class="u"><span>${esc(bName(id))}</span><span class="n">${e.levels[id]}</span></div>`).join("") +
        (ids.length > 6 ? `<div class="u"><span>+${ids.length - 6} more</span><span></span></div>` : "");
    }).join("");
  }
  const row = (cls, name, n, sw) => `<div class="${cls}"><span>${sw ? `<span class="sw" style="background:var(${sw})"></span>` : ""}${esc(name)}</span><span class="n">${n.toLocaleString("en")}</span></div>`;
  if (kind === "navy") {
    const list = Object.values(c.navy).sort((a, b) => b.count - a.count);
    return `<b>${esc(c.name)} · ${ships(c)} ships</b>` + (list.map(s => row("u", s.name, s.count)).join("") || `<div class="u">No starting navy</div>`);
  }
  const groups = [...UNIT_GROUPS, ["other", "Other", "--other"]].map(([g, label, v]) => {
    const units = Object.values(c.army).filter(u => (UNIT_GROUPS.some(([id]) => id === u.group) ? u.group : "other") === g).sort((a, b) => b.count - a.count);
    return { label, v, units, n: units.reduce((n, u) => n + u.count, 0) };
  }).filter(g => g.n);
  return `<b>${esc(c.name)} · ${battalions(c)} battalions</b>` + groups.map(g =>
    row("g", `${g.label} (${Math.round(g.n / battalions(c) * 100)}%)`, g.n, g.v) + g.units.map(u => row("u", u.name, u.count)).join("")).join("");
}
export const tip = document.getElementById("tip");
document.body.appendChild(tip); // shared by the army and economy tables
const showTip = e => {
  const cell = e.target.closest("[data-tip]");
  if (!cell) { tip.style.display = "none"; return; }
  tip.innerHTML = tipHtml(state.byTag[cell.closest("tr").dataset.tag], cell.dataset.tip);
  tip.style.display = "block";
  const x = Math.min(e.clientX + 16, innerWidth - tip.offsetWidth - 8), y = Math.min(e.clientY + 16, innerHeight - tip.offsetHeight - 8);
  tip.style.left = x + "px"; tip.style.top = y + "px";
};
for (const id of ["armyTable", "econTable"]) {
  document.getElementById(id).addEventListener("mousemove", showTip);
  document.getElementById(id).addEventListener("mouseleave", () => tip.style.display = "none");
}
// Touch screens: tapping a bar shows its breakdown (after the row's own
// tap has pinned that country); tapping anywhere else hides it.
// Capture phase: this has to see the tapped bar before the row's own
// click handler pins the country and redraws the table.
if (matchMedia("(hover: none)").matches) {
  document.addEventListener("click", e => {
    if (e.target.closest("#armyTable [data-tip], #econTable [data-tip]")) setTimeout(() => showTip(e));
    else tip.style.display = "none";
  }, true);
}
