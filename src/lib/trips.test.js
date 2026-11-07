import { describe, it, expect } from 'vitest';
import { computeBalances, suggestTransfers, expenseShares } from './trips';

const trip = { participants: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }] };
const expenses = [
  { paid_by: 'a', amount_base: 100, split_type: 'equal', split_among: ['a', 'b', 'c'] },
  { paid_by: 'b', amount_base: 30, split_type: 'equal', split_among: ['b', 'c'] },
  { paid_by: 'c', amount_base: 60, split_type: 'custom', custom_shares: [
    { participant_id: 'a', amount_base: 10 }, { participant_id: 'c', amount_base: 50 }] },
];

describe('expenseShares', () => {
  it('splits equally and leftover cents still add up to the total', () => {
    const s = expenseShares({ paid_by: 'a', amount_base: 100, split_among: ['a', 'b', 'c'] });
    expect(Object.values(s).reduce((x, y) => x + y, 0)).toBe(10000);
  });
  it('falls back to the payer when nobody is selected', () => {
    expect(expenseShares({ paid_by: 'a', amount_base: 5, split_among: [] })).toEqual({ a: 500 });
  });
});

describe('balances and transfers', () => {
  it('computes paid, share and net per person', () => {
    const b = computeBalances(trip, expenses, []);
    expect(b.map(x => x.net)).toEqual([56.66, -18.33, -38.33]);
    expect(b.reduce((s, x) => s + x.share, 0)).toBeCloseTo(190, 2);
  });
  it('suggests the fewest transfers and they settle everyone', () => {
    const t = suggestTransfers(computeBalances(trip, expenses, []));
    expect(t).toEqual([{ from: 'c', to: 'a', amount: 38.33 }, { from: 'b', to: 'a', amount: 18.33 }]);
    const settlements = t.map(x => ({ from_participant: x.from, to_participant: x.to, amount_base: x.amount }));
    expect(suggestTransfers(computeBalances(trip, expenses, settlements))).toEqual([]);
  });
});
