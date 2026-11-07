// Builds the end-of-trip expense report: pre-trip costs grouped by category,
// then on-trip spending day by day. Pure functions so they can be tested.
import { CURRENCIES, EXPENSE_CATEGORIES, categoryOf, expenseShares } from './trips';

const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'IDR']);
const dayMs = 86400000;
const toDate = (s) => new Date(`${s}T00:00:00Z`);

// "¥4,026", "RM119.97" — compact, no space, for the report.
export function money(amount, currency) {
  const sym = CURRENCIES.find(c => c.code === currency)?.symbol ?? `${currency} `;
  const digits = ZERO_DECIMAL.has(currency) ? 0 : 2;
  const n = Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${amount < 0 ? '-' : ''}${sym}${n}`;
}

// One line in the report, from one expense. With a participant, uses only
// their share; shared items are marked so they can show "/人".
function toItem(e, participantId, base) {
  const shareBase = participantId ? (expenseShares(e)[participantId] || 0) / 100 : e.amount_base;
  if (!shareBase) return null;
  const ratio = e.amount_base > 0 ? shareBase / e.amount_base : 1;
  const splitCount = e.split_type === 'custom' ? (e.custom_shares || []).length : (e.split_among || []).length;
  return {
    id: e.id,
    title: e.title,
    date: e.date,
    category: e.category || 'other',
    amountBase: shareBase,
    currency: e.currency,
    amountOrig: e.currency === base ? shareBase : e.amount * ratio,
    perPerson: !!participantId && splitCount > 1,
  };
}

// Totals per original currency, e.g. { JPY: 4026, MYR: 11.9 }.
function byCurrency(items) {
  const out = {};
  for (const it of items) out[it.currency] = (out[it.currency] || 0) + it.amountOrig;
  return out;
}

// "¥4,026 (RM119.97)" or "RM298.59 + ¥2,650 (RM377.56)".
export function dayTotalLabel(day, base) {
  const parts = Object.entries(day.byCurrency).sort(([a], [b]) => (a === base ? -1 : b === base ? 1 : 0));
  const text = parts.map(([c, v]) => money(v, c)).join(' + ');
  const onlyBase = parts.length === 1 && parts[0][0] === base;
  return onlyBase ? text : `${text} (${money(day.totalBase, base)})`;
}

export function buildReport(trip, expenses, participantId = null) {
  const base = trip.base_currency;
  const items = expenses.map(e => toItem(e, participantId, base)).filter(Boolean)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const start = trip.start_date || items[0]?.date || null;
  const isPre = (it) => trip.start_date && it.date < trip.start_date;
  const pre = items.filter(isPre);
  const onTrip = items.filter(it => !isPre(it));

  const preTrip = EXPENSE_CATEGORIES.map(c => {
    const list = pre.filter(it => it.category === c.key);
    return { ...c, items: list, total: list.reduce((s, it) => s + it.amountBase, 0) };
  }).filter(c => c.items.length).sort((a, b) => b.total - a.total);

  const dayMap = new Map();
  for (const it of onTrip) {
    const n = start ? Math.round((toDate(it.date) - toDate(start)) / dayMs) + 1 : 1;
    if (!dayMap.has(n)) dayMap.set(n, { day: n, date: it.date, items: [] });
    dayMap.get(n).items.push(it);
  }
  const days = [...dayMap.values()].sort((a, b) => a.day - b.day).map(d => ({
    ...d,
    totalBase: d.items.reduce((s, it) => s + it.amountBase, 0),
    byCurrency: byCurrency(d.items),
  }));

  const categories = EXPENSE_CATEGORIES.map(c => ({
    ...c, total: items.filter(it => it.category === c.key).reduce((s, it) => s + it.amountBase, 0),
  })).filter(c => c.total > 0).sort((a, b) => b.total - a.total);

  const total = items.reduce((s, it) => s + it.amountBase, 0);
  const preTotal = pre.reduce((s, it) => s + it.amountBase, 0);
  return {
    base, total, preTotal, onTripTotal: total - preTotal,
    preTrip, days, categories,
    dailyAverage: days.length ? (total - preTotal) / days.length : 0,
    itemCount: items.length,
  };
}

export { categoryOf };
