// The hover box over the army and economy tables' bars (per unit or building type).
import { state } from "./state.js";
import { esc } from "./helpers.js";
import { econTip } from "./views/economy.js";
import { armyTip, navyTip } from "./views/armies.js";

// One line of a tooltip: a group ("g", bold, with its colour) or an item in it ("u"), and its number.
export const tipRow = (cls, name, n, color) =>
  `<div class="${cls}"><span>${color ? `<span class="sw" style="background:var(${color})"></span>` : ""}${esc(name)}</span><span class="n">${n.toLocaleString("en")}</span></div>`;

// What the box shows: the army or navy breakdown (Armies tab) or the buildings by sector (Economy tab).
function tipHtml(c, kind) {
  if (kind === "army") return armyTip(c);
  if (kind === "navy") return navyTip(c);
  if (kind === "econ") return econTip(c);
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
