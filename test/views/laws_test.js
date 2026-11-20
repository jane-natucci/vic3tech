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

const text = h => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const openCountryView = (tag = "GBR") => {
  state.pinned = tag; state.lawFocus = null;
  fire("lawTabs", "click", { matches: ["button"], dataset: { lawKind: "country" } });
};
const chip = id => new RegExp(`<button class="law[^"]*" data-law="${id}" title="([^"]*)"`).exec(html("lawBody"))?.[1];

test("the sub-tabs: the open country, and across countries", () => {
  openCountryView();
  assert.equal(html("lawTabs"), `<button data-law-kind="country" class="on">Great Britain</button><button data-law-kind="compare" class="">Across countries</button>`);
});

test("the country view: a heading per category, a row per group, the country's law first", () => {
  const body = text(html("lawBody"));
  assert.equal(body, "Power structure Governance Principles Monarchy Presidential Republic Subjecthood Army Model Professional Army Peasant Levies Human rights Internal Security No Home Affairs");
});

test("a law's tooltip: its name, progressiveness, what it needs, its effects", () => {
  assert.equal(chip("law_monarchy"), "Monarchy");
  assert.equal(chip("law_presidential_republic"), "Presidential Republic\nprogressiveness +50\nneeds Rationalism");
  assert.equal(chip("law_subjecthood"), "Subjecthood\nprogressiveness -10\nneeds one of: Presidential Republic");
  assert.equal(chip("law_peasant_levies"), "Peasant Levies\nprogressiveness -50\nMorale Loss: +10%");
});

test("a law's box when the country doesn't have it: what it needs, ticked or crossed", () => {
  fire("lawBody", "click", { matches: ["[data-law]"], dataset: { law: "law_subjecthood" } });
  const box = html("lawBody").split('<div class="law-box">')[1];
  assert.match(text(box), /^Subjecthood Governance Principles Close Great Britain doesn't have this law · no technology needed · needs one of these laws: Presidential Republic · progressiveness -10 Needs a monarchy\. 0 of 2 European countries start with it\./);
  assert.match(box, /<span class="no">Presidential Republic<\/span>/);
  fire("lawBody", "click", { matches: ["[data-law]"], dataset: { law: "law_presidential_republic" } });
  assert.match(html("lawBody"), /needs <span class="no">Rationalism ✗<\/span>/);
});

test("clicking the open law again, or Close, closes its box", () => {
  fire("lawBody", "click", { matches: ["[data-law]"], dataset: { law: "law_presidential_republic" } });
  assert.equal(state.lawFocus, null);
  fire("lawBody", "click", { matches: ["[data-law]"], dataset: { law: "law_monarchy" } });
  assert.match(html("lawBody"), /law-box/);
  fire("lawBody", "click", { matches: ["[data-law-close]"] });
  assert.doesNotMatch(html("lawBody"), /law-box/);
});

test("the box's flags pin a country", () => {
  fire("lawBody", "click", { matches: ["[data-law]"], dataset: { law: "law_monarchy" } });
  assert.match(text(html("lawBody")), /2 of 2 European countries start with it — click a flag to see that country:/);
  assert.match(html("lawBody"), /<span data-tag="GBR" class="pinned">/);
  fire("lawBody", "click", { matches: ["[data-tag]"], dataset: { tag: "FRA" } });
  assert.equal(state.pinned, "FRA");
});

test("with a save: the year a law was enacted, and the wording", () => {
  const gbr = country("GBR");
  gbr.lawSince = { law_monarchy: "1836.1.1", law_professional_army: "1840.6.1" };
  state.saveInfo = { date: "1841.1.1" };
  try {
    openCountryView();
    assert.match(html("lawBody"), /title="Professional Army">Professional Army <span class="since">since 1840<\/span>/);
    assert.match(html("lawBody"), /title="Monarchy">(<img[^>]*>)?Monarchy<\/button>/, "enacted at the start: no year");
    assert.match(html("lawNote"), /^Great Britain's laws in your save, highlighted, with the year for laws enacted after 1836\./);
    fire("lawBody", "click", { matches: ["[data-law]"], dataset: { law: "law_professional_army" } });
    assert.match(text(html("lawBody")), /Great Britain has this law since 1840 · needs Standing army ✓/);
    assert.match(text(html("lawBody")), /1 of 2 European countries have it/);
  } finally {
    delete gbr.lawSince; state.saveInfo = null;
  }
});

test("a country with no laws (a save shared before laws were read)", () => {
  const laws = country("JAP").laws;
  country("JAP").laws = [];
  openCountryView("JAP");
  assert.equal(html("lawBody"), `<p class="muted">No laws for Japan.</p>`);
  state.saveInfo = { date: "1841.1.1" };
  try {
    openCountryView("JAP");
    assert.match(html("lawBody"), /No laws for Japan in this save \(shared links made before laws were added don't have them\)\./);
  } finally {
    state.saveInfo = null; country("JAP").laws = laws; openCountryView();
  }
});

test("across countries: the group picker, each law's share, flags, and None", () => {
  fire("lawTabs", "click", { matches: ["button"], dataset: { lawKind: "compare" } });
  fire("lawBody", "change", { id: "lawGroupPick", value: "lawgroup_internal_security" });
  const body = html("lawBody");
  assert.match(body, /<optgroup label="Power structure"><option value="lawgroup_governance_principles">Governance Principles<\/option><option value="lawgroup_army_model">Army Model<\/option><\/optgroup><optgroup label="Human rights"><option value="lawgroup_internal_security" selected>Internal Security<\/option><\/optgroup>/);
  assert.match(body, /<div class="bar"><i style="width:100%"><\/i><\/div>/);
  assert.match(body, /<span class="muted" style="font-size:0.7em">None<\/span>/, "nobody has the Third Section");
  assert.match(html("lawNote"), /^How many European countries start with each internal security law\./);
});

test("across countries with Whole world counts every country with a law in that group", () => {
  state.scope = "all";
  fire("lawBody", "change", { id: "lawGroupPick", value: "lawgroup_army_model" });
  assert.deepEqual([...html("lawBody").matchAll(/(\d+ of \d+) countries/g)].map(m => m[1]), ["2 of 3", "1 of 3"]);
  assert.match(html("lawNote"), /^How many countries start with each army model law\./);
  state.scope = "europe";
});
