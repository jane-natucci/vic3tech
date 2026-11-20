// js/views/economy.js: a country's building levels and resources, added up from its states.
import { html, fire, until } from "../test_helper.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { state } from "../../js/state.js";
import { showView } from "../../js/page.js";
import { loadEconomy, aggregateEconomy, econOf, economy } from "../../js/views/economy.js";
import "../../js/application.js";

await until(() => state.data && html("tree"));
// Opening the tab before economy.json has arrived (it's loaded the first time it's needed).
showView("economyView");
const whileLoading = html("econTable");
await loadEconomy();
showView("techView");
const country = tag => state.byTag[tag];

test("the table says Loading… until economy.json arrives", () => {
  assert.equal(whileLoading, `<tr><td class="muted">Loading…</td></tr>`);
});

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

const text = h => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const open = (kind, tag = "GBR") => {
  state.pinned = tag;
  fire("econTabs", "click", { matches: ["button"], dataset: { econ: kind } });
};

test("the sub-tabs and, for buildings, the sector legend", () => {
  open("buildings");
  assert.equal(text(html("econTabs")), "Buildings in 1836 Resources Industry Agriculture Extraction Infrastructure Government Urban");
  assert.match(html("econTabs"), /<span class="sw" style="background:var\(--sotl\)"><\/span>Infrastructure/);
  open("resources");
  assert.equal(text(html("econTabs")), "Buildings in 1836 Resources");
});

test("the buildings table: levels, the bar by sector, a column per sector (Urban only once a country has 10)", () => {
  open("buildings");
  const table = html("econTable");
  assert.equal(text(table.split("</tr>")[0]), "Country Levels ↓ By sector Industry Agriculture Extraction Infrastructure Government");
  const gbr = table.split('<tr data-tag="GBR"')[1].split("</tr>")[0];
  assert.deepEqual([...gbr.matchAll(/<td class="num">([^<]*)<\/td>/g)].map(m => m[1]), ["14", "5", "3", "4", "2", "–"]);
  assert.match(gbr, /<div class="stack" style="width:100%"><i style="flex:5;background:var\(--art\)"><\/i><i style="flex:3;background:var\(--inf\)"><\/i><i style="flex:4;background:var\(--cav\)"><\/i><i style="flex:2;background:var\(--sotl\)"><\/i><\/div>/);
});

test("the Urban column appears once a country has 10 urban building levels", () => {
  economy.buildings.building_urban_center = { name: "Urban Centers", sector: "urban", icon: "" };
  const avalon = economy.countries.GBR.states[0];
  avalon.buildings.building_urban_center = 12;
  try {
    aggregateEconomy(economy); open("buildings");
    assert.match(text(html("econTable").split("</tr>")[0]), /Government Urban$/);
  } finally {
    delete avalon.buildings.building_urban_center; delete economy.buildings.building_urban_center;
    aggregateEconomy(economy);
  }
});

test("sorting the buildings table by a sector, and the sidebar following it", () => {
  open("buildings");
  fire("econTable", "click", { matches: ["th"], dataset: { sort: "agriculture" } });
  assert.deepEqual([...html("econTable").matchAll(/<tr data-tag="(\w+)"/g)].map(m => m[1]), ["FRA", "GBR"]);
  assert.match(html("countries"), /by agriculture building levels/);
  fire("econTable", "click", { matches: ["th"], dataset: { sort: "total" } });
});

test("the building tooltip: each sector's share, then its building types, at most six", () => {
  const hover = tag => {
    fire("econTable", "mousemove", { matches: ["[data-tip]", "tr"], dataset: { tip: "econ", tag } });
    return text(html("tip"));
  };
  assert.equal(hover("GBR"), "Great Britain · 14 building levels Industry (36%) 5 Textile Mills 5 Agriculture (21%) 3 Wheat Farms 3 Extraction (29%) 4 Iron Mines 4 Infrastructure (14%) 2 Trade Center 2");
  const e = econOf(country("GBR"));
  for (let i = 1; i <= 7; i++) {
    economy.buildings[`building_fake_${i}`] = { name: `Fake ${i}`, sector: "industry" };
    e.levels[`building_fake_${i}`] = 1;
  }
  e.sectors.industry += 7; e.total += 7;
  try {
    assert.match(hover("GBR"), /Industry \(57%\) 12 Textile Mills 5 Fake 1 1 Fake 2 1 Fake 3 1 Fake 4 1 Fake 5 1 \+2 more Agriculture/);
  } finally {
    for (let i = 1; i <= 7; i++) delete economy.buildings[`building_fake_${i}`];
    aggregateEconomy(economy);
  }
});

test("the buildings panel: by sector, then by state, biggest first", () => {
  open("buildings");
  assert.equal(text(html("econDetail")),
    "Great Britain 2 states · 14 building levels Industry · 5 Textile Mills 5 Agriculture · 3 Wheat Farms 3 Extraction · 4 Iron Mines 4 Infrastructure · 2 Trade Center 2 " +
    "By state Avalon 10 Textile Mills 5 Wheat Farms 3 Trade Center 2 Bretland 4 Iron Mines 4");
  assert.match(html("econDetail"), /<h3><span class="sw" style="background:var\(--art\)"><\/span>Industry · 5<\/h3><ul class="blist"><li><span><img class="ico" src="\/vic3\/buildings\/textile\.png\?v=\d+" alt="">Textile Mills<\/span><span class="v">5<\/span><\/li><\/ul>/);
  open("buildings", "JAP");
  assert.match(text(html("econDetail")), /By state Kyushu 2 Wheat Farms 2 Ezo 0 No buildings$/);
});

test("the resources table: arable land first, then the most plentiful; +N undiscovered; – for none", () => {
  open("resources");
  const table = html("econTable");
  assert.equal(text(table.split("</tr>")[0]), "Country Arable land ↓ Iron Gold");
  assert.match(table.split("</tr>")[0], /<th data-sort="building_iron_mine" class=""><img class="ico" src="\/vic3\/buildings\/iron\.png\?v=\d+" alt="">Iron<\/th>/);
  const cells = tag => [...table.split(`<tr data-tag="${tag}"`)[1].split("</tr>")[0].matchAll(/<td class="num">(.*?)<\/td>/g)].map(m => m[1]);
  assert.deepEqual(cells("GBR"), ["50", "25", `1 <i class="muted">+4</i>`]);
  assert.deepEqual(cells("FRA"), ["10", "5", "–"]);
});

test("the resources panel: totals, the farms it can build, and each state's share of its region", () => {
  open("resources");
  assert.equal(text(html("econDetail")),
    "Great Britain 2 states · 14 building levels Total potential Arable land 50 Iron Mines 25 Gold Mines 1 +4 " +
    "Farms & plantations it can build Wheat Farms 2 states " +
    "By state Avalon 40 arable Iron Mines 20 Gold Mines 1 +4 Crops: Wheat Farms Bretland (50% of region) 10 arable Iron Mines 5 Crops: Wheat Farms");
  open("resources", "JAP");
  assert.match(text(html("econDetail")), /Ezo 10 arable Crops: none$/);
});

test("the notes: what the numbers mean, for the 1836 start and for a save", () => {
  open("buildings");
  assert.match(html("econNote"), /^Building levels each country starts with, by sector\./);
  open("resources");
  assert.match(html("econNote"), /^How much of each resource a country's states can ever support: arable land/);
  state.saveInfo = { date: "1841.1.1" };
  try {
    open("buildings");
    assert.match(html("econNote"), /^Building levels each country has in your save, by sector\./);
    assert.match(text(html("econTabs")), /^Buildings Resources/);
    open("resources");
    assert.match(html("econNote"), /^How much of each resource a country's states can ever support, from your save:/);
  } finally {
    state.saveInfo = null;
  }
});

test("the building tooltip writes big numbers with a thousands separator, like the army tooltip", () => {
  const avalon = economy.countries.GBR.states[0];
  avalon.buildings.building_textile_mill = 1520;
  try {
    aggregateEconomy(economy);
    fire("econTable", "mousemove", { matches: ["[data-tip]", "tr"], dataset: { tip: "econ", tag: "GBR" } });
    assert.match(text(html("tip")), /Industry \(99%\) 1,520 Textile Mills 1,520/);
  } finally {
    avalon.buildings.building_textile_mill = 5;
    aggregateEconomy(economy);
  }
});
