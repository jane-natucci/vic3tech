// js/sidebar.js: the country list -- what it ranks countries by on each tab, search, Europe / Whole world.
import { html, fire, until } from "./test_helper.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { state } from "../js/state.js";
import { showView } from "../js/page.js";
import { loadEconomy } from "../js/views/economy.js";
import "../js/application.js";

await until(() => state.data && html("current"));
await loadEconomy();

// The list as "heading | TAG count, TAG count, ...".
const sidebar = () => {
  const h = html("countries");
  const heading = /<h3>([^<]*)<\/h3>/.exec(h)?.[1] ?? h;
  const rows = [...h.matchAll(/data-tag="(\w+)">[\s\S]*?<span class="count">([^<]*)<\/span>/g)].map(m => `${m[1]} ${m[2]}`);
  return `${heading} | ${rows.join(", ")}`;
};
const click = (id, dataset, matches = ["button"]) => fire(id, "click", { matches, dataset });

test("Technology: the open category's tech count, out of how many there are", () => {
  assert.equal(sidebar(), "Europe · by military techs | GBR 4/7, FRA 2/7");
  click("subtabs", { cat: "production" });
  assert.equal(sidebar(), "Europe · by production techs | FRA 1/2, GBR 1/2", "ties go to the bigger army");
  click("subtabs", { cat: "military" });
});

test("Armies: whatever the table is sorted by", () => {
  showView("armyView");
  assert.equal(sidebar(), "Europe · by battalions | FRA 20, GBR 12");
  for (const [sort, expected] of [["ships", "Europe · by ships | GBR 8, FRA 2"], ["men", "Europe · by men | FRA 20,000, GBR 12,000"],
    ["military", "Europe · by military techs | GBR 4/7, FRA 2/7"], ["name", "Europe · by battalions | FRA 20, GBR 12"]]) {
    click("armyTable", { sort }, ["th"]);
    assert.equal(sidebar(), expected);
  }
});

test("Units: how many of the open kind each country can build", () => {
  showView("unitView");
  for (const [kind, expected] of [["units", "Europe · by army units it can build | GBR 3/3, FRA 2/3"],
    ["ships", "Europe · by ships it can build | GBR 2/3, FRA 1/3"], ["mobilization", "Europe · by mobilization options it can build | FRA 1/2, GBR 1/2"]]) {
    click("unitTabs", { kind });
    assert.equal(sidebar(), expected);
  }
});

test("Economy: the table's sort column, buildings or resources", () => {
  showView("economyView");
  click("econTabs", { econ: "buildings" });
  assert.equal(sidebar(), "Europe · by building levels | GBR 14, FRA 6");
  click("econTable", { sort: "industry" }, ["th"]);
  assert.equal(sidebar(), "Europe · by industry building levels | GBR 5, FRA 0");
  click("econTabs", { econ: "resources" });
  assert.equal(sidebar(), "Europe · by arable land | GBR 50, FRA 10");
  click("econTable", { sort: "building_gold_mine" }, ["th"]);
  assert.equal(sidebar(), "Europe · by gold mines | GBR 5, FRA 0");
  click("econTable", { sort: "name" }, ["th"]);
  assert.equal(sidebar(), "Europe · by arable land | GBR 50, FRA 10", "sorted by name: ranked by arable land");
});

test("Trade: treaties, or trade center levels", () => {
  showView("tradeView");
  click("tradeTabs", { trade: "treaties" });
  assert.equal(sidebar(), "Europe · by treaties | FRA 1, GBR 1");
  click("tradeTabs", { trade: "centers" });
  assert.equal(sidebar(), "Europe · by trade center levels | GBR 2, FRA 0");
});

test("Laws: progressiveness, with meters starting from the lowest value", () => {
  showView("lawView");
  assert.equal(sidebar(), "Europe · by progressiveness | GBR 25, FRA -25");
  const widths = [...html("countries").matchAll(/<span class="meter"><i style="width:([\d.]+)%"><\/i><\/span>/g)].map(m => +m[1]);
  assert.deepEqual(widths, [100, 0]);
});

test("Whole world: every country, and the open tab redrawn for it", () => {
  const [europe, world] = document.querySelectorAll("input[name=scope]");
  world.listeners.change.forEach(fn => fn());
  assert.equal(sidebar(), "All countries · by progressiveness | GBR 25, FRA -25, JAP -50");
  assert.match(html("lawBody"), /law-row/);
  europe.listeners.change.forEach(fn => fn());
  assert.equal(state.scope, "europe");
});

test("search: by name, by the game's name, by tag, through every country; nothing found says so", () => {
  const search = q => { document.getElementById("search").value = q; fire("search", "input"); return sidebar(); };
  assert.equal(search("japan"), "Europe · by progressiveness | JAP -50");
  assert.equal(search("fra"), "Europe · by progressiveness | FRA -25", "the tag");
  assert.equal(search("grèat"), "Europe · by progressiveness | GBR 25", "accents don't matter");
  assert.equal(search("atlantis"), `<p class="hint">No matches.</p> | `);
  search("");
});
