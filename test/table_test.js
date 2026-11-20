// js/table.js: sorting, the header row and header clicks, shared by the sortable tables.
import "./test_helper.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { sortRows, headerRow, nextSort } from "../js/table.js";

const rows = [{ name: "Prussia", n: 3 }, { name: "Austria", n: 10 }, { name: "Bavaria", n: 1 }];

test("sortRows: numbers or text, either way round, without changing the list it was given", () => {
  assert.deepEqual(sortRows(rows, r => r.n, true).map(r => r.n), [10, 3, 1]);
  assert.deepEqual(sortRows(rows, r => r.n, false).map(r => r.n), [1, 3, 10]);
  assert.deepEqual(sortRows(rows, r => r.name, false).map(r => r.name), ["Austria", "Bavaria", "Prussia"]);
  assert.equal(rows[0].name, "Prussia");
});

test("headerRow marks the sorted column and its direction", () => {
  const columns = [{ key: "name", label: "Country" }, { key: "n", label: "Number" }];
  assert.equal(headerRow(columns, "n", true),
    `<tr><th data-sort="name" class="">Country</th><th data-sort="n" class="sorted">Number ↓</th></tr>`);
  assert.match(headerRow(columns, "name", false), /class="sorted">Country ↑</);
});

test("nextSort: the same column reverses; a new one starts biggest first, names A to Z", () => {
  assert.deepEqual(nextSort("n", "n", true), { sortKey: "n", desc: false });
  assert.deepEqual(nextSort("ships", "n", false), { sortKey: "ships", desc: true });
  assert.deepEqual(nextSort("name", "n", true), { sortKey: "name", desc: false });
});
