// The country list on the left: search, Europe / Whole world, and ranking by whatever the open tab is about.
import { state } from "./state.js";
import { flagHtml, esc, isEurope, battalions, noHover, isPhone } from "./helpers.js";
import { render, pin, openTab } from "./page.js";
import { techTab } from "./views/tech.js";

// What the list ranks countries by: the open tab says ({ label, value(country), total }, see allTabs in page.js),
// else the Technology tab's ranking.
const ranking = () => openTab()?.ranking() || techTab.ranking();

// Accents and punctuation don't matter in a search: "grèat" finds Great Britain.
const plain = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function renderSidebar() {
  const query = document.getElementById("search").value.trim().toLowerCase();
  const rank = ranking();
  // A search finds a country by its name, the game's name for its tag, or the tag itself.
  const matches = c => !query || plain(c.name).includes(plain(query)) ||
    plain(state.data.country_names?.[c.tag] || "").includes(plain(query)) || c.tag.toLowerCase() === query;
  // A search always looks through every country, whatever the scope.
  const inScope = c => query || state.scope === "all" || isEurope(c);
  // Ties go to the bigger army, then the name.
  const countries = state.data.countries.filter(c => inScope(c) && matches(c))
    .sort((a, b) => rank.value(b) - rank.value(a) || battalions(b) - battalions(a) || a.name.localeCompare(b.name));

  // Each country's meter: out of the total there is (e.g. techs in the category), else against the highest.
  // Progressiveness goes negative, so the meters start from the lowest value.
  const max = rank.total || Math.max(1, ...countries.map(rank.value));
  const min = Math.min(0, ...countries.map(rank.value));
  const row = c => `<div class="country${c.tag === state.pinned ? " pinned" : ""}" data-tag="${c.tag}">
      ${flagHtml(c)}<span class="name">${esc(c.name)}</span><span class="count">${rank.value(c).toLocaleString("en")}${rank.total ? `/${rank.total}` : ""}</span>
      <span class="meter"><i style="width:${(rank.value(c) - min) / (max - min || 1) * 100}%"></i></span></div>`;
  const heading = `${state.scope === "all" ? "All countries" : "Europe"} · by ${esc(rank.label)}`;
  document.getElementById("countries").innerHTML =
    countries.length ? `<h3>${heading}</h3>${countries.map(row).join("")}` : `<p class="hint">No matches.</p>`;
}

// --- Hovering, clicking, searching -------------------------------------------------------------------------------

const aside = document.querySelector("aside");

// Hovering a country previews it everywhere (not on touch screens, where a tap pins it).
aside.addEventListener("mouseover", e => {
  if (noHover) return;
  const row = e.target.closest(".country");
  if (row && row.dataset.tag !== state.preview) { state.preview = row.dataset.tag; render(); }
});
aside.addEventListener("mouseleave", () => { if (state.preview) { state.preview = null; render(); } });
aside.addEventListener("click", e => {
  const row = e.target.closest(".country");
  if (row) pin(row.dataset.tag);
});

// Phones: the header's country button opens the list as a full-screen picker.
document.getElementById("current").addEventListener("click", () => {
  if (!isPhone()) return;
  document.body.classList.add("picker-open");
  aside.scrollTop = 0;
});
document.getElementById("pickerDone").addEventListener("click", () => document.body.classList.remove("picker-open"));

document.getElementById("search").addEventListener("input", renderSidebar);

// Europe / Whole world: the list, and the open tab if it counts countries too.
document.querySelectorAll("input[name=scope]").forEach(radio => radio.addEventListener("change", () => {
  state.scope = radio.value;
  renderSidebar();
  const tab = openTab();
  if (tab?.followsScope) tab.render();
}));
