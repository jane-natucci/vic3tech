// The page's entry point, like app/javascript/application.js in a Rails app: index.html loads only this file,
// and the imports below bring in everything else. Each file connects its own buttons and lists when it loads,
// so a file has to be imported here (or by a file imported here) to do anything.
import { state } from "./state.js";
import { asset } from "./helpers.js";
import { parseHash, showView, render, setSubTab } from "./page.js";
import { renderSidebar } from "./sidebar.js";
import "./header.js";
import "./tooltip.js";
import "./theme.js";
import { scrollToTech, layoutTrees } from "./views/tech.js";
import "./views/armies.js";
import "./views/units.js";
import "./views/economy.js";
import "./views/trade.js";
import "./views/laws.js";
import "./save/load.js";
import "./save/recent.js";
import { openSharedFromUrl } from "./save/share.js";

// The header's "Build <sha>" link: a local preview has no build to show.
// Split so deploy.sh's substitution can't rewrite this check too.
if (document.getElementById("buildLink").href.includes("__BUILD" + "_SHA__")) document.getElementById("buildLink").remove();

// Start-up: load the 1836 data, then open the country, tab and tech the address asks for.
fetch(asset("data.json")).then(r => r.json()).then(data => {
  state.data = data;
  if (data.game_version) document.getElementById("gameVersion").textContent = ` (version ${data.game_version})`;
  data.techs.forEach(t => state.techs[t.id] = t);
  data.countries.forEach(c => { c.techSet = new Set(c.techs); state.byTag[c.tag] = c; });
  const { tag, techId, view, sub } = parseHash();
  if (state.byTag[tag]) state.pinned = tag;
  if (techId && state.techs[techId]) { state.category = state.techs[techId].category; state.focusTech = techId; }
  setSubTab(view, sub);
  layoutTrees();
  if (view) { showView(view); } else { renderSidebar(); render(); }
  if (techId && state.techs[techId]) requestAnimationFrame(() => scrollToTech(techId));
  openSharedFromUrl();
});
