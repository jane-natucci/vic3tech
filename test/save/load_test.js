// js/save/load.js: showing a loaded save in every tab instead of 1836, and going back.
import { html, until } from "../test_helper.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { state } from "../../js/state.js";
import { econOf } from "../../js/views/economy.js";
import { applySave, backTo1836, gameDate } from "../../js/save/load.js";
import "../../js/application.js";

await until(() => state.data && html("tree"));

// What vic3/save-worker.js hands the page (see save_worker_test.js): France, and D09, a country formed mid-game
// that has no name in the game files.
const summary = {
  date: "1841.3.8", player: "FRA", treaties: [], prices: [],
  countries: [
    { tag: "FRA", capitalRegion: "STATE_BRETLAND", prestige: 10.4, gdp: 2_500_000,
      techs: ["navigation", "drydocks", "not_a_tech"], laws: [{ id: "law_monarchy", since: "1836.1.1" }, { id: "law_professional_army", since: "1840.6.1" }],
      army: { combat_unit_type_line_infantry: { count: 3, manpower: 2500 } }, navy: { ship_type_frigate: 4 },
      states: [{ region: "STATE_BRETLAND", arable_land: 15, provinces: 2, buildings: { building_wheat_farm: 5, building_barracks: 1 }, trade: {} }] },
    { tag: "D09", capitalRegion: "STATE_KYUSHU", prestige: 0, gdp: 0, techs: [], laws: [], army: {}, navy: {},
      states: [{ region: "STATE_KYUSHU", arable_land: 30, provinces: 6, buildings: {}, trade: {} }] },
  ],
};

// The recent-saves list needs IndexedDB, which Node doesn't have: the app warns and carries on, as in a private window.
const warn = console.warn; console.warn = () => {};
await applySave(summary, "france_1841_03_08_melted.v3");
await new Promise(r => setTimeout(r, 50)); // it remembers the save after showing it
console.warn = warn;
const fra = () => state.byTag.FRA;

test("the save's countries replace the 1836 ones, and the player's country opens", () => {
  assert.deepEqual(state.data.countries.map(c => c.tag), ["FRA", "D09"]);
  assert.equal(state.pinned, "FRA");
  assert.equal(document.getElementById("eraLabel").textContent, "8 Mar 1841");
  assert.match(html("saveStatus"), /<b>Your save<\/b><span>playing France<\/span>/);
});

test("a country from the save: known techs only, real manpower, its army and navy named from the data", () => {
  assert.deepEqual(fra().techs, ["navigation", "drydocks"]);
  assert.equal(fra().men, 2500);
  assert.deepEqual(fra().army.combat_unit_type_line_infantry, { name: "Line Infantry", group: "infantry", count: 3, manpower: 2500 });
  assert.deepEqual(fra().navy.ship_type_frigate, { name: "Frigate", count: 4 });
  assert.deepEqual(fra().laws, ["law_monarchy", "law_professional_army"]);
  assert.equal(fra().lawSince.law_professional_army, "1840.6.1");
});

test("a country formed mid-game is named after its capital's region", () => {
  assert.equal(state.byTag.D09.name, "Kyushu");
  assert.equal(state.byTag.D09.region, "asia");
});

test("the header shows the save's prestige and GDP", () => {
  assert.match(html("current"), /10 prestige · £2\.5M/);
});

test("the economy: the save's states, its own arable land, buildings the page doesn't show left out", () => {
  const e = econOf(fra());
  assert.deepEqual(e.levels, { building_wheat_farm: 5 });
  assert.equal(e.states[0].share, 0.5, "2 of the region's 4 provinces");
  assert.equal(e.resources.arable_land.amount, 15);
});

test("back to 1836 restores the start", () => {
  backTo1836();
  assert.deepEqual(state.data.countries.map(c => c.tag), ["GBR", "FRA", "JAP"]);
  assert.equal(state.saveInfo, null);
  assert.equal(document.getElementById("eraLabel").textContent, "1836 start");
  assert.equal(econOf(state.byTag.GBR).total, 14);
});

test("gameDate", () => {
  assert.equal(gameDate("1836.1.1"), "1 Jan 1836");
});
