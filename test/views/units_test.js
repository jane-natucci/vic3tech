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
