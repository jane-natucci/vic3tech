// Page-view counting for jane.berlin's stats. Loaded on its own, outside the app's modules.
// First-party pageview logging -- see counter's BeaconController/
// PageView. No cookie, no persistent visitor id. Plain page (no Turbo,
// no client-side routing), so this fires once, not on a turbo:load
// hook like paradox-scores'/achievements' equivalent snippet. Subdomain
// is read from the hostname rather than hardcoded so the same snippet
// could be pasted as-is into hebrew/arabic/ideas' pages too.
(() => {
  const payload = JSON.stringify({
    app: "counter",
    subdomain: location.hostname.split(".")[0],
    path: location.pathname,
    referrer: document.referrer,
  });
  if (navigator.sendBeacon) {
    navigator.sendBeacon("https://jane.berlin/beacon", payload);
  } else {
    fetch("https://jane.berlin/beacon", { method: "POST", body: payload, keepalive: true });
  }

  // The follow-up: sent once, the first time something on the page moves or is
  // pressed. Most scripted visits never do (see BeaconController).
  const events = ["pointerdown", "pointermove", "keydown", "scroll", "touchstart", "wheel"];
  const body = JSON.stringify({ event: "engaged", app: "counter", subdomain: location.hostname.split(".")[0], path: location.pathname });
  const onEvent = () => {
    if (document.visibilityState !== "visible") return;
    events.forEach((name) => window.removeEventListener(name, onEvent, true));
    if (navigator.sendBeacon) {
      navigator.sendBeacon("https://jane.berlin/beacon", body);
    } else {
      fetch("https://jane.berlin/beacon", { method: "POST", body, keepalive: true });
    }
  };
  events.forEach((name) => window.addEventListener(name, onEvent, { capture: true, passive: true }));
})();
