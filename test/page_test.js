// js/page.js and the start-up in js/application.js: the #hash in the address (country, tab, sub-tab or tech) and
// opening the page from such a link.
import { html, fire, until } from "./test_helper.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { state } from "../js/state.js";
import { parseHash } from "../js/page.js";

// Open the page from a shared link: the app reads the hash once its data has loaded.
location.hash = "#fra/economy/resources";
await import("../js/application.js");
await until(() => state.data && html("current"));

test("a link opens on its country, tab and sub-tab", () => {
  assert.equal(state.pinned, "FRA");
  assert.equal(state.econKind, "resources");
  assert.equal(document.querySelector(".view.on").id, "economyView");
  assert.match(html("current"), /<b class="cname">France<\/b>/);
});

test("parseHash: the forms an address can take", () => {
  const parse = hash => { location.hash = hash; return parseHash(); };
  assert.deepEqual(parse(""), { tag: null, techId: null, view: null, sub: null });
  assert.deepEqual(parse("#gbr"), { tag: "GBR", techId: null, view: null, sub: null });
  assert.deepEqual(parse("#GBR/admiralty"), { tag: "GBR", techId: "admiralty", view: null, sub: null });
  assert.deepEqual(parse("#GBR/army"), { tag: "GBR", techId: null, view: "armyView", sub: null });
  assert.deepEqual(parse("#GBR/units/ships"), { tag: "GBR", techId: null, view: "unitView", sub: "ships" });
  assert.deepEqual(parse("#GBR/economy/nonsense"), { tag: "GBR", techId: null, view: "economyView", sub: null }, "an unknown sub-tab is ignored");
});

test("following a link to another tab of the same country", () => {
  location.hash = "#FRA/army";
  fire("window", "hashchange");
  assert.equal(document.querySelector(".view.on").id, "armyView");
});

test("following a link to a tech opens it in the tree", () => {
  location.hash = "#FRA/drydocks";
  fire("window", "hashchange");
  assert.equal(document.querySelector(".view.on").id, "techView");
  assert.equal(state.focusTech, "drydocks");
  assert.match(html("detail"), /<h2>Drydocks<\/h2>/);
});

test("picking a country in the sidebar keeps the open tab in the address", () => {
  fire("tabs", "click", { matches: ["button"], dataset: { view: "lawView" } });
  fire("aside", "click", { matches: [".country"], dataset: { tag: "GBR" } });
  assert.equal(location.hash, "#GBR/laws/country");
  assert.match(html("current"), /<b class="cname">Great Britain<\/b>/);
});

test("searching the sidebar looks through every country, whatever the scope", () => {
  document.getElementById("search").value = "jap";
  fire("search", "input");
  assert.deepEqual([...html("countries").matchAll(/data-tag="(\w+)"/g)].map(m => m[1]), ["JAP"]);
  document.getElementById("search").value = "";
  fire("search", "input");
});

// A known quirk, kept here so it isn't forgotten: a link to another country *and* another tab pins the country
// first, which writes the old tab into the address, and then opens the new tab without updating it again.
test("following a link to another country's tab keeps that tab in the address", { todo: "the address keeps the old tab" }, () => {
  fire("tabs", "click", { matches: ["button"], dataset: { view: "techView" } });
  location.hash = "#FRA/economy/resources";
  fire("window", "hashchange");
  assert.equal(document.querySelector(".view.on").id, "economyView");
  assert.equal(location.hash, "#FRA/economy/resources");
});
