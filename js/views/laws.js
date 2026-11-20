// Laws tab: a country's laws, and how many countries have each law of a group.
import { state, current } from "../state.js";
import { asset, flagHtml, esc, isEurope, fmtModifier } from "../helpers.js";
import { syncHash, pin } from "../page.js";

// --- Laws ----------------------------------------------------------------
// Each country's law in every group: at 1836 as extract.rb works it out
// from the history files, with a save the laws active in it (and since
// when, if enacted after the start). "Across countries" shows how many
// countries in the sidebar's scope have each law of one group.
state.lawKind = "country"; state.lawGroup = null; state.lawFocus = null;
const lawOf = id => state.data.laws[id];
const lawsOf = c => c.laws || [];
export const progressiveness = c => lawsOf(c).reduce((n, id) => n + (lawOf(id)?.progressiveness || 0), 0);
// Groups a country has a law in -- caste hegemony and the Edo status
// system only exist for the countries with that social hierarchy.
const lawGroupsOf = c => state.data.law_groups.filter(g => g.laws.some(id => lawsOf(c).includes(id)));
// Can't be enacted (yet): a tech it lacks, or none of the other-group
// laws it needs (Subjecthood needs Monarchy, Theocracy, ...).
const lawNeedsLaw = (c, id) => lawOf(id).laws?.length > 0 && !lawOf(id).laws.some(l => lawsOf(c).includes(l));
const lawLocked = (c, id) => lawOf(id).techs.some(t => !c.techSet.has(t)) || lawNeedsLaw(c, id);
// The game only shows some laws to named countries (Russia's Third Section), so neither does the page.
const lawShown = (c, id) => !lawOf(id).only || lawOf(id).only.includes(c.tag) || lawsOf(c).includes(id);
function lawChip(c, id, active) {
  const l = lawOf(id), locked = !active && lawLocked(c, id);
  const since = active && c.lawSince?.[id];
  const title = [l.name, l.progressiveness ? `progressiveness ${l.progressiveness > 0 ? "+" : ""}${l.progressiveness}` : null,
    locked && l.techs.some(t => !c.techSet.has(t)) ? `needs ${l.techs.map(t => state.techs[t]?.name || t).join(", ")}` : null,
    locked && lawNeedsLaw(c, id) ? `needs one of: ${l.laws.map(x => lawOf(x)?.name || x).join(", ")}` : null,
    ...l.modifiers.map(m => `${m.name}: ${fmtModifier(m)}`)].filter(Boolean).join("\n");
  return `<button class="law${active ? " on" : ""}${locked ? " locked" : ""}${state.lawFocus === id ? " focus" : ""}" data-law="${id}" title="${esc(title)}">` +
    `${l.icon ? `<img src="${asset(l.icon)}" alt="" loading="lazy">` : ""}${esc(l.name)}` +
    `${since && since !== "1836.1.1" ? ` <span class="since">since ${esc(since.split(".")[0])}</span>` : ""}</button>`;
}
// A clicked law, opened under its group: what it is, what it does, what
// it needs, and which countries (in the sidebar's scope) have it.
function lawBox(c, id, group) {
  const l = lawOf(id), has = lawsOf(c).includes(id);
  const scope = state.data.countries.filter(x => (state.scope === "all" || isEurope(x)) && lawGroupsOf(x).includes(group));
  const holders = scope.filter(x => lawsOf(x).includes(id)).sort((a, b) => a.name.localeCompare(b.name));
  const needs = l.techs.map(t => `<span class="${c.techSet.has(t) ? "ok" : "no"}">${esc(state.techs[t]?.name || t)} ${c.techSet.has(t) ? "✓" : "✗"}</span>`).join(", ");
  return `<div class="law-box">
    <h4>${l.icon ? `<img src="${asset(l.icon)}" alt="">` : ""}<span>${esc(l.name)} <small>${esc(group.name)}</small></span><button class="close" data-law-close>Close</button></h4>
    <div class="meta">${has ? `${esc(c.name)} has this law${c.lawSince?.[id] && c.lawSince[id] !== "1836.1.1" ? ` since ${esc(c.lawSince[id].split(".")[0])}` : ""}` : `${esc(c.name)} doesn't have this law`}` +
      `${l.techs.length ? ` · needs ${needs}` : " · no technology needed"}` +
      `${l.laws?.length ? ` · needs one of these laws: ${l.laws.map(x => `<span class="${lawsOf(c).includes(x) ? "ok" : "no"}">${esc(lawOf(x)?.name || x)}${lawsOf(c).includes(x) ? " ✓" : ""}</span>`).join(", ")}` : ""}${l.progressiveness ? ` · progressiveness ${l.progressiveness > 0 ? "+" : ""}${l.progressiveness}` : ""}</div>
    ${l.desc ? `<p class="law-desc">${esc(l.desc)}</p>` : ""}
    ${l.modifiers.length ? `<ul>${l.modifiers.map(m => `<li><span>${esc(m.name)}</span><span>${fmtModifier(m)}</span></li>`).join("")}</ul>` : ""}
    <div class="who">${holders.length} of ${scope.length} ${state.scope === "all" ? "" : "European "}countries ${state.saveInfo ? "have" : "start with"} it${holders.length ? " — click a flag to see that country:" : "."}</div>
    <div class="law-flags">${holders.map(x => `<span data-tag="${x.tag}" class="${x.tag === state.pinned ? "pinned" : ""}">${flagHtml(x, "")}</span>`).join("")}</div>
    <button class="to-compare" data-law-compare="${group.id}">Compare every ${esc(group.name.toLowerCase())} law across countries →</button>
  </div>`;
}
export function renderLaws() {
  const c = current(), save = !!state.saveInfo;
  document.getElementById("lawTabs").innerHTML = [["country", c.name], ["compare", "Across countries"]].map(([k, label]) =>
    `<button data-law-kind="${k}" class="${k === state.lawKind ? "on" : ""}">${esc(label)}</button>`).join("");
  const note = document.getElementById("lawNote"), body = document.getElementById("lawBody");
  if (state.lawKind === "country") {
    note.innerHTML = (save
      ? `${esc(c.name)}'s laws in your save, highlighted, with the year for laws enacted after 1836.`
      : `${esc(c.name)}'s laws at the 1836 start, highlighted.`) +
      ` Next to each are the other laws of that group; dimmed ones need a technology ${esc(c.name)} doesn't have yet, or another law it doesn't have (Subjecthood, for example, only goes with a monarchy, theocracy, chiefdom or colonial administration). Click a law to read what it is and does, and which countries have it. The sidebar ranks countries by the game's <i>progressiveness</i> of their laws added up.`;
    if (!lawsOf(c).length) { body.innerHTML = `<p class="muted">No laws for ${esc(c.name)}${save ? " in this save (shared links made before laws were added don't have them)" : ""}.</p>`; return; }
    let cat = null;
    body.innerHTML = lawGroupsOf(c).map(g => {
      const head = g.category !== cat ? `<div class="law-cat">${esc(g.category_name)}</div>` : ""; cat = g.category;
      const mine = g.laws.find(id => lawsOf(c).includes(id));
      return head + `<div class="law-row"><b>${esc(g.name)}</b><div class="laws">${lawChip(c, mine, true)}${g.laws.filter(id => id !== mine && lawShown(c, id)).map(id => lawChip(c, id, false)).join("")}</div>` +
        (g.laws.includes(state.lawFocus) && lawShown(c, state.lawFocus) ? lawBox(c, state.lawFocus, g) : "") + `</div>`;
    }).join("");
    return;
  }
  // Across countries: one group at a time.
  const groups = state.data.law_groups, group = groups.find(g => g.id === state.lawGroup) || groups[0];
  state.lawGroup = group.id;
  const inScope = state.data.countries.filter(x => state.scope === "all" || isEurope(x)).filter(x => lawsOf(x).length);
  note.innerHTML = `How many ${state.scope === "all" ? "" : "European "}countries ${save ? "have" : "start with"} each ${esc(group.name.toLowerCase())} law${save ? " in your save" : ""}. Click a flag to pick that country; the sidebar's Europe/Whole world switch changes who's counted.`;
  body.innerHTML = `<div class="law-groups"><select id="lawGroupPick">${[...new Set(groups.map(g => g.category))].map(cat =>
      `<optgroup label="${esc(groups.find(g => g.category === cat).category_name)}">${groups.filter(g => g.category === cat).map(g =>
        `<option value="${g.id}"${g.id === group.id ? " selected" : ""}>${esc(g.name)}</option>`).join("")}</optgroup>`).join("")}</select></div>` +
    group.laws.map(id => {
      const l = lawOf(id), holders = inScope.filter(x => lawsOf(x).includes(id)).sort((a, b) => a.name.localeCompare(b.name));
      const n = inScope.filter(x => lawGroupsOf(x).includes(group)).length || 1;
      return `<div class="law-share"><div>${lawChip(current(), id, lawsOf(current()).includes(id))}
          <div class="bar"><i style="width:${holders.length / n * 100}%"></i></div>
          ${l.desc ? `<p class="law-desc">${esc(l.desc)}</p>` : ""}
          <div class="law-detail">${holders.length} of ${n} countries${l.techs.length ? ` · needs ${l.techs.map(t => esc(state.techs[t]?.name || t)).join(", ")}` : ""}
          ${l.modifiers.length ? `<ul>${l.modifiers.map(m => `<li><span>${esc(m.name)}</span><span>${fmtModifier(m)}</span></li>`).join("")}</ul>` : ""}</div></div>
        <div class="law-flags">${holders.map(x => `<span data-tag="${x.tag}" class="${x.tag === state.pinned ? "pinned" : ""}">${flagHtml(x, "")}</span>`).join("") || `<span class="muted" style="font-size:0.7em">None</span>`}</div></div>`;
    }).join("");
}
document.getElementById("lawTabs").addEventListener("click", e => {
  const b = e.target.closest("button[data-law-kind]"); if (!b) return;
  state.lawKind = b.dataset.lawKind; syncHash(); renderLaws();
});
document.getElementById("lawBody").addEventListener("click", e => {
  const flag = e.target.closest("[data-tag]"); if (flag) { pin(flag.dataset.tag); return; }
  if (e.target.closest("[data-law-close]")) { state.lawFocus = null; renderLaws(); return; }
  const compare = e.target.closest("[data-law-compare]");
  if (compare) { state.lawGroup = compare.dataset.lawCompare; state.lawKind = "compare"; syncHash(); renderLaws(); document.getElementById("lawView").scrollTop = 0; return; }
  const law = e.target.closest("[data-law]"); if (!law) return;
  const id = law.dataset.law;
  state.lawFocus = state.lawFocus === id && state.lawKind === "country" ? null : id;
  state.lawGroup = lawOf(id).group;
  renderLaws();
});
document.getElementById("lawBody").addEventListener("change", e => {
  if (e.target.id === "lawGroupPick") { state.lawGroup = e.target.value; state.lawFocus = null; renderLaws(); }
});
