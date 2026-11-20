// Laws tab: each country's law in every group -- at the 1836 start as extract.rb works it out from the history
// files, or in a loaded save, with the year a law was enacted -- and, "Across countries", how many countries in
// the sidebar's scope have each law of one group.
import { state, current } from "../state.js";
import { asset, flagHtml, esc, isEurope, fmtModifier, hasWord } from "../helpers.js";
import { syncHash, pin } from "../page.js";

// This tab's own state: which view is open, the group "Across countries" shows, and the law whose box is open.
state.lawKind = "country"; state.lawGroup = null; state.lawFocus = null;

// --- What the tab works out ---------------------------------------------------------------------------------------

const lawOf = id => state.data.laws[id];
const lawsOf = c => c.laws || [];
const hasLaw = (c, id) => lawsOf(c).includes(id);

// The game's progressiveness of a country's laws, added up (the sidebar ranks by it on this tab).
export const progressiveness = c => lawsOf(c).reduce((sum, id) => sum + (lawOf(id)?.progressiveness || 0), 0);

// The groups a country has a law in: caste hegemony and the Edo status system only exist for some countries.
export const lawGroupsOf = c => state.data.law_groups.filter(group => group.laws.some(id => hasLaw(c, id)));

// Why a country can't enact a law (yet): a tech it lacks, or none of the laws from other groups the law goes with
// (Subjecthood only goes with Monarchy, Theocracy, ...).
const lacksTech = (c, id) => lawOf(id).techs.some(tech => !c.techSet.has(tech));
export const lawNeedsLaw = (c, id) => lawOf(id).laws?.length > 0 && !lawOf(id).laws.some(other => hasLaw(c, other));
export const lawLocked = (c, id) => lacksTech(c, id) || lawNeedsLaw(c, id);

// The game shows some laws only to the countries they're for (Russia's Third Section), so the page doesn't either.
export const lawShown = (c, id) => !lawOf(id).only || lawOf(id).only.includes(c.tag) || hasLaw(c, id);

// The year the country enacted a law, if after the start (only a save says).
function enactedYear(c, id) {
  const since = c.lawSince?.[id];
  return since && since !== "1836.1.1" ? since.split(".")[0] : null;
}

// Who's counted: Europe, or every country with the sidebar's "Whole world".
const inScope = c => state.scope === "all" || isEurope(c);
const holdersOf = (countries, id) => countries.filter(c => hasLaw(c, id)).sort((a, b) => a.name.localeCompare(b.name));

// --- Wording -----------------------------------------------------------------------------------------------------

const european = () => state.scope === "all" ? "" : "European ";
const haveWord = () => state.saveInfo ? "have" : "start with";
const signed = n => `${n > 0 ? "+" : ""}${n}`;
const techName = id => state.techs[id]?.name || id;
const lawName = id => lawOf(id)?.name || id;

// --- Drawing it --------------------------------------------------------------------------------------------------

export function renderLaws() {
  const c = current();
  document.getElementById("lawTabs").innerHTML = viewButtons(c);
  if (state.lawKind === "country") renderCountryView(c);
  else renderCompareView(c);
}

const viewButtons = c => [["country", c.name], ["compare", "Across countries"]].map(([kind, label]) =>
  `<button data-law-kind="${kind}" class="${kind === state.lawKind ? "on" : ""}">${esc(label)}</button>`
).join("");

// The country's view: a row per law group, under a heading per category.
function renderCountryView(c) {
  const save = !!state.saveInfo;
  document.getElementById("lawNote").innerHTML = (save
    ? `${esc(c.name)}'s laws in your save, highlighted, with the year for laws enacted after 1836.`
    : `${esc(c.name)}'s laws at the 1836 start, highlighted.`) +
    ` Next to each are the other laws of that group; dimmed ones need a technology ${esc(c.name)} doesn't have yet, or another law it doesn't have (Subjecthood, for example, only goes with a monarchy, theocracy, chiefdom or colonial administration). Click a law to read what it is and does, and which countries have it. The sidebar ranks countries by the game's <i>progressiveness</i> of their laws added up.`;

  const body = document.getElementById("lawBody");
  if (!lawsOf(c).length) {
    const why = save ? " in this save (shared links made before laws were added don't have them)" : "";
    body.innerHTML = `<p class="muted">No laws for ${esc(c.name)}${why}.</p>`;
    return;
  }
  let category = null;
  body.innerHTML = lawGroupsOf(c).map(group => {
    const heading = group.category !== category ? `<div class="law-cat">${esc(group.category_name)}</div>` : "";
    category = group.category;
    return heading + groupRow(c, group);
  }).join("");
}

// One group: the country's law first, then the others it could see, and the open law's box below them.
function groupRow(c, group) {
  const mine = group.laws.find(id => hasLaw(c, id));
  const others = group.laws.filter(id => id !== mine && lawShown(c, id));
  const boxOpen = group.laws.includes(state.lawFocus) && lawShown(c, state.lawFocus);
  return `<div class="law-row"><b>${esc(group.name)}</b>` +
    `<div class="laws">${lawChip(c, mine, true)}${others.map(id => lawChip(c, id, false)).join("")}</div>` +
    (boxOpen ? lawBox(c, state.lawFocus, group) : "") + `</div>`;
}

// A law as a button: highlighted when it's the country's, dimmed when the country can't enact it. Its tooltip
// says what it is and does, and why it's dimmed.
function lawChip(c, id, active) {
  const law = lawOf(id), locked = !active && lawLocked(c, id);
  const year = active && enactedYear(c, id);
  const classes = ["law", active && "on", locked && "locked", state.lawFocus === id && "focus"].filter(Boolean).join(" ");
  return `<button class="${classes}" data-law="${id}" title="${esc(chipTooltip(c, id, locked))}">` +
    `${law.icon ? `<img src="${asset(law.icon)}" alt="" loading="lazy">` : ""}${esc(law.name)}` +
    `${year ? ` <span class="since">since ${esc(year)}</span>` : ""}</button>`;
}

function chipTooltip(c, id, locked) {
  const law = lawOf(id);
  return [
    law.name,
    law.progressiveness ? `progressiveness ${signed(law.progressiveness)}` : null,
    locked && lacksTech(c, id) ? `needs ${law.techs.map(techName).join(", ")}` : null,
    locked && lawNeedsLaw(c, id) ? `needs one of: ${law.laws.map(lawName).join(", ")}` : null,
    ...law.modifiers.map(m => `${m.name}: ${fmtModifier(m)}`),
  ].filter(Boolean).join("\n");
}

// A clicked law's box, under its group: what it is and does, what it needs, and which countries have it.
function lawBox(c, id, group) {
  const law = lawOf(id);
  const counted = state.data.countries.filter(x => inScope(x) && lawGroupsOf(x).includes(group));
  const holders = holdersOf(counted, id);
  return `<div class="law-box">
    <h4>${law.icon ? `<img src="${asset(law.icon)}" alt="">` : ""}<span>${esc(law.name)} <small>${esc(group.name)}</small></span><button class="close" data-law-close>Close</button></h4>
    <div class="meta">${boxFacts(c, id)}</div>
    ${law.desc ? `<p class="law-desc">${esc(law.desc)}</p>` : ""}
    ${modifierList(law)}
    <div class="who">${holders.length} of ${counted.length} ${european()}countries ${haveWord()} it${holders.length ? " — click a flag to see that country:" : "."}</div>
    <div class="law-flags">${flagButtons(holders)}</div>
    <button class="to-compare" data-law-compare="${group.id}">Compare every ${esc(group.name.toLowerCase())} law across countries →</button>
  </div>`;
}

// The box's line about the country and the law: whether it has it, and what it needs, ticked or crossed.
function boxFacts(c, id) {
  const law = lawOf(id), year = enactedYear(c, id);
  const mark = (ok, label) => `<span class="${ok ? "ok" : "no"}">${label}</span>`;
  const techMark = tech => mark(c.techSet.has(tech), `${esc(techName(tech))} ${c.techSet.has(tech) ? "✓" : "✗"}`);
  const lawMark = other => mark(hasLaw(c, other), `${esc(lawName(other))}${hasLaw(c, other) ? " ✓" : ""}`);
  const facts = [
    hasLaw(c, id) ? `${esc(c.name)} has this law${year ? ` since ${esc(year)}` : ""}` : `${esc(c.name)} doesn't have this law`,
    law.techs.length ? `needs ${law.techs.map(techMark).join(", ")}` : "no technology needed",
  ];
  if (law.laws?.length) facts.push(`needs one of these laws: ${law.laws.map(lawMark).join(", ")}`);
  if (law.progressiveness) facts.push(`progressiveness ${signed(law.progressiveness)}`);
  return facts.join(" · ");
}

// "Across countries": one group at a time, each of its laws with how many countries have it, and their flags.
function renderCompareView(c) {
  const groups = state.data.law_groups;
  const group = groups.find(g => g.id === state.lawGroup) || groups[0];
  state.lawGroup = group.id;
  const save = !!state.saveInfo;
  const countries = state.data.countries.filter(x => inScope(x) && lawsOf(x).length);
  // The countries with a law in this group (the Edo status system, for example, is Japan's only).
  const counted = countries.filter(x => lawGroupsOf(x).includes(group)).length;

  document.getElementById("lawNote").innerHTML =
    `How many ${european()}countries ${haveWord()} each ${esc(group.name.toLowerCase())} law${save ? " in your save" : ""}. Click a flag to pick that country; the sidebar's Europe/Whole world switch changes who's counted.`;
  document.getElementById("lawBody").innerHTML =
    groupPicker(groups, group) + (counted ? "" : noneInGroup(group)) +
    group.laws.map(id => lawShare(c, id, holdersOf(countries, id), counted)).join("");
}

// When no counted country has a law in the group: say so once, instead of "0 of 0" on every law.
function noneInGroup(group) {
  const name = group.name.toLowerCase(), article = /^[aeiou]/.test(name) ? "an" : "a";
  const hint = state.scope === "all" ? "" : " — switch the sidebar to Whole world to see the countries that do";
  return `<p class="muted">No ${european()}country ${hasWord()} ${article} ${esc(name)} law${state.saveInfo ? " in your save" : ""}${hint}.</p>`;
}

// The group dropdown, its groups under their categories.
function groupPicker(groups, selected) {
  const categories = [...new Set(groups.map(g => g.category))];
  const option = g => `<option value="${g.id}"${g.id === selected.id ? " selected" : ""}>${esc(g.name)}</option>`;
  const optgroup = category => {
    const inCategory = groups.filter(g => g.category === category);
    return `<optgroup label="${esc(inCategory[0].category_name)}">${inCategory.map(option).join("")}</optgroup>`;
  };
  return `<div class="law-groups"><select id="lawGroupPick">${categories.map(optgroup).join("")}</select></div>`;
}

function lawShare(c, id, holders, counted) {
  const law = lawOf(id);
  const facts = [
    counted ? `${holders.length} of ${counted} countries` : null,
    law.techs.length ? `needs ${law.techs.map(tech => esc(techName(tech))).join(", ")}` : null,
  ].filter(Boolean).join(" · ");
  return `<div class="law-share"><div>${lawChip(c, id, hasLaw(c, id))}
      <div class="bar"><i style="width:${counted ? holders.length / counted * 100 : 0}%"></i></div>
      ${law.desc ? `<p class="law-desc">${esc(law.desc)}</p>` : ""}
      <div class="law-detail">${facts}
      ${modifierList(law)}</div></div>
    <div class="law-flags">${flagButtons(holders) || `<span class="muted" style="font-size:0.7em">None</span>`}</div></div>`;
}

const modifierList = law => law.modifiers.length
  ? `<ul>${law.modifiers.map(m => `<li><span>${esc(m.name)}</span><span>${fmtModifier(m)}</span></li>`).join("")}</ul>` : "";

// Flags to click on to pin that country.
const flagButtons = countries => countries.map(x =>
  `<span data-tag="${x.tag}" class="${x.tag === state.pinned ? "pinned" : ""}">${flagHtml(x, "")}</span>`
).join("");

// --- Clicks ------------------------------------------------------------------------------------------------------

document.getElementById("lawTabs").addEventListener("click", e => {
  const button = e.target.closest("button[data-law-kind]");
  if (!button) return;
  state.lawKind = button.dataset.lawKind;
  syncHash(); renderLaws();
});

document.getElementById("lawBody").addEventListener("click", e => {
  const flag = e.target.closest("[data-tag]");
  if (flag) { pin(flag.dataset.tag); return; }

  if (e.target.closest("[data-law-close]")) { state.lawFocus = null; renderLaws(); return; }

  const compare = e.target.closest("[data-law-compare]");
  if (compare) {
    state.lawGroup = compare.dataset.lawCompare; state.lawKind = "compare";
    syncHash(); renderLaws();
    document.getElementById("lawView").scrollTop = 0;
    return;
  }

  // A law opens its box; clicking the open one again closes it.
  const law = e.target.closest("[data-law]");
  if (!law) return;
  const id = law.dataset.law;
  state.lawFocus = state.lawFocus === id && state.lawKind === "country" ? null : id;
  state.lawGroup = lawOf(id).group;
  renderLaws();
});

document.getElementById("lawBody").addEventListener("change", e => {
  if (e.target.id !== "lawGroupPick") return;
  state.lawGroup = e.target.value; state.lawFocus = null;
  renderLaws();
});
