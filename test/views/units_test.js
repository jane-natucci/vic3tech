// js/views/units.js: which units, ships and mobilization options a country can build, and in which era they come.
import { html, fire, until } from "../test_helper.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { state } from "../../js/state.js";
import { showView } from "../../js/page.js";
import { itemStatus, itemEra, canBuild } from "../../js/views/units.js";
import "../../js/application.js";

await until(() => state.data && html("tree"));
const country = tag => state.byTag[tag];
const item = (kind, id) => state.data[kind].find(i => i.id === id);

test("itemStatus: no tech needed, unlocked by a tech, one tech away, or locked", () => {
  assert.equal(itemStatus(country("JAP"), item("units", "combat_unit_type_irregular_infantry")), "has");
  assert.equal(itemStatus(country("GBR"), item("units", "combat_unit_type_line_infantry")), "has");
  assert.equal(itemStatus(country("FRA"), item("units", "combat_unit_type_line_infantry")), "av", "France can research Gunsmithing");
  assert.equal(itemStatus(country("JAP"), item("units", "combat_unit_type_line_infantry")), "lk");
  assert.equal(itemStatus(country("GBR"), item("units", "combat_unit_type_hussars")), "has", "any one of its techs is enough");
  assert.equal(itemStatus(country("JAP"), item("units", "combat_unit_type_hussars")), "av", "Standing Army is one tech away");
});

test("itemStatus: a mobilization option that needs a power bloc principle is never simply available", () => {
  assert.equal(itemStatus(country("GBR"), item("mobilization", "mobilization_option_bloc_drill")), "av");
});

test("itemEra: the era of the tech that unlocks it, or the start", () => {
  assert.equal(itemEra(item("units", "combat_unit_type_irregular_infantry")), "start");
  assert.equal(itemEra(item("units", "combat_unit_type_line_infantry")), "era_2");
  assert.equal(itemEra(item("ships", "ship_type_frigate")), "era_1");
});

test("canBuild counts what a country can build of each kind", () => {
  assert.equal(canBuild(country("GBR"), "units"), 3);
  assert.equal(canBuild(country("GBR"), "ships"), 2);
  assert.equal(canBuild(country("JAP"), "units"), 1);
  assert.equal(canBuild(country("JAP"), "ships"), 0);
});

test("the ships grid: era columns, one row per group, and how many the country starts with", () => {
  showView("unitView");
  fire("unitTabs", "click", { matches: ["button"], dataset: { kind: "ships" } });
  assert.equal(location.hash, "#GBR/units/ships");
  const grid = html("unitGrid");
  assert.deepEqual([...grid.matchAll(/<div class="ucol-head">([^<]+)<\/div>/g)].map(m => m[1]),
    ["Era I · before 1836", "Era III · 1862–1886"]);
  assert.deepEqual([...grid.matchAll(/<div class="urow-head">([^<]+)<\/div>/g)].map(m => m[1]), ["Light Ships", "Capital Ships"]);
  assert.match(grid, /<div class="ucard has">[\s\S]*?<b>Ship of the Line<\/b>[\s\S]*?Great Britain starts with 5/);
  assert.match(grid, /<div class="ucard lk">[\s\S]*?<b>Ironclad<\/b>/);
  assert.match(html("unitTabs"), /data-kind="ships" class="on">Ships<span>2\/3<\/span>/);
  assert.match(html("countries"), /by ships it can build/);
});

// One card of the open grid: its class (has / av / lk) and its text without markup.
function card(name) {
  const grid = html("unitGrid"), at = grid.indexOf(`<b>${name}</b>`);
  assert.ok(at >= 0, `no card for ${name}`);
  const start = grid.lastIndexOf('<div class="ucard', at);
  const ends = ['<div class="ucard', '<div class="urow-head'].map(s => grid.indexOf(s, at)).filter(i => i >= 0);
  const h = grid.slice(start, ends.length ? Math.min(...ends) : undefined);
  return { status: /<div class="ucard (\w+)">/.exec(h)[1], html: h, text: h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() };
}
const openKind = (kind, tag = "GBR") => {
  state.pinned = tag;
  fire("unitTabs", "click", { matches: ["button"], dataset: { kind } });
};

test("the sub-tabs: how many of each kind the country can build, and the legend", () => {
  openKind("units");
  assert.equal(html("unitTabs").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    "Army units 3/3 Ships 2/3 Mobilization options 1/2 Can build One tech away Locked");
});

test("the units grid: a column per era that has something, a row per group", () => {
  const grid = html("unitGrid");
  assert.deepEqual([...grid.matchAll(/<div class="ucol-head">([^<]+)<\/div>/g)].map(m => m[1]),
    ["No tech needed", "Era I · before 1836", "Era II · 1836–1861"]);
  assert.deepEqual([...grid.matchAll(/<div class="urow-head">([^<]+)<\/div>/g)].map(m => m[1]), ["Infantry", "Cavalry"]);
  assert.match(grid, /<div class="ucol-head">Era I · before 1836<\/div>[\s\S]*<b>Hussars<\/b>/, "Hussars come with the earlier of their two techs");
});

test("a unit card: where it comes from, its stats with bars against the strongest unit, its upkeep", () => {
  assert.deepEqual(card("Irregular Infantry"), { ...card("Irregular Infantry"), status: "has",
    text: "Irregular Infantry Available from the start Offense +10 Defense +10" });
  assert.match(card("Irregular Infantry").html, /Offense<\/span><span class="v">\+10<\/span><span class="bar"><i style="width:50%">/);
  assert.match(card("Irregular Infantry").html, /Defense<\/span><span class="v">\+10<\/span><span class="bar"><i style="width:40%">/);
  assert.equal(card("Line Infantry").text, "Line Infantry Unlocked by Gunsmithing Great Britain starts with 10 Offense +20 Defense +25 Upkeep: Small Arms 1");
  assert.match(card("Hussars").text, /^Hussars Unlocked by General staff or Standing army Great Britain starts with 2/);
});

test("a unit card for a country that can research its tech, or can't yet", () => {
  openKind("units", "FRA");
  assert.equal(card("Line Infantry").status, "av");
  assert.match(card("Line Infantry").text, /Researchable: needs Gunsmithing/);
  openKind("units", "JAP");
  assert.equal(card("Line Infantry").status, "lk");
  assert.match(card("Line Infantry").text, /Locked: needs Gunsmithing/);
});

test("a ship card: key stats first and the rest folded away, what it costs, what makes it obsolete", () => {
  openKind("ships");
  assert.equal(card("Frigate").text, "Frigate Unlocked by Navigation Great Britain starts with 3 Obsolete with Ironclad tech Ship Armor +5 Build: Hardwood 50");
  assert.match(card("Ship of the Line").html, /<details><summary>1 more stats<\/summary><ul class="ustats"><li><span>Ship Power Projection<\/span>/);
  assert.equal(card("Ironclad").text, "Ironclad Locked: needs Ironclad tech Ship Armor +40");
});

test("a ship is marked obsolete once the country has the tech that replaces it", () => {
  const gbr = state.byTag.GBR;
  gbr.techSet.add("ironclad_tech");
  openKind("ships");
  assert.match(card("Frigate").html, /<span class="pill">Obsolete<\/span>/);
  gbr.techSet.delete("ironclad_tech");
});

test("a mobilization option: its description, effects, upkeep, and what it needs", () => {
  openKind("mobilization");
  assert.equal(card("Basic Supplies").text, "Basic Supplies Available from the start Bare minimum. Upkeep: Grain 0.75");
  assert.equal(card("Bloc Drill").status, "av");
  assert.equal(card("Bloc Drill").text, "Bloc Drill Needs power bloc principle: Military Coordination Needs a power bloc. Needs in the market: Small Arms");
});

test("a tech named on a card opens it in the tech tree", () => {
  openKind("units");
  fire("unitGrid", "click", { matches: ["[data-goto]"], dataset: { goto: "gunsmithing" } });
  assert.equal(document.querySelector(".view.on").id, "techView");
  assert.equal(state.focusTech, "gunsmithing");
  assert.equal(location.hash, "#GBR/gunsmithing");
});
