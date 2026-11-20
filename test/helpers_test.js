// js/helpers.js: escaping, number formats, asset URLs and a country's army, navy and tech counts.
import { html, until } from "./test_helper.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { state } from "../js/state.js";
import { esc, fmtModifier, asset, flagHtml, battalions, ships, menOf, catCount } from "../js/helpers.js";
import "../js/application.js";

await until(() => state.data && html("tree"));
const country = tag => state.byTag[tag];

test("esc makes text safe to put in HTML", () => {
  assert.equal(esc(`<b>"Tom" & Jerry</b>`), "&lt;b&gt;&quot;Tom&quot; &amp; Jerry&lt;/b&gt;");
  assert.equal(esc(null), "");
  assert.equal(esc(12), "12");
});

test("fmtModifier: multipliers as percentages, everything else as a signed number", () => {
  assert.equal(fmtModifier({ key: "unit_offense_mult", value: 0.1 }), "+10%");
  assert.equal(fmtModifier({ key: "unit_morale_loss_mult", value: -0.25 }), "-25%");
  assert.equal(fmtModifier({ key: "unit_offense_add", value: 20 }), "+20");
  assert.equal(fmtModifier({ key: "ship_armor_add", value: -5 }), "-5");
  assert.equal(fmtModifier({ key: "ship_speed_add", value: 0.333 }), "+0.33");
});

test("asset URLs: under /vic3/, with a version (a fresh one per page load in a local preview)", () => {
  assert.match(asset("data.json"), /^\/vic3\/data\.json\?v=\d+$/);
});

test("flagHtml: the country's flag picture, its name escaped", () => {
  const h = flagHtml({ tag: "GBR", name: `Britain "UK"` });
  assert.match(h, /src="\/vic3\/flags\/s\/GBR\.png\?v=/);
  assert.match(h, /title="Britain &quot;UK&quot;"/);
});

test("battalions, ships and men", () => {
  assert.equal(battalions(country("GBR")), 12);
  assert.equal(ships(country("GBR")), 8);
  assert.equal(menOf(country("GBR")), 12000, "1,000 men a battalion at the start");
  assert.equal(menOf({ ...country("GBR"), men: 9500 }), 9500, "a save's real manpower when it has one");
});

test("catCount: a country's techs in one category", () => {
  assert.equal(catCount(country("GBR"), "military"), 4);
  assert.equal(catCount(country("GBR"), "production"), 1);
  assert.equal(catCount(country("JAP"), "military"), 0);
});
