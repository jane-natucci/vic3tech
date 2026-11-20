// js/views/trade.js: treaty dates and values, prices from a save, and the trade tab as drawn.
import { html, fire, until } from "../test_helper.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { state } from "../../js/state.js";
import { showView } from "../../js/page.js";
import { treatyDate, articleValue, saveGoods, priceOf } from "../../js/views/trade.js";
import { loadEconomy, economy } from "../../js/views/economy.js";
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

// A save from a game's first days has one price per good; its sparkline used to divide by zero and draw NaN.
test("a price history of a single point draws a flat line", () => {
  state.saveTrade = { treaties: [], prices: [[50], [40], [20], []] };
  fire("tradeTabs", "click", { matches: ["button"], dataset: { trade: "prices" } });
  const body = html("tradeBody");
  state.saveTrade = null;
  assert.match(body, /<polyline points="1\.0,22\.0 119\.0,22\.0"\/>/);
  assert.doesNotMatch(body, /NaN/);
});

test("a longer price history: oldest on the left, the range scaled to the box", () => {
  state.saveTrade = { treaties: [], prices: [[40, 60, 50], [40], [20], []] };
  fire("tradeTabs", "click", { matches: ["button"], dataset: { trade: "prices" } });
  const body = html("tradeBody");
  state.saveTrade = null;
  assert.match(body, /<polyline points="1\.0,22\.0 60\.0,2\.0 119\.0,12\.0"\/>/);
});

test("the trade centers tab: the country's trade centers and their levels", async () => {
  fire("tradeTabs", "click", { matches: ["button"], dataset: { trade: "centers" } });
  await until(() => html("tradeBody").includes("Avalon"));
  assert.match(html("tradeBody"), /<tr><td>Avalon<\/td><td class="num">2<\/td><\/tr>/);
  assert.match(html("countries"), /by trade center levels/);
});

const text = h => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const open = (kind, tag = "GBR") => {
  state.pinned = tag;
  fire("tradeTabs", "click", { matches: ["button"], dataset: { trade: kind } });
};
// A save's trade data for the length of one test.
function withSave(saveTrade, fn) {
  state.saveTrade = saveTrade; state.saveInfo = { date: "1841.1.1" };
  try { fn(); } finally { state.saveTrade = null; state.saveInfo = null; }
}

test("the sub-tabs, and their names with a save", () => {
  open("treaties");
  assert.equal(text(html("tradeTabs")), "Treaties Prices Trade centers");
  withSave({ treaties: [], prices: [] }, () => {
    open("treaties");
    assert.equal(text(html("tradeTabs")), "Treaties World market prices Trade centers");
  });
});

test("a treaty card in full: title, countries, since, length, each article, net", () => {
  open("treaties");
  assert.equal(text(html("tradeBody")),
    "Treaty of Example Great Britain &amp; France · since 26 Oct 1815 · 35 years " +
    "Money Transfer France → Great Britain £100/wk Goods Transfer Great Britain → France 10 Grain ≈ £200/wk Defensive Pact " +
    "Net for Great Britain −£100/wk");
  assert.match(html("tradeBody"), /<img class="ico-good" src="\/vic3\/goods\/grain\.png\?v=\d+" alt="">10 Grain/);
});

test("the treaty scope: the open country's treaties, or all of them; none says so", () => {
  open("treaties", "JAP");
  assert.match(html("tradeCtl"), /value="mine" checked> Japan's treaties/);
  assert.equal(html("tradeBody"), `<p class="muted">Japan has no treaties at the start. Pick another country, or show all treaties.</p>`);
  fire("tradeCtl", "change", { name: "treatyScope", value: "all" });
  assert.match(html("tradeCtl"), /value="all" checked> All treaties/);
  assert.match(text(html("tradeBody")), /^Treaty of Example/);
  assert.doesNotMatch(html("tradeBody"), /Net for/, "Japan isn't a party to it");
  fire("tradeCtl", "change", { name: "treatyScope", value: "mine" });
});

test("a treaty without a name, with its length in days, and treaty ports named after their state", async () => {
  await loadEconomy();
  state.data.treaties.push({ countries: ["FRA", "JAP"], since: String((1830 + 5000) * 365 * 24), days: 3650, articles: [
    { article: "treaty_port", state: "STATE_KYUSHU" }, { article: "treaty_port", state: "STATE_NEW_ORLEANS" },
  ] });
  try {
    open("treaties", "JAP");
    assert.equal(text(html("tradeBody")), "France – Japan France &amp; Japan · since 1830 · 10 years treaty_port Kyushu treaty_port New Orleans");
  } finally {
    state.data.treaties.pop();
  }
});

test("prices with a save: now, against the base price (bar capped at ±75%), and its history", () => {
  withSave({ treaties: [], prices: [[50, 100], [40, 30], [20, 10], []] }, () => {
    open("prices");
    const rows = html("tradeBody").split("</tr>").slice(1, -1);
    assert.equal(text(rows[0]), "Ammunition £50 £100.0 +100%");
    assert.match(rows[0], /<span class="pct" title="100% vs base"><i style="left:50%;width:50%;background:var\(--art\)"><\/i><\/span>/);
    assert.match(rows[1], /<i style="right:50%;width:16\.6+\d*%;background:var\(--inf\)"><\/i><\/span> -25%/);
    assert.match(rows[2], /title="-50% vs base"><i style="right:50%;width:33\.3+\d*%;background:var\(--inf\)">/);
    assert.match(html("tradeNote"), /^Current world market price of every traded good/);
  });
  withSave({ treaties: [], prices: [[50], [], [20], []] }, () => {
    open("prices");
    const copper = html("tradeBody").split("</tr>")[2];
    assert.match(copper, /Copper<\/td><td class="num">£40<\/td><td class="num">–<\/td><td><span class="pct" title="0% vs base"><i style="left:50%;width:0%;background:var\(--art\)"><\/i><\/span> <\/td><td><\/td>/);
  });
});

test("trade centers with a save: what each one moves, its money, and the totals per good", async () => {
  await loadEconomy();
  const avalon = economy.countries.GBR.states[0];
  avalon.trade = { 2: -3.5, 0: 1.5 }; avalon.tradeCenter = { revenue: 120.5, profit: 30 };
  try {
    withSave({ treaties: [], prices: [[60], [40], [25], []] }, () => {
      open("centers");
      const [centers, totals] = html("tradeBody").split("<h3");
      assert.equal(text(centers), "State Level ≈ Worth/wk Revenue/wk Profit/wk Exports Imports Avalon 2 ≈ £1,325 £121 £30 1.5 3.5");
      assert.match(centers, /<span title="Ammunition" style="white-space:nowrap"><img class="ico-good" src="\/vic3\/goods\/ammunition\.png\?v=\d+" alt="Ammunition">1.5<\/span>/);
      assert.equal(text("<h3" + totals),
        "All of Great Britain's trade centers, per good Good Exported Imported Net trades ≈ Net worth/wk Grain – 3.5 −3.5 −£875 Ammunition 1.5 – +1.5 +£450");
      assert.match(html("tradeNote"), /^Great Britain's trade centers in your save/);
    });
  } finally {
    delete avalon.trade; delete avalon.tradeCenter;
  }
});

test("a country without trade centers says so", () => {
  open("centers", "JAP");
  assert.equal(html("tradeBody"), `<p class="muted">Japan has no trade centers at the start.</p>`);
});
