// js/header.js: the open country's name, flag and headline numbers.
import { html, fire, until } from "./test_helper.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { state } from "../js/state.js";
import { render } from "../js/page.js";
import "../js/application.js";

await until(() => state.data && html("current"));
const text = h => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const statsTitle = () => /class="cstats" title="([^"]*)"/.exec(html("current"))[1];

test("the header: name, tech counts by category, battalions, ships, and the starting-tech tier", () => {
  assert.equal(text(html("current")), "Great Britain Tech 1 / 4 / 1 · 12 battalions · 8 ships Tech tier 1");
  assert.equal(statsTitle(), "1 production · 4 military · 1 society techs · 12 battalions · 8 ships (tech: production / military / society)");
  assert.match(html("current"), /<span class="pill" title="Which starting-tech package the game gives this country">Tech tier 1<\/span>/);
});

test("a country from a save: no tier, and its prestige and GDP", () => {
  const gbr = state.byTag.GBR;
  Object.assign(gbr, { tier: null, prestige: 1234.4, gdp: 98_760_000 });
  try {
    render();
    assert.equal(text(html("current")), "Great Britain Tech 1 / 4 / 1 · 12 battalions · 8 ships · 1,234 prestige · £98.8M");
    assert.match(statsTitle(), /8 ships · 1,234 prestige · £98\.8M GDP \(tech:/);
  } finally {
    Object.assign(gbr, { tier: 1 }); delete gbr.prestige; delete gbr.gdp;
    render();
  }
});

test("hovering a country in the sidebar previews it in the header, until the pointer leaves", () => {
  fire("aside", "mouseover", { matches: [".country"], dataset: { tag: "FRA" } });
  assert.equal(state.preview, "FRA");
  assert.match(text(html("current")), /^France .* preview$/);
  fire("aside", "mouseleave");
  assert.equal(state.preview, null);
  assert.match(text(html("current")), /^Great Britain/);
});
