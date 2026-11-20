// Trade tab: treaties, world-market prices and trade centers.
import { state, current } from "../state.js";
import { asset, flagHtml, esc } from "../helpers.js";
import { syncHash } from "../page.js";
import { renderSidebar } from "../sidebar.js";
import { economy, loadEconomy, econOf } from "./economy.js";

// --- Trade: treaties and world-market prices ----------------------------------
// Treaties come from the game files at 1836 and from the save once one is
// loaded. Goods in a goods transfer are valued at the save's current world
// price, or at the good's base price at 1836 (real prices only exist once a
// game runs). Money transfers are already £/week. A save's price history is
// indexed by the good's position in the full goods list (goods that never
// reach the world market -- services, transportation, electricity, gold --
// have none). Update 1.15 added copper in the middle of that list, so a
// save from before it (one price row fewer) numbers its goods without it.
state.tradeKind = "treaties"; state.treatyScope = "mine";
export const saveGoods = () => {
  const goods = state.data.goods, rows = state.saveTrade?.prices.length;
  return rows && rows < goods.length ? goods.filter(g => g.id !== "copper") : goods;
};
const goodIndex = id => saveGoods().findIndex(g => g.id === id);
const goodById = id => state.data.goods.find(g => g.id === id);
const priceHistory = id => state.saveTrade?.prices[goodIndex(id)] || null;
export const priceOf = id => priceHistory(id)?.at(-1) ?? goodById(id)?.cost ?? 0;
const allTreaties = () => state.saveTrade ? state.saveTrade.treaties : state.data.treaties;
export const treatiesOf = tag => allTreaties().filter(t => t.countries.includes(tag));
const money = n => `£${Math.round(n).toLocaleString("en")}`;
const countryLabel = tag => { const c = state.byTag[tag]; return c ? `${flagHtml(c, "")} ${esc(c.name)}` : esc(tag || "?"); };

// Dates are "1834.4.22", or -- when the melter can't format a very early
// one -- raw hours since year -5000 in the game's 365-day calendar.
export function treatyDate(v) {
  if (!v) return "";
  if (/^\d{6,}$/.test(v)) {
    const days = Math.floor(+v / 24), year = Math.floor(days / 365) - 5000;
    return String(year);
  }
  const [y, m, d] = v.split(".").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

// One article's value per week from `tag`'s point of view (+ received, − given).
export function articleValue(a, tag) {
  let v = 0;
  if (a.article === "goods_transfer" && a.goods) v = (a.quantity || 0) * priceOf(a.goods);
  else if (a.article === "money_transfer") v = a.quantity || 0;
  else return null;
  return a.target === tag ? v : a.source === tag ? -v : null;
}

function treatyCard(t, tag) {
  const other = t.countries.find(c => c !== tag) || t.countries[1];
  const title = t.name || `${state.byTag[t.countries[0]]?.name || t.countries[0]} – ${state.byTag[t.countries[1]]?.name || t.countries[1]}`;
  const length = t.years ? `${t.years} years` : t.days ? `${Math.round(t.days / 365)} years` : "";
  let net = 0, valued = false;
  const rows = t.articles.map(a => {
    const name = esc(state.data.treaty_articles?.[a.article] || a.article);
    const dir = a.source && a.target ? `<span class="dir">${esc(state.byTag[a.source]?.name || a.source)} → ${esc(state.byTag[a.target]?.name || a.target)}</span>` : "";
    let val = "";
    if (a.article === "goods_transfer" && a.goods) {
      const g = goodById(a.goods), worth = (a.quantity || 0) * priceOf(a.goods);
      val = `${g?.icon ? `<img class="ico-good" src="${asset(g.icon)}" alt="">` : ""}${a.quantity} ${esc(g?.name || a.goods)} ≈ ${money(worth)}/wk`;
    } else if (a.article === "money_transfer") val = `${money(a.quantity || 0)}/wk`;
    // Treaty ports name a state: use its real name if the economy data is loaded, else tidy the ID.
    else if (a.state) val = esc(economy?.regions?.[a.state]?.name || a.state.replace(/^STATE_/, "").toLowerCase().replace(/(^|_)(\w)/g, (_, sp, ch) => (sp ? " " : "") + ch.toUpperCase()));
    const v = articleValue(a, tag);
    if (v != null) { net += v; valued = true; }
    return `<li><span>${name} ${dir}</span><span class="val">${val}</span></li>`;
  }).join("");
  const who = state.byTag[tag]?.name || tag;
  return `<div class="treaty">
    <h3>${esc(title)}</h3>
    <div class="meta">${countryLabel(t.countries[0])} &amp; ${countryLabel(t.countries[1])}${t.since ? ` · since ${treatyDate(t.since)}` : ""}${length ? ` · ${length}` : ""}</div>
    <ul>${rows}</ul>
    ${valued && t.countries.includes(tag) ? `<div class="net"><span>Net for ${esc(who)}</span><span class="${net >= 0 ? "pos" : "neg"}">${net >= 0 ? "+" : "−"}${money(Math.abs(net))}/wk</span></div>` : ""}
  </div>`;
}

function sparkline(values) {
  if (!values?.length) return "";
  // A save from a game's first days has a single price: draw it as a flat line.
  if (values.length === 1) values = [values[0], values[0]];
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1) * 118 + 1).toFixed(1)},${(22 - (v - min) / span * 20).toFixed(1)}`).join(" ");
  return `<svg class="spark" viewBox="0 0 120 24" preserveAspectRatio="none"><polyline points="${pts}"/></svg>`;
}

export function renderTrade() {
  const kind = state.tradeKind, c = current(), save = !!state.saveTrade;
  document.getElementById("tradeTabs").innerHTML = [["treaties", "Treaties"], ["prices", save ? "World market prices" : "Prices"], ["centers", "Trade centers"]].map(([k, label]) =>
    `<button data-trade="${k}" class="${k === kind ? "on" : ""}">${label}</button>`).join("");
  const note = document.getElementById("tradeNote"), ctl = document.getElementById("tradeCtl"), body = document.getElementById("tradeBody");

  if (kind === "treaties") {
    note.innerHTML = save
      ? "Treaties in your save. Goods transfers are valued at the current <b>world market</b> price (the save has no local prices), money transfers are exact; the net is per week for the selected country."
      : "Treaties in force at the 1836 start. Goods transfers are valued at <b>base prices</b> — real prices only exist once a game runs, so load a save for those. Money transfers are exact.";
    ctl.innerHTML = `<label><input type="radio" name="treatyScope" value="mine" ${state.treatyScope === "mine" ? "checked" : ""}> ${esc(c.name)}'s treaties</label>
      <label><input type="radio" name="treatyScope" value="all" ${state.treatyScope === "all" ? "checked" : ""}> All treaties</label>`;
    const list = state.treatyScope === "all" ? allTreaties() : treatiesOf(c.tag);
    body.innerHTML = list.length
      ? `<div class="treaties">${list.map(t => treatyCard(t, c.tag)).join("")}</div>`
      : `<p class="muted">${esc(c.name)} has no treaties${save ? " in this save" : " at the start"}. Pick another country, or show all treaties.</p>`;
    return;
  }

  if (kind === "centers") { renderTradeCenters(c, save, note, ctl, body); return; }

  ctl.innerHTML = "";
  note.innerHTML = save
    ? "Current world market price of every traded good, how far it is from its base price (the game caps prices at −75% and +75%), and the last ~4 years of history. It's one world price per good, the same for every country (the save doesn't keep each market's local prices). At +75%, demand far outweighs supply, or nobody produces the good yet (e.g. aeroplanes in 1841)."
    : "Base price of every traded good. Real prices only exist once a game runs — load a save to see current world market prices and their history.";
  const goods = state.data.goods.filter(g => g.market_index != null);
  body.innerHTML = `<table class="prices"><tr><th>Good</th><th class="num">Base</th>${save ? `<th class="num">Now</th><th>vs base</th><th>Last ~4 years</th>` : ""}</tr>` +
    goods.map(g => {
      const hist = priceHistory(g.id), now = hist?.at(-1), pct = now ? now / g.cost - 1 : 0;
      const bar = pct >= 0 ? `left:50%;width:${Math.min(pct / 0.75, 1) * 50}%;background:var(--art)` : `right:50%;width:${Math.min(-pct / 0.75, 1) * 50}%;background:var(--inf)`;
      return `<tr><td><img class="ico-good" src="${asset(g.icon)}" alt="">${esc(g.name)}</td><td class="num">£${g.cost}</td>` +
        (save ? `<td class="num">${now ? `£${now.toFixed(1)}` : "–"}</td><td><span class="pct" title="${(pct * 100).toFixed(0)}% vs base"><i style="${bar}"></i></span> ${now ? `${pct >= 0 ? "+" : ""}${(pct * 100).toFixed(0)}%` : ""}</td><td>${sparkline(hist)}</td>` : "") + `</tr>`;
    }).join("") + `</table>`;
}

// Trade centers: where they are and, with a save, what each one moves.
// A state's trade flows are keyed by the good's position in the goods list;
// negative = imported, positive = exported. They count "trades": batches
// of the good's traded_quantity (5 ammunition, 10 of most goods). Checked
// on a save: valued at world prices, each trade center's revenue comes out
// at ~25-50% of the goods it moves, which fits earning the price gap --
// an inference, so the page labels the worth as an estimate.
function renderTradeCenters(c, save, note, ctl, body) {
  ctl.innerHTML = "";
  if (!economy) { loadEconomy(); body.innerHTML = `<p class="muted">Loading…</p>`; return; }
  note.innerHTML = save
    ? `${esc(c.name)}'s trade centers in your save: level, weekly revenue and profit, and what each state's trade center exports and imports, counted in <b>trades</b> — batches of the good's trade quantity (e.g. 5 ammunition, 10 of most goods) per week — then the totals per good. <b>≈ Worth</b> is an estimate: the goods moved, valued at world market prices. Hover over (or tap) a good for its name.`
    : `${esc(c.name)}'s trade centers at the 1836 start and their levels. What they import and export only exists once a game runs — load a save to see it.`;
  const e = econOf(c);
  const states = e.states.filter(st => (st.buildings.building_trade_center || 0) > 0 || Object.keys(st.trade || {}).length)
    .sort((a, b) => (b.buildings.building_trade_center || 0) - (a.buildings.building_trade_center || 0));
  if (!states.length) { body.innerHTML = `<p class="muted">${esc(c.name)} has no trade centers${save ? " in this save" : " at the start"}.</p>`; return; }
  const goods = saveGoods();
  // ≈ £/week of goods moved: trades × the good's trade quantity × world price.
  const worth = (i, trades) => Math.abs(trades) * (goods[i]?.traded_quantity || 10) * priceOf(goods[i]?.id);
  const stateWorth = trade => Object.entries(trade || {}).reduce((n, [i, v]) => n + worth(i, v), 0);
  const flowList = (trade, sign) => Object.entries(trade || {}).filter(([, v]) => sign * v > 0).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .map(([i, v]) => { const g = goods[i]; return g ? `<span title="${esc(g.name)}" style="white-space:nowrap"><img class="ico-good" src="${asset(g.icon)}" alt="${esc(g.name)}">${+Math.abs(v).toFixed(1)}</span>` : ""; }).join(" ");
  let html = `<table class="prices"><tr><th>State</th><th class="num">Level</th>${save ? `<th class="num">≈ Worth/wk</th><th class="num">Revenue/wk</th><th class="num">Profit/wk</th><th>Exports</th><th>Imports</th>` : ""}</tr>` +
    states.map(st => `<tr><td>${esc(st.name)}</td><td class="num">${st.buildings.building_trade_center || "–"}</td>` +
      (save ? `<td class="num" title="Goods moved per week, valued at world market prices (estimate)">${Object.keys(st.trade || {}).length ? "≈ " + money(stateWorth(st.trade)) : "–"}</td><td class="num">${st.tradeCenter ? money(st.tradeCenter.revenue) : "–"}</td><td class="num">${st.tradeCenter ? money(st.tradeCenter.profit) : "–"}</td><td>${flowList(st.trade, 1)}</td><td>${flowList(st.trade, -1)}</td>` : "") + `</tr>`).join("") + `</table>`;
  if (save) {
    const totals = {};
    for (const st of states) for (const [i, v] of Object.entries(st.trade || {})) {
      const t = totals[i] ??= { exp: 0, imp: 0 };
      if (v > 0) t.exp += v; else t.imp -= v;
    }
    const rows = Object.entries(totals).sort((a, b) => (b[1].exp + b[1].imp) - (a[1].exp + a[1].imp));
    html += `<h3 style="font-family:Georgia,serif;font-weight:normal;margin:22px 0 8px">All of ${esc(c.name)}'s trade centers, per good</h3>` +
      `<table class="prices"><tr><th>Good</th><th class="num">Exported</th><th class="num">Imported</th><th class="num">Net trades</th><th class="num">≈ Net worth/wk</th></tr>` +
      rows.map(([i, t]) => { const g = goods[i], net = t.exp - t.imp;
        return `<tr><td>${g ? `<img class="ico-good" src="${asset(g.icon)}" alt="">${esc(g.name)}` : i}</td><td class="num">${t.exp ? +t.exp.toFixed(1) : "–"}</td><td class="num">${t.imp ? +t.imp.toFixed(1) : "–"}</td><td class="num" style="color:var(${net >= 0 ? "--inf" : "--art"})">${net >= 0 ? "+" : "−"}${+Math.abs(net).toFixed(1)}</td><td class="num" style="color:var(${net >= 0 ? "--inf" : "--art"})">${net >= 0 ? "+" : "−"}${money(worth(i, net))}</td></tr>`; }).join("") + `</table>`;
  }
  body.innerHTML = html;
}

document.getElementById("tradeTabs").addEventListener("click", e => {
  const b = e.target.closest("button[data-trade]"); if (!b) return;
  state.tradeKind = b.dataset.trade; syncHash(); renderTrade(); renderSidebar();
});
document.getElementById("tradeCtl").addEventListener("change", e => {
  if (e.target.name === "treatyScope") { state.treatyScope = e.target.value; renderTrade(); }
});
