// Trade tab: treaties and what they're worth per week, world-market prices, and trade centers -- at the 1836
// start from the game files, or from a loaded save.
import { state, current } from "../state.js";
import { asset, flagHtml, esc } from "../helpers.js";
import { syncHash } from "../page.js";
import { renderSidebar } from "../sidebar.js";
import { economy, loadEconomy, econOf } from "./economy.js";

// This tab's own state: the open sub-tab, and whether the treaties shown are the open country's or all of them.
state.tradeKind = "treaties"; state.treatyScope = "mine";

// The game caps a good's price at 75% above or below its base price; the price bar is full there.
const PRICE_CAP = 0.75;

// --- Goods and prices --------------------------------------------------------------------------------------------

// A save's price history is numbered by the good's position in the full goods list (goods that never reach the
// world market -- services, transportation, electricity, gold -- have no history). Update 1.15 added copper in the
// middle of that list, so a save from before it (one price list fewer) numbers its goods without it.
export const saveGoods = () => {
  const goods = state.data.goods, lists = state.saveTrade?.prices.length;
  return lists && lists < goods.length ? goods.filter(g => g.id !== "copper") : goods;
};
const goodIndex = id => saveGoods().findIndex(g => g.id === id);
const goodById = id => state.data.goods.find(g => g.id === id);
const priceHistory = id => state.saveTrade?.prices[goodIndex(id)] || null;

// A good's price: its latest world-market price in a save, else its base price (real prices only exist once a
// game runs).
export const priceOf = id => priceHistory(id)?.at(-1) ?? goodById(id)?.cost ?? 0;

// --- Treaties ----------------------------------------------------------------------------------------------------

const allTreaties = () => state.saveTrade ? state.saveTrade.treaties : state.data.treaties;
export const treatiesOf = tag => allTreaties().filter(t => t.countries.includes(tag));

// Dates are "1834.4.22", or -- when the melter can't format a very early one -- raw hours since the year -5000
// in the game's 365-day calendar.
export function treatyDate(v) {
  if (!v) return "";
  if (/^\d{6,}$/.test(v)) {
    const days = Math.floor(+v / 24), year = Math.floor(days / 365) - 5000;
    return String(year);
  }
  const [y, m, d] = v.split(".").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

// What an article is worth per week to the country `tag`: + if it receives, − if it gives; null for articles
// that move no money or goods, or that it isn't part of. Goods are valued at their price (priceOf).
export function articleValue(a, tag) {
  let v = 0;
  if (a.article === "goods_transfer" && a.goods) v = (a.quantity || 0) * priceOf(a.goods);
  else if (a.article === "money_transfer") v = a.quantity || 0;
  else return null;
  return a.target === tag ? v : a.source === tag ? -v : null;
}

const treatyLength = t => t.years ? `${t.years} years` : t.days ? `${Math.round(t.days / 365)} years` : "";

// Treaty ports name a state: its name once the economy data has loaded, else its ID tidied up
// ("STATE_NEW_ORLEANS" -> "New Orleans").
const stateName = id => economy?.regions?.[id]?.name ||
  id.replace(/^STATE_/, "").toLowerCase().replace(/(^|_)(\w)/g, (_, space, ch) => (space ? " " : "") + ch.toUpperCase());

// --- Trade centers -----------------------------------------------------------------------------------------------

// The country's states with a trade center (or, in a save, trade flows), the biggest first.
const tradeCenterLevel = st => st.buildings.building_trade_center || 0;
const tradeCenterStates = e => e.states
  .filter(st => tradeCenterLevel(st) > 0 || Object.keys(st.trade || {}).length)
  .sort((a, b) => tradeCenterLevel(b) - tradeCenterLevel(a));

// Per good, the trades exported and imported by all these states' trade centers, the busiest first.
function totalsPerGood(states) {
  const totals = {};
  for (const st of states) for (const [i, v] of Object.entries(st.trade || {})) {
    const t = totals[i] ??= { exp: 0, imp: 0 };
    if (v > 0) t.exp += v; else t.imp -= v;
  }
  return Object.entries(totals).sort((a, b) => (b[1].exp + b[1].imp) - (a[1].exp + a[1].imp));
}

// --- Numbers -----------------------------------------------------------------------------------------------------

const money = n => `£${Math.round(n).toLocaleString("en")}`;
const signedMoney = n => `${n >= 0 ? "+" : "−"}${money(Math.abs(n))}`;
const countryName = tag => state.byTag[tag]?.name || tag;
const countryLabel = tag => { const c = state.byTag[tag]; return c ? `${flagHtml(c, "")} ${esc(c.name)}` : esc(tag || "?"); };
const goodIcon = g => `<img class="ico-good" src="${asset(g.icon)}" alt="">`;

// --- Drawing it --------------------------------------------------------------------------------------------------

export function renderTrade() {
  const c = current(), save = !!state.saveTrade;
  document.getElementById("tradeTabs").innerHTML = kindButtons(save);
  if (state.tradeKind === "treaties") renderTreaties(c, save);
  else if (state.tradeKind === "centers") renderTradeCenters(c, save);
  else renderPrices(save);
}

const kindButtons = save => [["treaties", "Treaties"], ["prices", save ? "World market prices" : "Prices"], ["centers", "Trade centers"]]
  .map(([kind, label]) => `<button data-trade="${kind}" class="${kind === state.tradeKind ? "on" : ""}">${label}</button>`).join("");

// Writes the sub-tab's note, its controls (the treaty scope, or none) and its body.
function show(note, controls, body) {
  document.getElementById("tradeNote").innerHTML = note;
  document.getElementById("tradeCtl").innerHTML = controls;
  document.getElementById("tradeBody").innerHTML = body;
}

// Treaties: a card each, for the open country's treaties or all of them.
function renderTreaties(c, save) {
  const note = save
    ? "Treaties in your save. Goods transfers are valued at the current <b>world market</b> price (the save has no local prices), money transfers are exact; the net is per week for the selected country."
    : "Treaties in force at the 1836 start. Goods transfers are valued at <b>base prices</b> — real prices only exist once a game runs, so load a save for those. Money transfers are exact.";
  const radio = (value, label) =>
    `<label><input type="radio" name="treatyScope" value="${value}" ${state.treatyScope === value ? "checked" : ""}> ${label}</label>`;
  const controls = `${radio("mine", `${esc(c.name)}'s treaties`)}\n      ${radio("all", "All treaties")}`;
  const treaties = state.treatyScope === "all" ? allTreaties() : treatiesOf(c.tag);
  const body = treaties.length
    ? `<div class="treaties">${treaties.map(t => treatyCard(t, c.tag)).join("")}</div>`
    : `<p class="muted">${esc(c.name)} has no treaties${save ? " in this save" : " at the start"}. Pick another country, or show all treaties.</p>`;
  show(note, controls, body);
}

// A treaty: its two countries, since when and for how long, each article, and -- for a country that's part of
// it -- what it's worth to that country per week.
function treatyCard(t, tag) {
  const [first, second] = t.countries;
  const title = t.name || `${countryName(first)} – ${countryName(second)}`;
  const length = treatyLength(t);
  const values = t.articles.map(a => articleValue(a, tag)).filter(v => v != null);
  const net = values.reduce((sum, v) => sum + v, 0);
  const netLine = values.length && t.countries.includes(tag)
    ? `<div class="net"><span>Net for ${esc(countryName(tag))}</span><span class="${net >= 0 ? "pos" : "neg"}">${signedMoney(net)}/wk</span></div>` : "";
  return `<div class="treaty">
    <h3>${esc(title)}</h3>
    <div class="meta">${countryLabel(first)} &amp; ${countryLabel(second)}${t.since ? ` · since ${treatyDate(t.since)}` : ""}${length ? ` · ${length}` : ""}</div>
    <ul>${t.articles.map(articleRow).join("")}</ul>
    ${netLine}
  </div>`;
}

// An article: its name, who gives to whom, and what: goods with their worth, money, or a treaty port's state.
function articleRow(a) {
  const name = esc(state.data.treaty_articles?.[a.article] || a.article);
  const direction = a.source && a.target ? `<span class="dir">${esc(countryName(a.source))} → ${esc(countryName(a.target))}</span>` : "";
  return `<li><span>${name} ${direction}</span><span class="val">${articleText(a)}</span></li>`;
}

function articleText(a) {
  if (a.article === "goods_transfer" && a.goods) {
    const g = goodById(a.goods), worth = (a.quantity || 0) * priceOf(a.goods);
    return `${g?.icon ? goodIcon(g) : ""}${a.quantity} ${esc(g?.name || a.goods)} ≈ ${money(worth)}/wk`;
  }
  if (a.article === "money_transfer") return `${money(a.quantity || 0)}/wk`;
  if (a.state) return esc(stateName(a.state));
  return "";
}

// Prices: every good traded on the world market, with a save its price now, against its base price, and history.
function renderPrices(save) {
  const note = save
    ? "Current world market price of every traded good, how far it is from its base price (the game caps prices at −75% and +75%), and the last ~4 years of history. It's one world price per good, the same for every country (the save doesn't keep each market's local prices). At +75%, demand far outweighs supply, or nobody produces the good yet (e.g. aeroplanes in 1841)."
    : "Base price of every traded good. Real prices only exist once a game runs — load a save to see current world market prices and their history.";
  const head = `<tr><th>Good</th><th class="num">Base</th>${save ? `<th class="num">Now</th><th>vs base</th><th>Last ~4 years</th>` : ""}</tr>`;
  const goods = state.data.goods.filter(g => g.market_index != null);
  show(note, "", `<table class="prices">${head}${goods.map(g => priceRow(g, save)).join("")}</table>`);
}

function priceRow(g, save) {
  const start = `<tr><td>${goodIcon(g)}${esc(g.name)}</td><td class="num">£${g.cost}</td>`;
  if (!save) return start + `</tr>`;
  const history = priceHistory(g.id), now = history?.at(-1), change = now ? now / g.cost - 1 : 0;
  const percent = `${(change * 100).toFixed(0)}%`;
  return start + `<td class="num">${now ? `£${now.toFixed(1)}` : "–"}</td>` +
    `<td><span class="pct" title="${percent} vs base"><i style="${changeBar(change)}"></i></span> ${now ? `${change >= 0 ? "+" : ""}${percent}` : ""}</td>` +
    `<td>${sparkline(history)}</td></tr>`;
}

// The bar against the base price: from the middle, right and red when dearer, left and green when cheaper,
// reaching the end at the game's price cap.
const changeBar = change => change >= 0
  ? `left:50%;width:${Math.min(change / PRICE_CAP, 1) * 50}%;background:var(--art)`
  : `right:50%;width:${Math.min(-change / PRICE_CAP, 1) * 50}%;background:var(--inf)`;

// A price history as a small line in a 120×24 box (1px margin left and right, 2px top and bottom), oldest on the
// left, scaled from its lowest price to its highest.
function sparkline(values) {
  if (!values?.length) return "";
  // A save from a game's first days has a single price: draw it as a flat line.
  if (values.length === 1) values = [values[0], values[0]];
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const x = i => (i / (values.length - 1) * 118 + 1).toFixed(1);
  const y = v => (22 - (v - min) / span * 20).toFixed(1);
  const points = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  return `<svg class="spark" viewBox="0 0 120 24" preserveAspectRatio="none"><polyline points="${points}"/></svg>`;
}

// Trade centers: where they are and, with a save, what each one moves. A state's trade flows are keyed by the
// good's position in the goods list; negative = imported, positive = exported. They count "trades": batches of the
// good's traded_quantity (5 ammunition, 10 of most goods). Checked on a save: valued at world prices, each trade
// center's revenue comes out at ~25-50% of the goods it moves, which fits earning the price gap -- an inference,
// so the page labels the worth as an estimate.
function renderTradeCenters(c, save) {
  if (!economy) {
    loadEconomy();
    document.getElementById("tradeCtl").innerHTML = "";
    document.getElementById("tradeBody").innerHTML = `<p class="muted">Loading…</p>`;
    return;
  }
  const note = save
    ? `${esc(c.name)}'s trade centers in your save: level, weekly revenue and profit, and what each state's trade center exports and imports, counted in <b>trades</b> — batches of the good's trade quantity (e.g. 5 ammunition, 10 of most goods) per week — then the totals per good. <b>≈ Worth</b> is an estimate: the goods moved, valued at world market prices. Hover over (or tap) a good for its name.`
    : `${esc(c.name)}'s trade centers at the 1836 start and their levels. What they import and export only exists once a game runs — load a save to see it.`;
  const states = tradeCenterStates(econOf(c));
  if (!states.length) {
    show(note, "", `<p class="muted">${esc(c.name)} has no trade centers${save ? " in this save" : " at the start"}.</p>`);
    return;
  }
  const goods = saveGoods();
  // ≈ £/week of goods moved: trades × the good's trade quantity × its world price.
  const worth = (i, trades) => Math.abs(trades) * (goods[i]?.traded_quantity || 10) * priceOf(goods[i]?.id);
  show(note, "", centersTable(states, goods, worth, save) + (save ? perGoodTable(c, states, goods, worth) : ""));
}

// A row per state: its trade center's level and, with a save, what it moves and earns.
function centersTable(states, goods, worth, save) {
  const head = `<tr><th>State</th><th class="num">Level</th>${save ? `<th class="num">≈ Worth/wk</th><th class="num">Revenue/wk</th><th class="num">Profit/wk</th><th>Exports</th><th>Imports</th>` : ""}</tr>`;
  const stateWorth = trade => Object.entries(trade || {}).reduce((n, [i, v]) => n + worth(i, v), 0);
  // The goods flowing one way (1 = exported, -1 = imported), the most first, as icons with the number of trades.
  const flows = (trade, direction) => Object.entries(trade || {})
    .filter(([, v]) => direction * v > 0)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .map(([i, v]) => {
      const g = goods[i];
      return g ? `<span title="${esc(g.name)}" style="white-space:nowrap"><img class="ico-good" src="${asset(g.icon)}" alt="${esc(g.name)}">${+Math.abs(v).toFixed(1)}</span>` : "";
    }).join(" ");
  const saveCells = st =>
    `<td class="num" title="Goods moved per week, valued at world market prices (estimate)">${Object.keys(st.trade || {}).length ? "≈ " + money(stateWorth(st.trade)) : "–"}</td>` +
    `<td class="num">${st.tradeCenter ? money(st.tradeCenter.revenue) : "–"}</td>` +
    `<td class="num">${st.tradeCenter ? money(st.tradeCenter.profit) : "–"}</td>` +
    `<td>${flows(st.trade, 1)}</td><td>${flows(st.trade, -1)}</td>`;
  const row = st => `<tr><td>${esc(st.name)}</td><td class="num">${tradeCenterLevel(st) || "–"}</td>${save ? saveCells(st) : ""}</tr>`;
  return `<table class="prices">${head}${states.map(row).join("")}</table>`;
}

// All of the country's trade centers together, per good: exported, imported, and the net in trades and in money.
function perGoodTable(c, states, goods, worth) {
  const row = ([i, t]) => {
    const g = goods[i], net = t.exp - t.imp;
    const sign = net >= 0 ? "+" : "−", color = net >= 0 ? "--inf" : "--art";
    return `<tr><td>${g ? `${goodIcon(g)}${esc(g.name)}` : i}</td>` +
      `<td class="num">${t.exp ? +t.exp.toFixed(1) : "–"}</td><td class="num">${t.imp ? +t.imp.toFixed(1) : "–"}</td>` +
      `<td class="num" style="color:var(${color})">${sign}${+Math.abs(net).toFixed(1)}</td>` +
      `<td class="num" style="color:var(${color})">${sign}${money(worth(i, net))}</td></tr>`;
  };
  return `<h3 style="font-family:Georgia,serif;font-weight:normal;margin:22px 0 8px">All of ${esc(c.name)}'s trade centers, per good</h3>` +
    `<table class="prices"><tr><th>Good</th><th class="num">Exported</th><th class="num">Imported</th><th class="num">Net trades</th><th class="num">≈ Net worth/wk</th></tr>` +
    totalsPerGood(states).map(row).join("") + `</table>`;
}

// --- How the rest of the page sees this tab (see allTabs in page.js) --------------------------------------------

export const tradeTab = {
  view: "tradeView", hash: "trade", followsScope: true,
  subTabs: { key: "tradeKind", values: ["treaties", "prices", "centers"] },
  render: renderTrade,
  // The sidebar ranks by trade center levels on that sub-tab, else by number of treaties.
  ranking: () => state.tradeKind === "centers"
    ? { label: "trade center levels", value: c => econOf(c).levels?.building_trade_center || 0 }
    : { label: "treaties", value: c => treatiesOf(c.tag).length },
};

// --- Clicks ------------------------------------------------------------------------------------------------------

document.getElementById("tradeTabs").addEventListener("click", e => {
  const button = e.target.closest("button[data-trade]");
  if (!button) return;
  state.tradeKind = button.dataset.trade;
  syncHash(); renderTrade(); renderSidebar();
});

document.getElementById("tradeCtl").addEventListener("change", e => {
  if (e.target.name !== "treatyScope") return;
  state.treatyScope = e.target.value;
  renderTrade();
});
