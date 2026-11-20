// js/views/tech.js: the tech tree's layout, what a country has / can research / can't yet, research costs,
// and the tree and detail panel as drawn.
import { html, fire, until, element } from "../test_helper.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { state } from "../../js/state.js";
import { techStatus, researchCost } from "../../js/views/tech.js";
import "../../js/application.js";

await until(() => state.data && html("tree"));
const country = tag => state.byTag[tag];
const tech = id => state.techs[id];

test("layout: eras left to right, a column per step of a same-era prerequisite chain", () => {
  const { pos, eraCols } = state.layout.military;
  assert.deepEqual(eraCols, { era_1: { start: 0, width: 2 }, era_2: { start: 2, width: 2 }, era_3: { start: 4, width: 1 } });
  assert.equal(pos.navigation.col, 0);
  assert.equal(pos.drydocks.col, 1, "after Navigation, in the same era");
  assert.equal(pos.admiralty.col, 2, "its prerequisite is from an earlier era, so it starts its era");
  assert.equal(pos.general_staff.col, 3);
  assert.equal(pos.ironclad_tech.col, 4);
});

test("layout: each tech goes to the free row nearest its prerequisites", () => {
  const row = id => state.layout.military.pos[id].row;
  assert.equal(row("navigation"), 0);
  assert.equal(row("standing_army"), 1);
  assert.equal(row("drydocks"), row("navigation"));
  assert.equal(row("admiralty"), row("drydocks"));
  assert.equal(row("gunsmithing"), row("standing_army"));
  assert.equal(row("general_staff"), row("gunsmithing"));
});

test("techStatus: has it, can research it (has every prerequisite), or locked", () => {
  assert.equal(techStatus(country("GBR"), tech("navigation")), "has");
  assert.equal(techStatus(country("GBR"), tech("admiralty")), "av");
  assert.equal(techStatus(country("FRA"), tech("admiralty")), "lk");
  assert.equal(techStatus(country("JAP"), tech("navigation")), "av", "no prerequisites");
});

test("researchCost: the era's cost plus a quarter of it per missing earlier-era tech of the category, per era of gap", () => {
  assert.deepEqual(researchCost(country("FRA"), tech("general_staff")), { base: 10000, penalty: 2500, total: 12500, missing: 1 });
  assert.deepEqual(researchCost(country("GBR"), tech("ironclad_tech")), { base: 12500, penalty: 6250, total: 18750, missing: 2 });
  assert.deepEqual(researchCost(country("JAP"), tech("navigation")), { base: 7500, penalty: 0, total: 7500, missing: 0 });
  // Two eras behind counts double: Japan lacks all three era I military techs and all three of era II.
  assert.equal(researchCost(country("JAP"), tech("ironclad_tech")).penalty, 0.25 * 12500 * (3 * 2 + 3 * 1));
});

test("the tree shows each tech's status for the open country (Great Britain by default)", () => {
  assert.equal(state.pinned, "GBR");
  assert.match(html("tree"), /class="node has" data-tech="navigation"/);
  assert.match(html("tree"), /class="node av" data-tech="admiralty"/);
  assert.match(html("tree"), /class="node lk" data-tech="ironclad_tech"/);
});

test("a prerequisite from another category is marked on the tech", () => {
  fire("subtabs", "click", { matches: ["button"], dataset: { cat: "society" } });
  assert.equal(state.category, "society");
  assert.match(html("tree"), /data-tech="rationalism"[\s\S]*?title="Also needs: Standing army">↗/);
});

test("clicking a tech: its address, and the detail panel", () => {
  fire("subtabs", "click", { matches: ["button"], dataset: { cat: "military" } });
  fire("tree", "click", { matches: [".node"], dataset: { tech: "admiralty" } });
  assert.equal(location.hash, "#GBR/admiralty");
  const detail = html("detail");
  assert.match(detail, /<h2>Admiralty<\/h2>/);
  assert.match(detail, /Great Britain can research this/);
  assert.match(detail, /Total for Great Britain<\/span><span class="v">10,000</);
  assert.match(detail, /European countries that start with it \(0\/2\)/);
});

const text = h => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const focus = (id, tag = "GBR") => {
  state.pinned = tag; state.category = tech(id).category;
  fire("tree", "click", { matches: [".node"], dataset: { tech: id } });
};

test("the sub-tabs: each category with how many of its techs the country has, and the legend", () => {
  state.pinned = "GBR";
  fire("subtabs", "click", { matches: ["button"], dataset: { cat: "military" } });
  assert.equal(text(html("subtabs")), "Production 1/2 Military 4/7 Society 1/2 Has it Can research Locked");
  assert.match(html("subtabs"), /<button data-cat="military" class="on">Military<span>4\/7<\/span><\/button>/);
});

test("choosing a category clears the open tech, and the panel asks you to hover one", () => {
  assert.equal(state.focusTech, null);
  assert.equal(html("detail"), `<p class="empty">Hover over a technology to see what it does and which countries start with it.</p>`);
});

test("the tree: an era band per era, with its name, as wide as its columns", () => {
  const bands = [...html("tree").matchAll(/<div class="era-band" style="left:([-\d.]+)px;width:(\d+)px"><h2>([^<]+)<\/h2><\/div>/g)].map(m => m.slice(1));
  assert.deepEqual(bands, [["-23", "436", "Era I · before 1836"], ["413", "436", "Era II · 1836–1861"], ["849", "218", "Era III · 1862–1886"]]);
  assert.equal(element("tree").style.width, "1090px");
  assert.equal(element("tree").style.height, "164px");
});

test("the arrows: one per prerequisite in the category, lit when the country has both ends", () => {
  const arrows = [...html("tree").matchAll(/<path class="(arr[^"]*)" marker-end="url\(#([\w-]+)\)" d="([^"]+)"\/>/g)].map(m => m.slice(1));
  assert.equal(arrows.length, 5);
  assert.deepEqual(arrows[0], ["arr on", "hd-on", "M172,68 C193.5,68 193.5,68 215,68"], "Navigation → Drydocks: Britain has both");
  assert.deepEqual(arrows.find(a => a[2].startsWith("M608,68")), ["arr", "hd", "M608,68 C738.5,68 738.5,68 869,68"], "Admiralty → Ironclad: has neither");
  assert.match(html("tree"), /<marker id="hd-hl" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="var\(--accent\)"\/><\/marker>/);
});

test("the open tech is highlighted, with its arrows", () => {
  focus("drydocks");
  assert.match(html("tree"), /<div class="node has focus" data-tech="drydocks" style="left:218px;top:44px;width:172px;height:48px">/);
  assert.match(html("tree"), /<path class="arr on hl" marker-end="url\(#hd-hl\)" d="M172,68/);
  assert.match(html("tree"), /<path class="arr hl" marker-end="url\(#hd-hl\)" d="M390,68/);
});

test("the panel for a tech the country has: its effects, what it unlocks, and that it already has it", () => {
  focus("gunsmithing");
  assert.equal(text(html("detail")),
    "✕ Gunsmithing Era II · 1836–1861 · Military Great Britain starts with this Description About gunsmithing. " +
    "Unlocks Line Infantry unit Research cost Base cost (Era II) 10,000 Great Britain already has it " +
    "Requires Standing army European countries that start with it (1/2) …and those that don't");
  assert.match(html("detail"), /<h3>Requires<\/h3><p><span class="link" data-goto="standing_army">Standing army<\/span><\/p>/);
  focus("standing_army");
  assert.match(text(html("detail")), /Effects Offense \+10%/);
});

test("the panel for a tech the country can research: the cost, with the ahead-of-time penalty, and how long", () => {
  focus("general_staff", "FRA");
  assert.match(text(html("detail")), /France is missing prerequisites/);
  focus("gunsmithing", "FRA");
  assert.match(text(html("detail")),
    /France can research this .* Research cost Base cost \(Era II\) 10,000 \+ ahead-of-time penalty for France 2,500 Total for France 12,500 ≈ at 50\/week \(base innovation, no universities\) 4\.8 yrs ≈ at 100\/week \(estimate for a developed power\) 2\.4 yrs/);
  assert.match(html("detail"), /title="The game's ahead-of-time penalty: 1 earlier-era military techs missing"/);
  focus("navigation", "JAP");
  assert.doesNotMatch(text(html("detail")), /penalty/, "no penalty without missing earlier techs");
});

test("the countries that have it and those that don't, biggest army first; None when nobody does", () => {
  focus("navigation");
  assert.deepEqual([...html("detail").matchAll(/title="([^"]+)"><img/g)].map(m => m[1]), ["France", "Great Britain"]);
  focus("ironclad_tech");
  assert.match(html("detail"), /\(0\/2\)<\/h3>\s*<div class="flags"><em>None<\/em><\/div>/);
  assert.doesNotMatch(html("detail"), /those that don't/);
});

test("with a save, the wording says has rather than starts with", () => {
  state.saveInfo = { date: "1841.1.1" };
  try {
    focus("navigation");
    assert.match(text(html("detail")), /Great Britain has this .* European countries that have it \(2\/2\)/);
  } finally {
    state.saveInfo = null;
  }
});

test("hovering a tech opens it in the panel without changing the address", () => {
  location.hash = "#GBR";
  fire("tree", "mouseover", { matches: [".node"], dataset: { tech: "admiralty" } });
  assert.equal(state.focusTech, "admiralty");
  assert.match(html("detail"), /<h2>Admiralty<\/h2>/);
  assert.equal(location.hash, "#GBR");
});

test("a required tech in the panel opens that tech, in its own category", () => {
  focus("rationalism");
  fire("detail", "click", { matches: ["[data-goto]"], dataset: { goto: "standing_army" } });
  assert.equal(state.category, "military");
  assert.equal(state.focusTech, "standing_army");
  assert.equal(location.hash, "#GBR/standing_army");
});

test("the panel's close button closes it on a phone", () => {
  document.body.classList.add("sheet-open");
  fire("detail", "click", { matches: ["[data-close]"] });
  assert.equal(document.body.classList.contains("sheet-open"), false);
});
