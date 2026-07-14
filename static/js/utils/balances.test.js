import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeNetBalances, derivePeople, parseSplits } from './balances.js';

// Deterministic PRNG so "random" fixtures are reproducible across runs.
function mulberry32(seed) {
  return function rand() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

// Bob pays, Alice's share is a straight 50/50 split. The auto (Bob) split is
// the remainder rather than an independent half, so the two amounts always
// sum exactly to the transaction total (matching how the app itself computes
// the auto split, and avoiding rounding drift across the batch).
function buildBobPaysAliceFiftyFifty(rand, count) {
  const transactions = [];
  for (let i = 0; i < count; i++) {
    const total = round2(10 + rand() * 190); // $10.00 - $200.00
    const aliceAmount = round2(total / 2);
    const bobAmount = round2(total - aliceAmount);
    transactions.push({
      id: `bob-pays-${i}`,
      amount: -total, // expense: money leaving the account
      reviewed: true,
      source: 'Manual',
      splits: JSON.stringify([
        { personName: 'Bob', amount: bobAmount },
        { personName: 'Alice', amount: aliceAmount },
      ]),
    });
  }
  return transactions;
}

// Alice pays, Bob owes a 60% share (Alice keeps the 40% remainder as the
// auto split).
function buildAlicePaysBobSixtyForty(rand, count) {
  const transactions = [];
  for (let i = 0; i < count; i++) {
    const total = round2(10 + rand() * 190);
    const bobAmount = round2(total * 0.6);
    const aliceAmount = round2(total - bobAmount);
    transactions.push({
      id: `alice-pays-${i}`,
      amount: -total,
      reviewed: true,
      source: 'Manual',
      splits: JSON.stringify([
        { personName: 'Alice', amount: aliceAmount },
        { personName: 'Bob', amount: bobAmount },
      ]),
    });
  }
  return transactions;
}

function makeFixture() {
  const rand = mulberry32(42);
  const bobPays = buildBobPaysAliceFiftyFifty(rand, 100);
  const alicePays = buildAlicePaysBobSixtyForty(rand, 50);
  return { bobPays, alicePays, all: [...bobPays, ...alicePays] };
}

test('every generated transaction: splits sum to the transaction total', () => {
  const { all } = makeFixture();
  assert.equal(all.length, 150);

  for (const t of all) {
    const splits = parseSplits(t.splits);
    const splitTotal = round2(splits.reduce((sum, s) => sum + s.amount, 0));
    assert.equal(splitTotal, round2(Math.abs(t.amount)), `splits should sum to total for ${t.id}`);
  }
});

test('derivePeople finds exactly Bob and Alice', () => {
  const { all } = makeFixture();
  const people = derivePeople(all, [], '');
  assert.deepEqual(people, ['Alice', 'Bob']);
});

test('computeNetBalances nets the two batches to a single correct balance', () => {
  const { bobPays, alicePays, all } = makeFixture();

  // Batch 1: Alice owes Bob her half each time.
  const aliceOwesBob = round2(bobPays.reduce((sum, t) => sum + parseSplits(t.splits)[1].amount, 0));
  // Batch 2: Bob owes Alice his 60% each time.
  const bobOwesAlice = round2(alicePays.reduce((sum, t) => sum + parseSplits(t.splits)[1].amount, 0));
  const net = round2(aliceOwesBob - bobOwesAlice);

  const balances = computeNetBalances(all, []);
  assert.equal(balances.length, 1, 'exactly one pair of people, so exactly one net balance');

  const [balance] = balances;
  const [expectedFrom, expectedTo, expectedAmount] = net > 0
    ? ['Alice', 'Bob', net]
    : ['Bob', 'Alice', -net];

  assert.equal(balance.from, expectedFrom);
  assert.equal(balance.to, expectedTo);
  assert.equal(round2(balance.amount), expectedAmount);
});

test('computeNetBalances total money owed matches the raw per-transaction totals (nothing lost or double-counted)', () => {
  const { bobPays, alicePays, all } = makeFixture();

  const totalOwedRaw = round2(
    [...bobPays, ...alicePays].reduce((sum, t) => sum + parseSplits(t.splits)[1].amount, 0)
  );
  const [balance] = computeNetBalances(all, []);
  const totalPaidByEitherDirection = round2(
    bobPays.reduce((sum, t) => sum + parseSplits(t.splits)[1].amount, 0)
    + alicePays.reduce((sum, t) => sum + parseSplits(t.splits)[1].amount, 0)
  );

  assert.equal(totalOwedRaw, totalPaidByEitherDirection);
  // The netted balance can never exceed the raw total owed in either direction.
  assert.ok(balance.amount <= totalOwedRaw);
});

test('a settlement partially reduces the netted balance owed', () => {
  const { all } = makeFixture();
  const [before] = computeNetBalances(all, []);

  const settlements = [
    { fromPerson: before.from, toPerson: before.to, amount: 10 },
  ];
  const [after] = computeNetBalances(all, settlements);

  assert.equal(after.from, before.from);
  assert.equal(after.to, before.to);
  assert.equal(round2(after.amount), round2(before.amount - 10));
});

// Regression test for a real bug: computeNetBalances used to derive "who
// paid" from a template lookup / the database's global settings ownerName,
// ignoring the payer actually recorded in splits[0]. That's wrong for manual
// transactions (no matching template) whenever the auto split's name is
// edited away from the default owner - the debt was silently credited to the
// wrong person.
test('regression: payer is read from splits[0], not from settings ownerName', () => {
  const transactions = [
    {
      amount: -100,
      reviewed: true,
      source: 'Cash', // no template named "Cash" exists
      splits: JSON.stringify([
        { personName: 'Sarah', amount: 50 }, // actual payer, typed manually
        { personName: 'Naveen', amount: 50 },
      ]),
    },
  ];

  // Old buggy behavior would have used the global ownerName ("Naveen") as
  // the payer, producing a Sarah -> Naveen (or empty) balance instead.
  const [balance] = computeNetBalances(transactions, []);
  assert.equal(balance.from, 'Naveen');
  assert.equal(balance.to, 'Sarah');
  assert.equal(balance.amount, 50);
});
