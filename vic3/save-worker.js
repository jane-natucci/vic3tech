// Reads a melted (plaintext) Victoria 3 save in the visitor's browser and
// posts back a small per-country summary -- techs, army, navy, states with
// their buildings -- for the Vic3 page to show instead of the 1836 data.
// Nothing is uploaded anywhere.
//
// The file is streamed line by line: a melted save is 300+ MB, most of it
// pops, so only the handful of top-level sections below are looked at. All
// of them are "<section>={ database={ <id>={ key=value ... } } }", which the
// game writes with one tab per nesting level, so an entry is recognised by
// its indentation alone:
//
//   \t\t<id>={          entry start          \t\t}   entry end
//   \t\t\tkey=value     entry field          \t\t\tkey={ ... \t\t\t}  block
const SECTIONS = new Set([
  "date", "player_manager", "country_manager", "technology", "states", "building_manager",
  "new_combat_unit_manager", "military_formation_manager", "ship_templates_manager", "ship_manager",
  "market_manager", "treaty_manager", "treaty_article_manager",
]);
// Blocks inside an entry whose contents we need (everything else is skipped).
const BLOCKS = new Set(["acquired_technologies", "prestige", "gdp", "provinces", "versions", "inputs"]);

self.onmessage = async ({ data: file }) => {
  try {
    self.postMessage({ type: "done", summary: await read(file) });
  } catch (e) {
    self.postMessage({ type: "error", message: e.message || String(e) });
  }
};

async function read(file) {
  const out = {
    date: null, playerCountry: null,
    countries: {},      // id -> { tag, capital, type, prestige, gdp }
    techs: {},          // country id -> [tech]
    states: {},         // id -> { country, region, arable_land, provinces }
    buildings: [],      // { state, building, levels }
    units: [],          // { country, type, manpower }
    formations: {},     // id -> { country, type }
    shipVersions: {},   // version -> { type, country }
    ships: [],          // { fleet, version }
    prices: [],         // world-market price history per market channel (oldest -> newest)
    treaties: {},       // id -> { first, second, since, days }
    articles: [],       // { article, treaty, source, target, goods, quantity }
  };
  let priceChannel = null, inPrices = false;
  let section = null, entry = null, block = null, blockLines = [];
  let bytes = 0, lastReport = 0;

  // A melted save is text right after its one-line "SAV..." header; a binary
  // (or zipped binary) save has control bytes there. The header line itself
  // is short, so look at the first few hundred bytes, not the first line.
  const start = new Uint8Array(await file.slice(0, 512).arrayBuffer());
  if (start.some(b => b === 0 || (b < 9) || (b > 13 && b < 32))) {
    throw new Error("This save is still binary. Melt it on pdx.tools first (open the save there, then \"Melt\").");
  }

  const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader();
  let rest = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.length;
    const lines = (rest + value).split("\n");
    rest = lines.pop();
    for (const line of lines) handle(line);
    if (bytes - lastReport > 8e6) { lastReport = bytes; self.postMessage({ type: "progress", done: bytes / file.size }); }
  }
  if (rest) handle(rest);
  if (!out.date) throw new Error("This doesn't look like a melted Victoria 3 save (no date found). Binary saves need melting on pdx.tools first.");
  return summarize(out);

  function handle(line) {
    if (line[0] !== "\t") {                                   // top level
      const m = /^([A-Za-z0-9_]+)=(.*)/.exec(line);
      if (m) { section = SECTIONS.has(m[1]) ? m[1] : null; if (m[1] === "date") out.date = m[2].trim(); }
      entry = null; block = null;
      return;
    }
    if (!section) return;

    // market_manager.world_market.price_trend.channels.<n>.values={ ... }:
    // one channel per world-market good, 52 samples 28 days apart, oldest
    // first. (Its database only holds each market's owner.)
    if (section === "market_manager") {
      const ch = /^\t\t\t\t(\d+)=\{$/.exec(line);
      if (ch) priceChannel = +ch[1];
      else if (line === "\t\t\t\t\tvalues={") inPrices = true;
      else if (inPrices && line.trim() === "}") inPrices = false;
      else if (inPrices && priceChannel != null) out.prices[priceChannel] = (out.prices[priceChannel] || []).concat(numbers([line.trim()]));
      return;
    }

    if (line.startsWith("\t\t") && line[2] !== "\t") {        // depth 2: entry start/end
      if (line === "\t\t}") { if (entry) finish(entry); entry = null; block = null; return; }
      const m = /^\t\t(\d+)=(\{|none)/.exec(line);
      entry = m && m[2] === "{" ? { id: m[1] } : null;
      return;
    }
    if (!entry) return;

    if (line.startsWith("\t\t\t") && line[3] !== "\t") {      // depth 3: field or block edge
      if (line === "\t\t\t}") { if (block) entry[block] = blockLines; block = null; return; }
      const eq = line.indexOf("=");
      if (eq < 0) return;
      const key = line.slice(3, eq), val = line.slice(eq + 1);
      if (val === "{") { block = BLOCKS.has(key) ? key : null; blockLines = []; }
      else entry[key] = val.replace(/^"|"$/g, "");
      return;
    }
    if (block) blockLines.push(line.trim());                  // deeper: inside a block we keep
  }

  function finish(e) {
    switch (section) {
      case "player_manager":
        out.playerCountry ??= e.country; break;
      case "country_manager":
        if (e.definition) out.countries[e.id] = {
          tag: e.definition, capital: e.capital, type: e.country_type,
          prestige: lastNumber(e.prestige), gdp: lastNumber(e.gdp),
        };
        break;
      case "technology":
        if (e.country) out.techs[e.country] = (e.acquired_technologies || []).join(" ").match(/[^" ]+/g) || [];
        break;
      case "states":
        // provinces={ provinces={ <first id> <count - 1> ... } }: ranges of province ids.
        out.states[e.id] = {
          country: e.country, region: e.region, arable_land: +e.arable_land || 0,
          provinces: numbers(e.provinces).reduce((n, x, i) => i % 2 ? n + x + 1 : n, 0),
        };
        break;
      case "building_manager":
        if (e.building && e.state) out.buildings.push({ state: e.state, building: e.building, levels: +e.levels || 0 });
        break;
      case "new_combat_unit_manager":
        if (e.type) out.units.push({ country: e.country, type: e.type, manpower: +e.current_manpower || 0 });
        break;
      case "military_formation_manager":
        out.formations[e.id] = { country: e.country, type: e.type };
        break;
      case "ship_templates_manager":
        for (const v of numbers(e.versions)) out.shipVersions[v] = { type: e.type, country: e.country };
        break;
      case "treaty_manager":
        if (e.first_country) out.treaties[e.id] = { first: e.first_country, second: e.second_country, since: e.entered_into_force_on, days: +e.binding_period || null };
        break;
      case "treaty_article_manager": {
        // inputs={ { goods="paper" } { quantity=10 } } -- goods transfers name a good; money transfers only a quantity (£/week).
        const inputs = (e.inputs || []).join(" ");
        if (e.article) out.articles.push({
          article: e.article, treaty: e.treaty, source: e.source_country, target: e.target_country,
          goods: /goods="([^"]+)"/.exec(inputs)?.[1] || null, quantity: +(/quantity=([\d.]+)/.exec(inputs)?.[1]) || null,
        });
        break;
      }
      case "ship_manager":
        if (e.version) out.ships.push({ fleet: e.fleet, version: e.version });
        break;
    }
  }
}

// Time series like prestige={ ... channels={ 0={ values={ 179 179 ... } } } }:
// the current value is the last number written.
function lastNumber(lines) {
  const nums = numbers(lines);
  return nums.length ? nums[nums.length - 1] : null;
}
function numbers(lines) {
  return (lines || []).filter(l => /^-?\d/.test(l)).join(" ").split(/\s+/).filter(Boolean).map(Number);
}

// Everything keyed by country tag, only countries that still own land.
function summarize(o) {
  const byId = {};
  for (const [id, c] of Object.entries(o.countries)) {
    byId[id] = { tag: c.tag, capitalRegion: o.states[c.capital]?.region || null, prestige: c.prestige, gdp: c.gdp,
                 techs: o.techs[id] || [], army: {}, navy: {}, states: [] };
  }
  const stateInfo = {};
  for (const [id, s] of Object.entries(o.states)) {
    const c = byId[s.country]; if (!c) continue;
    const st = { region: s.region, arable_land: s.arable_land, provinces: s.provinces, buildings: {} };
    stateInfo[id] = st; c.states.push(st);
  }
  for (const b of o.buildings) {
    const st = stateInfo[b.state]; if (!st || !b.levels) continue;
    st.buildings[b.building] = (st.buildings[b.building] || 0) + b.levels;
  }
  for (const u of o.units) {
    const c = byId[u.country]; if (!c) continue;
    const a = c.army[u.type] ??= { count: 0, manpower: 0 };
    a.count++; a.manpower += u.manpower;
  }
  for (const s of o.ships) {
    const v = o.shipVersions[s.version], owner = o.formations[s.fleet]?.country ?? v?.country;
    const c = byId[owner]; if (!c || !v) continue;
    c.navy[v.type] = (c.navy[v.type] || 0) + 1;
  }
  const countries = Object.values(byId).filter(c => c.states.length);
  const tag = id => byId[id]?.tag || null;
  const treaties = Object.entries(o.treaties).map(([id, t]) => ({
    countries: [tag(t.first), tag(t.second)], since: t.since, days: t.days,
    articles: o.articles.filter(a => a.treaty === id).map(a => ({
      article: a.article, source: tag(a.source), target: tag(a.target), goods: a.goods, quantity: a.quantity,
    })),
  })).filter(t => t.articles.length);
  return { date: o.date, player: byId[o.playerCountry]?.tag || null, countries, treaties, prices: o.prices };
}
