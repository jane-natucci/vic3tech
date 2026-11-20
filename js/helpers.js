// Small helpers used everywhere: versioned asset URLs, flags, HTML escaping, and a country's army, navy and tech counts.
import { state } from "./state.js";

// deploy.sh replaces the placeholder with a digest of the data. A local
// preview still has the placeholder, which never changes, so browsers
// would keep serving stale data.json/economy.json after a re-extract --
// use a fresh value per page load there instead.
const DATA_VERSION = "__DATA_VERSION__";
const assetVersion = DATA_VERSION.startsWith("__") ? String(Date.now()) : DATA_VERSION;
export const asset = path => `/vic3/${path}?v=${assetVersion}`;
// Flags are versioned by themselves (deploy.sh writes a digest of the pictures), so a redrawn flag shows up at once.
const FLAGS_VERSION = "__FLAGS_VERSION__";
export const flagUrl = path => `/vic3/flags/${path}?v=${FLAGS_VERSION.startsWith("__") ? assetVersion : FLAGS_VERSION}`;
// The country's own 1836 flag, drawn from the game's coat-of-arms recipes (extract_flags.rb). A tag with no
// picture (a country formed later, seen in a loaded save) shows its letters instead.
export const flagHtml = (c, cls = "flag") => `<span class="${cls}" title="${esc(c.name)}"><img class="fimg" src="${flagUrl(`s/${c.tag}.png`)}" alt="" loading="lazy" decoding="async" onerror="this.parentNode.classList.add('none');this.replaceWith('${c.tag}')"></span>`;
export const esc = s => String(s ?? "").replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));

export const ERA_NAMES = { era_1: "Era I · before 1836", era_2: "Era II · 1836–1861", era_3: "Era III · 1862–1886", era_4: "Era IV · 1887–1911", era_5: "Era V · 1911–1936" };

export const isEurope = c => c.region === "europe";
export const battalions = c => Object.values(c.army).reduce((n, u) => n + u.count, 0);
export const ships = c => Object.values(c.navy).reduce((n, s) => n + s.count, 0);
// In a loaded save, battalions can be understaffed: use their real manpower.
export const menOf = c => c.men ?? battalions(c) * 1000;
export const hasWord = () => state.saveInfo ? "has" : "starts with";
export const catCount = (c, cat) => c.techs.filter(t => state.techs[t].category === cat).length;

export function fmtModifier(m) {
  const sign = m.value > 0 ? "+" : "";
  if (/_mult$/.test(m.key)) return sign + Math.round(m.value * 100) + "%";
  return sign + (Number.isInteger(m.value) ? m.value : m.value.toFixed(2));
}

export const viewOn = id => document.getElementById(id).classList.contains("on");

// --- Events --------------------------------------------------------------
// Phones: no hover. iOS Safari also swallows a tap whose simulated
// mouseover changes the page, so the hover-preview handlers below are off
// on touch screens -- taps alone pick countries and techs there.
export const noHover = matchMedia("(hover: none)").matches;
export const isPhone = () => matchMedia("(max-width: 760px)").matches;
