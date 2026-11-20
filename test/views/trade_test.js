// js/views/trade.js: treaty dates and values, prices from a save, and the trade tab as drawn.
import { html, fire, until } from "../test_helper.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { state } from "../../js/state.js";
import { showView } from "../../js/page.js";
import { treatyDate, articleValue, saveGoods, priceOf } from "../../js/views/trade.js";
import "../../js/application.js";

await until(() => state.data && html("tree"));
const [treaty] = state.data.treaties;
const [money, goods, pact] = treaty.articles;

test("treatyDate: a game date, or a year from the raw hours the melter writes for very early dates", () => {
  assert.equal(treatyDate("1815.10.26"), "26 Oct 1815");
  assert.equal(treatyDate(String((1800 + 5000) * 365 * 24)), "1800");
  assert.equal(treatyDate(""), "");
});

test("articleValue: per week, + for the receiving country and − for the giving one", () => {
  assert.equal(articleValue(money, "GBR"), 100);
  assert.equal(articleValue(money, "FRA"), -100);
  assert.equal(articleValue(goods, "FRA"), 10 * 20, "goods at their base price at the start");
  assert.equal(articleValue(goods, "GBR"), -200);
  assert.equal(articleValue(pact, "GBR"), null, "no money value");
});

test("prices from a save: the last of each good's history, numbered by the goods list", () => {
  state.saveTrade = { treaties: [], prices: [[50, 52], [40, 41], [18, 25], []] };
  assert.equal(priceOf("grain"), 25);
  assert.equal(articleValue(goods, "FRA"), 10 * 25, "valued at the save's price");
  state.saveTrade = null;
});

test("a save from before update 1.15 (one price list fewer) numbers its goods without copper", () => {
  state.saveTrade = { treaties: [], prices: [[50, 52], [18, 22], []] };
  assert.deepEqual(saveGoods().map(g => g.id), ["ammunition", "grain", "services"]);
  assert.equal(priceOf("grain"), 22);
  state.saveTrade = null;
});

test("the treaties tab: the open country's treaties and its net per week", () => {
  showView("tradeView");
  assert.equal(location.hash, "#GBR/trade/treaties");
  const body = html("tradeBody");
  assert.match(body, /<h3>Treaty of Example<\/h3>/);
  assert.match(body, /since 26 Oct 1815 · 35 years/);
  assert.match(body, /France → Great Britain<\/span><\/span><span class="val">£100\/wk/);
  assert.match(body, /Net for Great Britain<\/span><span class="neg">−£100\/wk/);
  assert.match(html("countries"), /by treaties/);
});

test("the prices tab lists the goods traded on the world market", () => {
  fire("tradeTabs", "click", { matches: ["button"], dataset: { trade: "prices" } });
  assert.equal([...html("tradeBody").matchAll(/<tr><td>/g)].length, 3, "services aren't traded");
  assert.match(html("tradeBody"), /Grain<\/td><td class="num">£20<\/td>/);
});

// A known bug, kept here so it isn't forgotten: a save from a game's first days has one price per good, and a
// sparkline of one point divides by zero (the browser then logs "Expected number, NaN" for every good).
test("a price history of a single point still draws a valid sparkline", { todo: "draws NaN" }, () => {
  state.saveTrade = { treaties: [], prices: [[50], [40], [20], []] };
  fire("tradeTabs", "click", { matches: ["button"], dataset: { trade: "prices" } });
  const body = html("tradeBody");
  state.saveTrade = null;
  assert.match(body, /<polyline points=/);
  assert.doesNotMatch(body, /NaN/);
});

test("the trade centers tab: the country's trade centers and their levels", async () => {
  fire("tradeTabs", "click", { matches: ["button"], dataset: { trade: "centers" } });
  await until(() => html("tradeBody").includes("Avalon"));
  assert.match(html("tradeBody"), /<tr><td>Avalon<\/td><td class="num">2<\/td><\/tr>/);
  assert.match(html("countries"), /by trade center levels/);
});
