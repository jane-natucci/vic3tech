// Sortable tables (Armies, and later Economy): sorting the rows, the header row with its ↓/↑, and what a click on
// a column header does. A table describes its columns as { key, label, value }, where value(country) is what the
// column shows and sorts by.

// Rows sorted by one column: text A to Z or numbers low to high, or the other way round when desc is true.
export function sortRows(rows, value, desc) {
  const direction = desc ? -1 : 1;
  return [...rows].sort((a, b) => {
    const x = value(a), y = value(b);
    return direction * (typeof x === "string" ? x.localeCompare(y) : x - y);
  });
}

// The header row; the sorted column is marked, with an arrow for its direction.
export function headerRow(columns, sortKey, desc) {
  const cell = ({ key, label }) => {
    const sorted = key === sortKey;
    const arrow = sorted ? (desc ? " ↓" : " ↑") : "";
    return `<th data-sort="${key}" class="${sorted ? "sorted" : ""}">${label}${arrow}</th>`;
  };
  return `<tr>${columns.map(cell).join("")}</tr>`;
}

// Clicking a header: the sorted column reverses; another column starts biggest first, except names, A to Z.
export function nextSort(clicked, sortKey, desc) {
  if (clicked === sortKey) return { sortKey, desc: !desc };
  return { sortKey: clicked, desc: clicked !== "name" };
}
