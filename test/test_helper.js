// Loaded first by every test file (like test_helper.rb in a Rails app). The app's files expect a browser: they look up
// elements by id and connect their buttons as soon as they load. Node has no page, so this sets up a small stand-in
// for one -- just enough for the code to run -- and serves the test data in place of /vic3/data.json and economy.json.
// Rendering then writes HTML into the stand-in elements, where a test can read it back (html("armyTable")).
import { data, economy } from "./fixtures/data.js";

class FakeClassList {
  #set = new Set();
  add(...names) { names.forEach(n => this.#set.add(n)); }
  remove(...names) { names.forEach(n => this.#set.delete(n)); }
  toggle(name, force) { const on = force ?? !this.#set.has(name); on ? this.#set.add(name) : this.#set.delete(name); return on; }
  contains(name) { return this.#set.has(name); }
}

export class FakeElement {
  constructor(id = null) {
    this.id = id; this.innerHTML = ""; this.textContent = ""; this.value = ""; this.href = ""; this.title = "";
    this.hidden = false; this.open = false; this.style = {}; this.dataset = {}; this.attributes = {};
    this.classList = new FakeClassList(); this.listeners = {};
  }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  removeEventListener() {}
  setAttribute(k, v) { this.attributes[k] = v; }
  getAttribute(k) { return this.attributes[k]; }
  appendChild(child) { return child; }
  remove() {}
  focus() {}
  click() {}
  scrollTo() {}
  showModal() { this.open = true; }
  close() { this.open = false; }
  closest() { return null; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  getBoundingClientRect() { return { left: 0, right: 0, top: 0, bottom: 0 }; }
  getContext() { return new Proxy({}, { get: () => () => {} }); }
}

const elements = new Map();
const byId = id => { if (!elements.has(id)) elements.set(id, new FakeElement(id)); return elements.get(id); };
const VIEWS = ["techView", "armyView", "unitView", "economyView", "tradeView", "lawView"];
VIEWS.forEach(id => byId(id).classList.add("view"));
byId("techView").classList.add("on");
const tabButtons = VIEWS.map(view => Object.assign(new FakeElement(), { dataset: { view } }));
const scopeRadios = ["europe", "all"].map(value => Object.assign(new FakeElement(), { value }));
const listeners = {};
const on = (type, fn) => (listeners[type] ??= []).push(fn);

globalThis.document = {
  body: new FakeElement("body"), documentElement: new FakeElement("html"), referrer: "", visibilityState: "visible",
  getElementById: byId,
  addEventListener: on, removeEventListener() {},
  querySelector(sel) {
    if (sel === ".view.on") return VIEWS.map(byId).find(v => v.classList.contains("on")) || null;
    if (sel === "aside") return byId("aside");
    return null; // e.g. meta[name="initial-tag"], which only the generated country pages have
  },
  querySelectorAll(sel) {
    if (sel === ".view") return VIEWS.map(byId);
    if (sel === "#tabs button") return tabButtons;
    if (sel === "input[name=scope]") return scopeRadios;
    return [];
  },
};
globalThis.location = { hash: "", search: "", pathname: "/", hostname: "vic3tech.jane.berlin", origin: "https://vic3tech.jane.berlin" };
globalThis.history = {
  replaceState(_state, _title, url) {
    const u = new URL(url, "https://vic3tech.jane.berlin" + location.pathname);
    location.hash = u.hash; location.search = u.search; location.pathname = u.pathname;
  },
};
globalThis.window = globalThis;
globalThis.addEventListener = on;
globalThis.removeEventListener = () => {};
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
globalThis.requestAnimationFrame = fn => setTimeout(fn, 0);
globalThis.innerWidth = 1600; globalThis.innerHeight = 1000; globalThis.devicePixelRatio = 1;
globalThis.localStorage = { getItem: () => null, setItem() {} };
globalThis.Image = class { set src(_) {} };
// IndexedDB is left out on purpose: the recent-saves list then fails quietly, as in a private window.

// The data files: a fresh copy each time, so a test that changes the data can't affect the next one.
globalThis.fetch = async url => {
  const path = String(url).split("?")[0];
  const body = path === "/vic3/data.json" ? data() : path === "/vic3/economy.json" ? economy() : null;
  if (!body) return { ok: false, status: 404, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => body };
};

// --- For the tests ---------------------------------------------------------------------------------------------------

export const html = id => byId(id).innerHTML;
export const element = byId;

// Calls the listeners the app connected to an element (or "document"/"window"), with a stand-in event whose
// target.closest(selector) finds `target` when the selector names one of its data- attributes or its tag.
export function fire(id, type, target = {}) {
  const fns = id === "window" || id === "document" ? listeners[type] : byId(id).listeners[type];
  const t = { id: target.id, name: target.name, value: target.value, dataset: target.dataset || {},
              closest: sel => (target.matches ?? []).some(m => sel.includes(m)) ? t : null };
  (fns || []).forEach(fn => fn({ target: t, stopPropagation() {}, preventDefault() {} }));
}

// Waits until fn() is truthy (the app's start-up and economy loading are asynchronous).
export async function until(fn, ms = 2000) {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error("timed out waiting for " + fn);
    await new Promise(r => setTimeout(r, 5));
  }
}
