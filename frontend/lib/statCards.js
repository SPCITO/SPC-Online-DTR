// M.75 — pure stat-card derivation for the employee logs page.
//
// Both-mode semantics: the cards describe the dataset the table shows.
//   - Online / Biometrics tables list sessions ("logs") → cards count logs.
//   - The Both table lists reconciliation GROUPS (one row per employee-day).
//     Cards therefore count groups: a group holding 2 online + 2 biometric
//     sessions counts ONCE — no double-counting across source columns.
// Latest Date is the newest date present in the shown dataset (groups are
// returned date-DESC, logs time-DESC).

function statCards(source, logs, groups) {
  if (source === "both") {
    const list = groups || [];
    return {
      total: list.length,
      latestDateLabel: list.length ? String(list[0].date) : "—",
    };
  }
  const list = logs || [];
  return {
    total: list.length,
    latestDateLabel:
      list.length && list[0].time_in ? new Date(list[0].time_in).toLocaleDateString() : "—",
  };
}

module.exports = { statCards };
