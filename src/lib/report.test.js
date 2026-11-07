import { describe, it, expect } from 'vitest';
import { buildReport, dayTotalLabel, money } from './report';

const trip = { base_currency: 'MYR', start_date: '2026-02-25', participants: [{ id: 'me' }, { id: 'f' }] };
const ex = (o) => ({ split_type: 'equal', split_among: ['me'], currency: 'MYR', exchange_rate: 1, ...o });
const expenses = [
  ex({ id: '1', title: '机票 KUL-KIX', category: 'transport', date: '2026-01-10', amount: 673, amount_base: 673 }),
  ex({ id: '2', title: 'IMANO Osaka', category: 'stay', date: '2026-01-12', amount: 321.52, amount_base: 321.52, split_among: ['me', 'f'] }),
  ex({ id: '3', title: '心斋桥拉面', category: 'food', date: '2026-02-25', amount: 1380, currency: 'JPY', exchange_rate: 0.03, amount_base: 41.4 }),
  ex({ id: '4', title: '章鱼烧', category: 'food', date: '2026-02-26', amount: 630, currency: 'JPY', exchange_rate: 0.03, amount_base: 18.9, split_among: ['me', 'f'] }),
  ex({ id: '5', title: 'USJ', category: 'tickets', date: '2026-02-26', amount: 298.59, amount_base: 298.59 }),
  ex({ id: '6', title: '朋友自己的', category: 'shopping', date: '2026-02-26', amount: 100, amount_base: 100, split_among: ['f'] }),
];

describe('buildReport (my share)', () => {
  const r = buildReport(trip, expenses, 'me');
  it('splits pre-trip vs on-trip by the start date', () => {
    expect(r.preTrip.map(c => c.key)).toEqual(['transport', 'stay']);
    expect(r.preTotal).toBeCloseTo(673 + 160.76, 2);
  });
  it('groups on-trip spending by day number', () => {
    expect(r.days.map(d => d.day)).toEqual([1, 2]);
  });
  it('shows my share in original currency and marks shared items per person', () => {
    const tako = r.days[1].items.find(i => i.title === '章鱼烧');
    expect(tako.amountOrig).toBeCloseTo(315, 5);
    expect(tako.perPerson).toBe(true);
  });
  it("leaves out expenses I'm not part of", () => {
    expect(r.days[1].items.some(i => i.title === '朋友自己的')).toBe(false);
  });
  it('labels day totals across currencies', () => {
    expect(dayTotalLabel(r.days[0], 'MYR')).toBe('¥1,380 (RM41.40)');
    expect(dayTotalLabel(r.days[1], 'MYR')).toBe('RM298.59 + ¥315 (RM308.04)');
  });
  it('totals everything', () => {
    expect(r.total).toBeCloseTo(673 + 160.76 + 41.4 + 9.45 + 298.59, 2);
    expect(money(1194, 'MYR')).toBe('RM1,194.00');
  });
});

describe('buildReport (group)', () => {
  it('uses full amounts and no per-person marks', () => {
    const r = buildReport(trip, expenses, null);
    expect(r.total).toBeCloseTo(673 + 321.52 + 41.4 + 18.9 + 298.59 + 100, 2);
    expect(r.days.flatMap(d => d.items).some(i => i.perPerson)).toBe(false);
  });
});
