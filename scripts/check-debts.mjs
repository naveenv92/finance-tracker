#!/usr/bin/env node
/**
 * Standalone debt checker — reads the real SQLite database directly and
 * prints debts computed straight from transaction splits, at three levels:
 * raw (per direction, unsettled), netted (per pair, unsettled), and netted
 * after settlements (what the app's Settle Debts page actually shows).
 * Useful for sanity-checking the app's Settle Debts math against the
 * actual data.
 *
 * Rules (mirrors static/js/utils/balances.js):
 *   - Only reviewed transactions with 2+ splits count (split transactions).
 *   - The first split is always the payer; every other split owes the payer
 *     their split amount (direction depends on the transaction's sign:
 *     negative = expense the payer covered, positive = income the payer
 *     collected on the group's behalf).
 *   - The raw/netted-unsettled sections ignore settlement history entirely.
 *     The "after settlements" section applies it, via the app's own
 *     computeNetBalances, as a direct comparison point.
 *
 * Usage:
 *   node scripts/check-debts.mjs                  # all databases
 *   node scripts/check-debts.mjs --db "Personal"   # one database, by name or id
 *   node scripts/check-debts.mjs --path /custom/data.db
 */

import { DatabaseSync } from 'node:sqlite';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseSplits, computeNetBalances } from '../static/js/utils/balances.js';

function parseArgs(argv) {
  const args = { db: null, path: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--db') args.db = argv[++i];
    else if (argv[i] === '--path') args.path = argv[++i];
  }
  return args;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function formatCurrency(value) {
  return `$${Math.abs(value).toFixed(2)}`;
}

/**
 * Raw per-pair debt totals for one database's transactions: no settlements,
 * only transactions with 2+ splits. Returns a list of directed debts
 * (not netted against the reverse direction) so every contributing
 * transaction's direction is preserved.
 */
function computeRawDebts(transactions) {
  const owed = new Map(); // "from|to" -> amount

  for (const t of transactions) {
    const splits = parseSplits(t.splits);
    if (splits.length < 2) continue; // not a split transaction

    const payer = (splits[0].personName || '').trim();
    if (!payer) continue;

    for (const s of splits.slice(1)) {
      const ower = (s.personName || '').trim();
      if (!ower || ower === payer) continue;
      const amount = Math.abs(s.amount || 0);
      if (amount === 0) continue;

      // Negative transaction amount = expense the payer covered, so
      // everyone else owes the payer. Positive = income the payer
      // collected on the group's behalf, so the payer owes everyone else.
      const [from, to] = t.amount < 0 ? [ower, payer] : t.amount > 0 ? [payer, ower] : [null, null];
      if (!from || !to) continue;

      const key = `${from}|${to}`;
      owed.set(key, round2((owed.get(key) || 0) + amount));
    }
  }

  return [...owed.entries()]
    .map(([key, amount]) => {
      const [from, to] = key.split('|');
      return { from, to, amount };
    })
    .sort((a, b) => b.amount - a.amount);
}

/**
 * Collapse raw directional debts down to one signed balance per unordered
 * pair (e.g. "A owes B $50" and "B owes A $30" -> "A owes B $20"). Still no
 * settlements involved — purely netting the two directions against each
 * other.
 */
function netDebts(rawDebts) {
  const byPair = new Map(); // "a|b" (sorted) -> { a, b, aOwesB, bOwesA }

  for (const { from, to, amount } of rawDebts) {
    const pairKey = [from, to].sort().join('|');
    const entry = byPair.get(pairKey) || { a: from, b: to, aOwesB: 0, bOwesA: 0 };
    if (!byPair.has(pairKey)) byPair.set(pairKey, entry);

    if (from === entry.a) entry.aOwesB += amount;
    else entry.bOwesA += amount;
  }

  const results = [];
  for (const { a, b, aOwesB, bOwesA } of byPair.values()) {
    const net = round2(aOwesB - bOwesA);
    if (Math.abs(net) < 0.01) continue;
    results.push(net > 0 ? { from: a, to: b, amount: net } : { from: b, to: a, amount: -net });
  }

  return results.sort((x, y) => y.amount - x.amount);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const dbPath = args.path || join(homedir(), '.finance-tracker', 'data.db');

  const db = new DatabaseSync(dbPath, { readOnly: true });

  try {
    const databases = db.prepare('SELECT id, name FROM databases ORDER BY name').all();
    if (databases.length === 0) {
      console.log('No databases found.');
      return;
    }

    const targets = args.db
      ? databases.filter(d => d.id === args.db || d.name.toLowerCase() === args.db.toLowerCase())
      : databases;

    if (args.db && targets.length === 0) {
      console.error(`No database matching "${args.db}". Available: ${databases.map(d => d.name).join(', ')}`);
      process.exitCode = 1;
      return;
    }

    const txStmt = db.prepare(
      'SELECT amount, splits FROM transactions WHERE database_id = ? AND reviewed = 1'
    );
    const settlementsStmt = db.prepare(
      'SELECT from_person AS fromPerson, to_person AS toPerson, amount FROM settlements WHERE database_id = ?'
    );

    for (const database of targets) {
      const transactions = txStmt.all(database.id);
      const settlements = settlementsStmt.all(database.id);
      const debts = computeRawDebts(transactions);

      console.log(`\n=== ${database.name} ===`);
      if (debts.length === 0) {
        console.log('  No raw debts (no reviewed split transactions).');
        continue;
      }

      console.log('  Raw (per direction, unsettled):');
      for (const { from, to, amount } of debts) {
        console.log(`    ${from} owes ${to}: ${formatCurrency(amount)}`);
      }

      console.log('  Netted (per pair, unsettled):');
      for (const { from, to, amount } of netDebts(debts)) {
        console.log(`    ${from} owes ${to}: ${formatCurrency(amount)}`);
      }

      console.log(`  Netted after settlements (${settlements.length} recorded) — matches the app's Settle Debts page:`);
      const settled = computeNetBalances(transactions, settlements);
      if (settled.length === 0) {
        console.log('    All settled up.');
      } else {
        for (const { from, to, amount } of settled) {
          console.log(`    ${from} owes ${to}: ${formatCurrency(amount)}`);
        }
      }
    }
  } finally {
    db.close();
  }
}

main();
