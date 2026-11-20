// What the page is showing right now: the data, the pinned country, the open sub-tabs and sort orders.
// Every other file reads and changes this one object, then calls render() (page.js) to redraw.
export const state = { data: null, techs: {}, byTag: {}, pinned: "GBR", preview: null, category: "military", focusTech: null, unitKind: "units",
                armySort: "battalions", armyDesc: true, scope: "europe" };

export const current = () => state.byTag[state.preview || state.pinned];
