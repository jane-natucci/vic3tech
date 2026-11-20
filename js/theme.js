// The ☀️/🌙 button. The <head> of index.html applies the saved choice before the page draws.
// --- Theme toggle ------------------------------------------------------------
// Starts from the system theme; a click picks the other one explicitly and
// remembers it (the <head> script applies it before the next page draws).
const themeToggle = document.getElementById("themeToggle");
const systemDark = matchMedia("(prefers-color-scheme: dark)");
const currentTheme = () => document.documentElement.dataset.theme || (systemDark.matches ? "dark" : "light");
function renderThemeToggle() {
  const next = currentTheme() === "dark" ? "light" : "dark";
  themeToggle.textContent = next === "dark" ? "🌙" : "☀️";
  themeToggle.title = themeToggle.ariaLabel = `Switch to the ${next} theme`;
}
themeToggle.addEventListener("click", () => {
  const next = currentTheme() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem("vic3-theme", next); } catch {}
  renderThemeToggle();
});
systemDark.addEventListener("change", renderThemeToggle);
renderThemeToggle();
