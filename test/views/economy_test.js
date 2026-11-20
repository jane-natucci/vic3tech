// js/views/economy.js: a country's building levels and resources, added up from its states.
import { html, fire, until } from "../test_helper.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { state } from "../../js/state.js";
import { showView } from "../../js/page.js";
import { loadEconomy, aggregateEconomy, econOf } from "../../js/views/economy.js";
import "../../js/application.js";

await until(() => state.data && html("tree"));
await loadEconomy();
const country = tag => state.byTag[tag];

test("levels and sectors: every building of every state", () => {
  const e = econOf(country("GBR"));
  assert.deepEqual(e.levels, { building_textile_mill: 5, building_wheat_farm: 3, building_trade_center: 2, building_iron_mine: 4 });
  assert.deepEqual(e.sectors, { industry: 5, agriculture: 3, infrastructure: 2, extraction: 4 });
  assert.equal(e.total, 14);
});

test("resources: a split state counts by the country's share of its provinces", () => {
  const r = econOf(country("GBR")).resources;
  assert.deepEqual(r.arable_land, { amount: 40 + 20 * 0.5, undiscovered: 0 });
  assert.deepEqual(r.building_iron_mine, { amount: 20 + 10 * 0.5, undiscovered: 0 });
  assert.deepEqual(r.building_gold_mine, { amount: 1, undiscovered: 4 });
});

test("resource columns: most plentiful worldwide first, arable land kept apart", async () => {
  const e = await loadEconomy();
  assert.deepEqual(e.resourceIds, ["building_iron_mine", "building_gold_mine"]);
});

test("a save's states give their own arable land instead of a share of the region's", () => {
  const e = { buildings: {}, countries: { X: { states: [{ share: 0.5, arable_land: 100, arable_owned: 37, capped: {}, discoverable: {}, buildings: {} }] } } };
  aggregateEconomy(e);
  assert.equal(e.countries.X.resources.arable_land.amount, 37);
});

test("a country with no economy data counts as empty", () => {
  assert.equal(econOf({ tag: "XXX" }).total, 0);
});

test("the buildings table: European countries by building levels, a column per sector", () => {
  showView("economyView");
  assert.equal(location.hash, "#GBR/economy/buildings");
  assert.deepEqual([...html("econTable").matchAll(/<tr data-tag="(\w+)"/g)].map(m => m[1]), ["GBR", "FRA"]);
  assert.match(html("econDetail"), /<h2>Great Britain<\/h2><div class="meta">2 states · 14 building levels/);
  assert.match(html("countries"), /by building levels/);
});

test("the resources table, sorted by a resource", () => {
  fire("econTabs", "click", { matches: ["button"], dataset: { econ: "resources" } });
  assert.equal(location.hash, "#GBR/economy/resources");
  fire("econTable", "click", { matches: ["th"], dataset: { sort: "building_iron_mine" } });
  assert.deepEqual([...html("econTable").matchAll(/<tr data-tag="(\w+)"/g)].map(m => m[1]), ["GBR", "FRA"]);
  assert.match(html("countries"), /by iron mines/);
});
