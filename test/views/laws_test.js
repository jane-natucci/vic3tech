// js/views/laws.js: progressiveness, which laws a country can't enact yet, and the laws tab as drawn.
import { html, fire, until } from "../test_helper.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { state } from "../../js/state.js";
import { showView } from "../../js/page.js";
import { progressiveness, lawGroupsOf, lawNeedsLaw, lawLocked, lawShown } from "../../js/views/laws.js";
import "../../js/application.js";

await until(() => state.data && html("tree"));
const country = tag => state.byTag[tag];

test("progressiveness: the country's laws added up", () => {
  assert.equal(progressiveness(country("GBR")), 25);
  assert.equal(progressiveness(country("FRA")), -25);
  assert.equal(progressiveness(country("JAP")), -50);
});

test("lawGroupsOf: only the groups a country has a law in", () => {
  assert.deepEqual(lawGroupsOf(country("JAP")).map(g => g.id), ["lawgroup_governance_principles", "lawgroup_army_model"]);
  assert.equal(lawGroupsOf(country("GBR")).length, 3);
});

test("lawLocked: a tech the country lacks, or none of the laws it goes with", () => {
  assert.equal(lawLocked(country("GBR"), "law_presidential_republic"), true, "needs Rationalism");
  assert.equal(lawLocked(country("FRA"), "law_professional_army"), false, "France has Standing Army");
  assert.equal(lawLocked(country("JAP"), "law_professional_army"), true);
  assert.equal(lawNeedsLaw(country("GBR"), "law_subjecthood"), true);
  assert.equal(lawLocked(country("GBR"), "law_monarchy"), false);
});

test("lawShown: laws the game only shows to named countries are hidden from the rest", () => {
  assert.equal(lawShown(country("GBR"), "law_third_section"), false);
  assert.equal(lawShown({ tag: "RUS", laws: [] }, "law_third_section"), true);
  assert.equal(lawShown(country("GBR"), "law_monarchy"), true);
});

test("the country view: its law first in each group, the others dimmed when locked", () => {
  showView("lawView");
  assert.equal(location.hash, "#GBR/laws/country");
  const body = html("lawBody");
  assert.match(body, /<button class="law on" data-law="law_monarchy"/);
  assert.match(body, /<button class="law locked" data-law="law_presidential_republic"/);
  assert.doesNotMatch(body, /law_third_section/);
  assert.deepEqual([...html("countries").matchAll(/data-tag="(\w+)"/g)].map(m => m[1]), ["GBR", "FRA"], "ranked by progressiveness");
});

test("clicking a law opens its box: what it needs and which countries have it", () => {
  fire("lawBody", "click", { matches: ["[data-law]"], dataset: { law: "law_professional_army" } });
  assert.equal(state.lawFocus, "law_professional_army");
  assert.match(html("lawBody"), /Great Britain has this law · needs <span class="ok">Standing army ✓<\/span>/);
  assert.match(html("lawBody"), /1 of 2 European countries start with it/);
});

test("comparing a group across countries", () => {
  fire("lawBody", "click", { matches: ["[data-law-compare]"], dataset: { lawCompare: "lawgroup_army_model" } });
  assert.equal(location.hash, "#GBR/laws/compare");
  const shares = [...html("lawBody").matchAll(/(\d+) of (\d+) countries/g)].map(m => m[0]);
  assert.deepEqual(shares, ["1 of 2 countries", "1 of 2 countries"]);
});
