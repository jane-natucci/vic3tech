// js/views/armies.js: the armies & navies table, its sorting, and the sidebar ranking that follows it.
import { html, fire, until } from "../test_helper.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { state } from "../../js/state.js";
import { showView } from "../../js/page.js";
import { armyByGroup } from "../../js/views/armies.js";
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

test("armyByGroup: the groups a country has, in the bar's order, each with its unit types biggest first", () => {
  const groups = armyByGroup(state.byTag.GBR);
  assert.deepEqual(groups.map(g => [g.id, g.count, g.units.map(u => u.name)]),
    [["infantry", 10, ["Line Infantry"]], ["cavalry", 2, ["Hussars"]]]);
  assert.deepEqual(armyByGroup({ army: {} }), []);
});

test("the legend: one colour per unit group", () => {
  assert.equal(html("armyLegend"), ["Infantry|--inf", "Cavalry|--cav", "Artillery|--art", "Other|--other"]
    .map(s => s.split("|")).map(([label, v]) => `<span><span class="sw" style="background:var(${v})"></span>${label}</span>`).join(""));
});

// Hovering a bar: the tooltip's text, without its markup.
const hover = (tag, tip) => {
  fire("armyTable", "mousemove", { matches: ["[data-tip]", "tr"], dataset: { tip, tag } });
  return html("tip").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
};

test("the army tooltip: each unit group's share, then its unit types, biggest first", () => {
  assert.equal(hover("GBR", "army"), "Great Britain · 12 battalions Infantry (83%) 10 Line Infantry 10 Cavalry (17%) 2 Hussars 2");
});

test("a unit of a group the bar doesn't have a colour for counts as Other", () => {
  const army = state.byTag.JAP.army;
  state.byTag.JAP.army = { ...army, marines: { name: "Marines", group: "marines", count: 1 } };
  assert.equal(hover("JAP", "army"), "Japan · 5 battalions Infantry (80%) 4 Irregular Infantry 4 Other (20%) 1 Marines 1");
  state.byTag.JAP.army = army;
});

test("the navy tooltip: ship types, biggest first", () => {
  assert.equal(hover("GBR", "navy"), "Great Britain · 8 ships Ship of the Line 5 Frigate 3");
  assert.equal(hover("JAP", "navy"), "Japan · 0 ships No starting navy");
});

test("clicking a row pins that country", () => {
  fire("armyTable", "click", { matches: ["tr[data-tag]"], dataset: { tag: "FRA" } });
  assert.equal(state.pinned, "FRA");
  assert.equal(location.hash, "#FRA/army");
  assert.match(html("current"), /<b class="cname">France<\/b>/);
});
