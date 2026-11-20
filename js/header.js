// The header: the open country's name, flag (the waving one in the corner) and headline numbers.
import { state, current } from "./state.js";
import { flagUrl, flagHtml, esc, battalions, ships, catCount } from "./helpers.js";

// The current country's flag in the corner, hung like cloth in a still wave (the game's flags wave; this keeps
// the folds and their light and shadow but doesn't move). Drawn from the flag picture: every pixel column is
// lifted or dropped along one wave that grows away from the pole, with a light or dark band where the cloth folds.
function drawCornerFlag(c) {
  const cv = document.getElementById("cornerFlag"), img = new Image(), ratio = window.devicePixelRatio || 1;
  cv.setAttribute("aria-label", c.name); cv.title = c.name;
  img.onerror = () => document.body.classList.remove("has-flag");
  img.onload = () => {
    if (current()?.tag !== c.tag) return; // the pointer has moved on to another country
    const W = Math.round(60 * ratio), H = Math.round(44 * ratio), amp = 3.4 * ratio, phase0 = 330 * Math.PI / 180, waves = 1.5, shade = 0.3;
    cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d"), inner = H - 2 * amp - 2 * ratio;
    for (let x = 0; x < W; x++) {
      const u = x / W, grow = 0.2 + 0.8 * u, phase = u * waves * Math.PI * 2 - phase0;
      const y = amp + ratio + Math.sin(phase) * amp * grow;
      ctx.drawImage(img, Math.floor(u * img.naturalWidth), 0, 2, img.naturalHeight, x, y, 1, inner);
      const s = Math.cos(phase) * shade * grow;
      ctx.fillStyle = s > 0 ? `rgba(255,255,255,${s * 0.55})` : `rgba(0,0,0,${-s})`;
      ctx.fillRect(x, y, 1, inner);
    }
    document.body.classList.add("has-flag");
  };
  img.src = flagUrl(`${c.tag}.png`);
}

export function renderHeader() {
  const c = current();
  // One compact line that never wraps on desktop (the header row must not
  // grow): tech counts as production / military / society, the long form
  // is in the tooltip. A loaded save adds prestige and GDP.
  const full = state.data.categories.map(cat => `${catCount(c, cat)} ${cat}`).join(" · ") + ` techs · ${battalions(c)} battalions · ${ships(c)} ships` +
    (c.prestige != null ? ` · ${Math.round(c.prestige).toLocaleString("en")} prestige` : "") + (c.gdp ? ` · £${(c.gdp / 1e6).toFixed(1)}M GDP` : "");
  const short = `Tech ${state.data.categories.map(cat => catCount(c, cat)).join(" / ")} · ${battalions(c)} battalions · ${ships(c)} ships` +
    (c.prestige != null ? ` · ${Math.round(c.prestige).toLocaleString("en")} prestige` : "") + (c.gdp ? ` · £${(c.gdp / 1e6).toFixed(1)}M` : "");
  document.getElementById("current").innerHTML = `${flagHtml(c)}<div><b class="cname">${esc(c.name)}</b>
    <div class="cstats" title="${esc(full)} (tech: production / military / society)">${esc(short)}</div></div>
    ${c.tier ? `<span class="pill" title="Which starting-tech package the game gives this country">Tech tier ${c.tier}</span>` : ""}
    ${state.preview && state.preview !== state.pinned ? `<span class="pill">preview</span>` : ""}`;
  drawCornerFlag(c);
}
