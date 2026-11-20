// The page as a whole: its tabs, the #hash in the address (which country, tab and sub-tab is open), switching tabs,
// pinning a country, and render(), which redraws whatever is visible.
import { state } from "./state.js";
import { viewOn } from "./helpers.js";
import { renderHeader } from "./header.js";
import { renderSidebar } from "./sidebar.js";
import { scrollToTech, techTab } from "./views/tech.js";
import { armiesTab } from "./views/armies.js";
import { unitsTab } from "./views/units.js";
import { economyTab } from "./views/economy.js";
import { tradeTab } from "./views/trade.js";
import { lawsTab } from "./views/laws.js";

// --- The tabs ----------------------------------------------------------------------------------------------------

// Every tab, as its own file describes it:
//   view          the id of its <section> in index.html
//   hash          its name in the address ("#GBR/army"); the Technology tab has none ("#GBR")
//   subTabs       the state key that holds its open sub-tab, and the sub-tabs there are ("#GBR/units/ships")
//   render        draws it
//   ranking       what the sidebar ranks countries by while it's open: { label, value(country), total }
//   followsScope  redrawn when the sidebar switches between Europe and the whole world
//   alwaysDrawn   drawn on every redraw, even while hidden
// A function rather than a list: the tab files import this file, so their descriptions only exist once
// everything has loaded.
export const allTabs = () => [techTab, armiesTab, unitsTab, economyTab, tradeTab, lawsTab];
export const tabOf = view => allTabs().find(t => t.view === view);
export const openTab = () => tabOf(document.querySelector(".view.on")?.id);

// Opens a tab's sub-tab, if the tab has sub-tabs (the name is checked by parseHash).
export function setSubTab(view, sub) {
  const tab = tabOf(view);
  if (sub && tab?.subTabs) state[tab.subTabs.key] = sub;
}

// sync: false for callers that already wrote the exact address they want (a tech's, "#TAG/tech_id") right before:
// syncHash() only writes "#TAG" or "#TAG/tab/sub-tab" and would overwrite it.
export function showView(id, { sync = true } = {}) {
  document.querySelectorAll("#tabs button").forEach(x => x.classList.toggle("on", x.dataset.view === id));
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("on", v.id === id));
  if (sync) syncHash();
  renderSidebar(); render();
}

export function render() {
  renderHeader();
  for (const tab of allTabs()) if (tab.alwaysDrawn || viewOn(tab.view)) tab.render();
}

export const pin = (tag, { sync = true } = {}) => {
  state.pinned = tag; state.preview = null;
  document.body.classList.remove("picker-open");
  if (sync) syncHash();
  renderSidebar(); render();
};

// --- The address -------------------------------------------------------------------------------------------------
// "#TAG" (a country, Technology tab), "#TAG/tech_id" (a country and one of its techs, scrolled to and highlighted),
// "#TAG/tab" (another tab, e.g. "#SIC/economy"), or "#TAG/tab/sub-tab" ("#SIC/economy/resources", "#GBR/units/ships").
// syncHash keeps the address up to date as you switch country, tab or sub-tab, so a link copied at any point
// reopens exactly there.

export function parseHash() {
  const [tagPart, part2, part3] = location.hash.slice(1).split("/");
  // The generated country pages (/country/france) name their country in a <meta> tag instead.
  const tag = tagPart ? tagPart.toUpperCase() : document.querySelector('meta[name="initial-tag"]')?.content || null;
  const tab = part2 && allTabs().find(t => t.hash === part2);
  if (tab) {
    const sub = part3 && tab.subTabs?.values.includes(part3) ? part3 : null;
    return { tag, techId: null, view: tab.view, sub };
  }
  return { tag, techId: part2 || null, view: null, sub: null };
}

export function syncHash() {
  const tab = openTab();
  const sub = tab?.subTabs ? state[tab.subTabs.key] : null;
  const path = tab?.hash ? "/" + tab.hash + (sub ? "/" + sub : "") : "";
  history.replaceState(null, "", "#" + state.pinned + path);
}

// Following a link, or an address edited by hand.
addEventListener("hashchange", () => {
  const { tag, techId, view, sub } = parseHash();
  // A link that names a tab or a tech is already the address we want: pinning its country mustn't write the
  // tab that's open now into it. A bare "#TAG" keeps the open tab, and the address says so.
  const named = (techId && state.techs[techId]) || view;
  if (state.byTag[tag] && tag !== state.pinned) pin(tag, { sync: !named });
  if (techId && state.techs[techId]) {
    state.category = state.techs[techId].category; state.focusTech = techId;
    showView("techView", { sync: false }); scrollToTech(techId);
  } else if (view) {
    setSubTab(view, sub);
    // Redraw even when only the sub-tab changed ("#SIC/economy/buildings" -> "#SIC/economy/resources").
    if (!viewOn(view)) showView(view, { sync: false });
    else { renderSidebar(); render(); }
  }
});

document.getElementById("tabs").addEventListener("click", e => {
  const button = e.target.closest("button");
  if (button) showView(button.dataset.view);
});
