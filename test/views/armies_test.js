// js/views/armies.js: the armies & navies table, its sorting, and the sidebar ranking that follows it.
import { html, fire, until } from "../test_helper.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { state } from "../../js/state.js";
import { showView } from "../../js/page.js";
import "../../js/application.js";

await until(() => state.data && html("tree"));
const rows = id => [...html(id).matchAll(/<tr data-tag="(\w+)"/g)].map(m => m[1]);
const sidebar = () => [...html("countries").matchAll(/data-tag="(\w+)"/g)].map(m => m[1]);

test("opening the tab: European countries by battalions, and its address", () => {
  showView("armyView");
  assert.equal(location.hash, "#GBR/army");
  assert.deepEqual(rows("armyTable"), ["FRA", "GBR"]);
  assert.match(html("armyTable"), /<th data-sort="battalions" class="sorted">Battalions ↓<\/th>/);
});

test("the sidebar ranks by the table's sort column", () => {
  assert.match(html("countries"), /<h3>Europe · by battalions<\/h3>/);
  assert.deepEqual(sidebar(), ["FRA", "GBR"]);
});

test("a row: battalions, men, the composition bar by unit group, ships and military techs", () => {
  const gbr = html("armyTable").split('<tr data-tag="GBR"')[1].split("</tr>")[0];
  assert.deepEqual([...gbr.matchAll(/<td class="num"[^>]*>([^<]*)<\/td>/g)].map(m => m[1]), ["12", "12,000", "8", "4"]);
  assert.match(gbr, /<i style="flex:10;background:var\(--inf\)"><\/i><i style="flex:2;background:var\(--cav\)"><\/i>/);
});

test("sorting: a click sorts by that column, a second click reverses it; names start A to Z", () => {
  fire("armyTable", "click", { matches: ["th"], dataset: { sort: "ships" } });
  assert.deepEqual(rows("armyTable"), ["GBR", "FRA"]);
  assert.match(html("countries"), /by ships/);
  fire("armyTable", "click", { matches: ["th"], dataset: { sort: "ships" } });
  assert.deepEqual(rows("armyTable"), ["FRA", "GBR"]);
  fire("armyTable", "click", { matches: ["th"], dataset: { sort: "name" } });
  assert.deepEqual(rows("armyTable"), ["FRA", "GBR"], "France, Great Britain");
});

test("Whole world adds countries outside Europe that have an army or navy", () => {
  fire("armyTable", "click", { matches: ["th"], dataset: { sort: "battalions" } });
  state.scope = "all"; showView("armyView");
  assert.deepEqual(rows("armyTable"), ["FRA", "GBR", "JAP"]);
  state.scope = "europe";
});

test("clicking a row pins that country", () => {
  fire("armyTable", "click", { matches: ["tr[data-tag]"], dataset: { tag: "FRA" } });
  assert.equal(state.pinned, "FRA");
  assert.equal(location.hash, "#FRA/army");
  assert.match(html("current"), /<b class="cname">France<\/b>/);
});
