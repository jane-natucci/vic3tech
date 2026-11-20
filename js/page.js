// The page as a whole: the #hash in the address (which country, tab and sub-tab is open), switching tabs,
// pinning a country, and render(), which redraws whatever is visible.
import { state } from "./state.js";
import { viewOn } from "./helpers.js";
import { renderHeader } from "./header.js";
import { renderSidebar } from "./sidebar.js";
import { scrollToTech, renderTree, renderDetail, renderSubtabs } from "./views/tech.js";
import { renderArmies } from "./views/armies.js";
import { UNIT_KINDS, renderUnits } from "./views/units.js";
import { renderEconomy } from "./views/economy.js";
import { renderTrade } from "./views/trade.js";
import { renderLaws } from "./views/laws.js";

// Hash format: "#TAG" (country only, Technology tab), "#TAG/tech_id"
// (country + a specific tech, scrolled to and highlighted on load --
// see scrollToTech and the tree click handler below), or
// "#TAG/view_id" (country + a non-Technology tab, e.g. "#SIC/economy"),
// optionally followed by that tab's own sub-tab ("#SIC/economy/resources",
// "#GBR/units/ships") -- see VIEW_HASH/SUB_KEY/syncHash below, which is
// what keeps the address bar in sync as you switch tabs or sub-tabs, so
// a link copied at any point actually reopens exactly where it was
// copied from instead of always defaulting back to Technology (the
// only tab/sub-tab a fresh page load can otherwise guess).
const VIEW_HASH = { techView: null, armyView: "army", unitView: "units", economyView: "economy", tradeView: "trade", lawView: "laws" };
const HASH_VIEW = { army: "armyView", units: "unitView", economy: "economyView", trade: "tradeView", laws: "lawView" };
// Which state key holds each tab's own sub-tab, and what values are
// valid for it -- economyView's is checked against a fixed list since
// ECON_KINDS doesn't exist as a named lookup the way UNIT_KINDS does.
export const SUB_KEY = { unitView: "unitKind", economyView: "econKind", tradeView: "tradeKind", lawView: "lawKind" };
const SUB_VALID = { unitView: k => k in UNIT_KINDS, economyView: k => k === "buildings" || k === "resources", tradeView: k => k === "treaties" || k === "prices" || k === "centers",
                    lawView: k => k === "country" || k === "compare" };
export function parseHash() {
  const [tagPart, part2, part3] = location.hash.slice(1).split("/");
  const tag = tagPart ? tagPart.toUpperCase() : document.querySelector('meta[name="initial-tag"]')?.content || null;
  if (part2 && HASH_VIEW[part2]) {
    const view = HASH_VIEW[part2];
    const sub = part3 && SUB_VALID[view]?.(part3) ? part3 : null;
    return { tag, techId: null, view, sub };
  }
  return { tag, techId: part2 || null, view: null, sub: null };
}
// Called whenever the pinned country, the active tab, or that tab's own
// sub-tab changes, so the URL always reflects all three without needing
// a fresh click on the country to "resync" it.
export function syncHash() {
  const viewId = document.querySelector(".view.on")?.id;
  const suffix = VIEW_HASH[viewId];
  const subKey = SUB_KEY[viewId];
  const sub = subKey ? state[subKey] : null;
  history.replaceState(null, "", "#" + state.pinned + (suffix ? "/" + suffix + (sub ? "/" + sub : "") : ""));
}

// sync: false for callers that already wrote the exact hash they want
// (a tech-anchor link, "#TAG/tech_id") right before calling this --
// syncHash() only knows how to write "#TAG" or "#TAG/view_id" and
// would otherwise clobber the tech id they just set.
export function showView(id, { sync = true } = {}) {
  document.querySelectorAll("#tabs button").forEach(x => x.classList.toggle("on", x.dataset.view === id));
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("on", v.id === id));
  if (sync) syncHash();
  renderSidebar(); render();
}

export function render() {
  renderHeader(); renderSubtabs(); renderTree(); renderDetail();
  if (viewOn("armyView")) renderArmies();
  if (viewOn("unitView")) renderUnits();
  if (viewOn("economyView")) renderEconomy();
  if (viewOn("tradeView")) renderTrade();
  if (viewOn("lawView")) renderLaws();
}

export const pin = tag => { state.pinned = tag; state.preview = null; document.body.classList.remove("picker-open"); syncHash(); renderSidebar(); render(); };

addEventListener("hashchange", () => {
  const { tag, techId, view, sub } = parseHash();
  if (state.byTag[tag] && tag !== state.pinned) pin(tag);
  if (techId && state.techs[techId]) {
    state.category = state.techs[techId].category; state.focusTech = techId;
    showView("techView", { sync: false }); scrollToTech(techId);
  } else if (view) {
    if (sub && SUB_KEY[view]) state[SUB_KEY[view]] = sub;
    // Still need to re-render on a sub-tab-only change (e.g.
    // "#SIC/economy/buildings" -> "#SIC/economy/resources") even
    // though the top-level view itself doesn't change.
    if (!viewOn(view)) showView(view, { sync: false });
    else { renderSidebar(); render(); }
  }
});

document.getElementById("tabs").addEventListener("click", e => {
  const b = e.target.closest("button"); if (b) showView(b.dataset.view);
});
