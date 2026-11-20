// js/views/tech.js: the tech tree's layout, what a country has / can research / can't yet, research costs,
// and the tree and detail panel as drawn.
import { html, fire, until } from "../test_helper.js";
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
