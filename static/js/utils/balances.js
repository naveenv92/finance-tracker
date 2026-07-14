/**
 * Debt balance computation for the Settle Debts page
 */

/**
 * Parse splits from a transaction (handles JSON string or array)
 * @param {string|Array} splits - Raw splits value
 * @returns {Array} Parsed splits array
 */
export function parseSplits(splits) {
  if (!splits) return [];
  if (Array.isArray(splits)) return splits;
  if (typeof splits === 'string' && splits) {
    try { return JSON.parse(splits); } catch { return []; }
  }
  return [];
}

/**
 * Determine the owner (100% auto split) for a transaction: the template it
 * was imported with (matched by source name) if it set an owner name,
 * otherwise the database-wide owner name.
 * @param {Object} transaction - Transaction record
 * @param {Array} templates - All templates for the database
 * @param {string} ownerName - Database-wide owner name (settings fallback)
 * @returns {string} Resolved owner name
 */
export function getOwnerNameFor(transaction, templates, ownerName) {
  const template = templates.find(t => t.name === transaction.source);
  return (template && template.ownerName) || ownerName || '';
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

/**
 * Derive the full roster of people involved in cost-splitting: everyone who
 * appears in a split, plus every resolved transaction owner (in case a
 * reviewed transaction has no non-auto splits, the owner should still show up).
 * @param {Array} reviewedTransactions - Transactions with reviewed === true
 * @param {Array} templates - All templates for the database
 * @param {string} ownerName - Database-wide owner name (settings fallback)
 * @returns {Array<string>} Sorted, deduped list of person names
 */
export function derivePeople(reviewedTransactions, templates, ownerName) {
  const people = new Set();
  for (const t of reviewedTransactions) {
    for (const s of parseSplits(t.splits)) {
      if (s.personName) people.add(s.personName.trim());
    }
    const owner = getOwnerNameFor(t, templates, ownerName);
    if (owner) people.add(owner.trim());
  }
  return [...people].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

/**
 * Compute netted balances between every pair of people: what's owed from
 * split-cost transactions, minus what's already been recorded as settled.
 * @param {Array} reviewedTransactions - Transactions with reviewed === true
 * @param {Array} settlements - Recorded settlement ledger entries
 * @returns {Array<{from: string, to: string, amount: number}>} Netted balances, descending by amount
 */
export function computeNetBalances(reviewedTransactions, settlements) {
  // Directed running totals keyed by "from|to": how much "from" owes "to"
  const owed = new Map();
  const add = (from, to, amount) => {
    if (!from || !to || from === to || amount === 0) return;
    const key = `${from}|${to}`;
    owed.set(key, (owed.get(key) || 0) + amount);
  };

  for (const t of reviewedTransactions) {
    const splits = parseSplits(t.splits);
    if (splits.length < 2) continue; // no non-auto splits, nothing owed

    // The first split is always the payer (auto split) — trust what was
    // actually saved for this transaction rather than re-deriving it from
    // template/settings, since the payer name is editable per-transaction
    // (e.g. manual entries have no matching template at all).
    const owner = (splits[0].personName || '').trim();
    if (!owner) continue;

    for (const s of splits.slice(1)) {
      const other = (s.personName || '').trim();
      if (!other || other === owner) continue; // self-split guard
      const amount = Math.abs(s.amount || 0);
      if (amount === 0) continue;

      if (t.amount < 0) {
        add(other, owner, amount);
      } else if (t.amount > 0) {
        add(owner, other, amount);
      }
    }
  }

  for (const s of settlements || []) {
    // A settlement means fromPerson paid toPerson, reducing what fromPerson owes toPerson.
    add(s.fromPerson, s.toPerson, -s.amount);
  }

  // Collapse each unordered pair to a single signed net amount
  const seenPairs = new Set();
  const results = [];
  for (const key of owed.keys()) {
    const [a, b] = key.split('|');
    const pairKey = [a, b].sort().join('|');
    if (seenPairs.has(pairKey)) continue;
    seenPairs.add(pairKey);

    const net = round2((owed.get(`${a}|${b}`) || 0) - (owed.get(`${b}|${a}`) || 0));
    if (Math.abs(net) < 0.01) continue;

    results.push(net > 0
      ? { from: a, to: b, amount: net }
      : { from: b, to: a, amount: -net });
  }

  return results.sort((x, y) => y.amount - x.amount);
}
