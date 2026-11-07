// Core TripSplit logic:
// currencies, exchange rates, balances and "who pays whom" settlement.

export const CURRENCIES = [
  { code: 'MYR', flag: '🇲🇾', symbol: 'RM' },
  { code: 'SGD', flag: '🇸🇬', symbol: 'S$' },
  { code: 'THB', flag: '🇹🇭', symbol: '฿' },
  { code: 'IDR', flag: '🇮🇩', symbol: 'Rp' },
  { code: 'VND', flag: '🇻🇳', symbol: '₫' },
  { code: 'PHP', flag: '🇵🇭', symbol: '₱' },
  { code: 'JPY', flag: '🇯🇵', symbol: '¥' },
  { code: 'KRW', flag: '🇰🇷', symbol: '₩' },
  { code: 'CNY', flag: '🇨🇳', symbol: 'RMB' },
  { code: 'HKD', flag: '🇭🇰', symbol: 'HK$' },
  { code: 'TWD', flag: '🇹🇼', symbol: 'NT$' },
  { code: 'MOP', flag: '🇲🇴', symbol: 'MOP$' },
  { code: 'INR', flag: '🇮🇳', symbol: '₹' },
  { code: 'AUD', flag: '🇦🇺', symbol: 'A$' },
  { code: 'NZD', flag: '🇳🇿', symbol: 'NZ$' },
  { code: 'USD', flag: '🇺🇸', symbol: '$' },
  { code: 'CAD', flag: '🇨🇦', symbol: 'C$' },
  { code: 'EUR', flag: '🇪🇺', symbol: '€' },
  { code: 'GBP', flag: '🇬🇧', symbol: '£' },
  { code: 'CHF', flag: '🇨🇭', symbol: 'CHF' },
  { code: 'TRY', flag: '🇹🇷', symbol: '₺' },
  { code: 'AED', flag: '🇦🇪', symbol: 'AED' },
];

export const EXPENSE_CATEGORIES = [
  { key: 'food',      icon: '🍜', label: 'Food',      labelZh: '餐饮' },
  { key: 'transport', icon: '🚕', label: 'Transport', labelZh: '交通' },
  { key: 'stay',      icon: '🏨', label: 'Stay',      labelZh: '住宿' },
  { key: 'tickets',   icon: '🎟️', label: 'Tickets',   labelZh: '门票' },
  { key: 'shopping',  icon: '🛍️', label: 'Shopping',  labelZh: '购物' },
  { key: 'other',     icon: '📦', label: 'Other',     labelZh: '其他' },
];

export const TRIP_EMOJIS = ['✈️', '🏝️', '🏔️', '🗼', '🏯', '🎡', '🚗', '🚢', '🏕️', '🌸'];

export const categoryOf = (key) =>
  EXPENSE_CATEGORIES.find(c => c.key === key) || EXPENSE_CATEGORIES.at(-1);

const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'IDR']);

export function fmt(amount, currency = 'MYR') {
  const c = CURRENCIES.find(x => x.code === currency);
  const digits = ZERO_DECIMAL.has(currency) ? 0 : 2;
  const n = Number(amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `${c?.symbol ?? currency} ${n}`;
}

export const shareLink = (trip) => `${window.location.origin}/join/${trip.share_code}`;

export const participantName = (trip, id) =>
  (trip?.participants || []).find(p => p.id === id)?.name || '?';

export const myParticipant = (trip, userId) =>
  (trip?.participants || []).find(p => userId && p.user_id === userId);

// ---------- Exchange rates ----------
// Free, keyless API. Rates are cached per base currency for 6 hours.
const RATE_TTL = 6 * 60 * 60 * 1000;

export async function fetchRates(base) {
  const key = `trip_rates_${base}`;
  try {
    const cached = JSON.parse(localStorage.getItem(key) || 'null');
    if (cached && Date.now() - cached.at < RATE_TTL) return cached.rates;
  } catch { /* ignore */ }
  const res = await fetch(`https://open.er-api.com/v6/latest/${base}`);
  if (!res.ok) throw new Error('rate fetch failed');
  const json = await res.json();
  if (json.result !== 'success') throw new Error('rate fetch failed');
  try {
    localStorage.setItem(key, JSON.stringify({ at: Date.now(), rates: json.rates }));
  } catch { /* ignore */ }
  return json.rates;
}

// Returns how many units of `base` one unit of `currency` is worth.
export async function getRate(currency, base) {
  if (currency === base) return 1;
  const rates = await fetchRates(base); // rates[X] = X per 1 base
  const r = rates?.[currency];
  if (!r) throw new Error(`no rate for ${currency}`);
  return 1 / r;
}

// ---------- Splitting ----------
const toCents = (n) => Math.round((Number(n) || 0) * 100);

// Each person's share of one expense, in base-currency cents.
export function expenseShares(expense) {
  const total = toCents(expense.amount_base);
  if (expense.split_type === 'custom') {
    const out = {};
    for (const s of expense.custom_shares || []) out[s.participant_id] = toCents(s.amount_base);
    return out;
  }
  const ids = expense.split_among?.length ? expense.split_among : [expense.paid_by];
  const each = Math.floor(total / ids.length);
  let rest = total - each * ids.length;
  const out = {};
  // Spread leftover cents so shares always add up to the total.
  ids.forEach(id => { out[id] = each + (rest-- > 0 ? 1 : 0); });
  return out;
}

// How much of the trip's spending belongs to one person (their portion of
// shared costs plus their own personal expenses), in base currency.
export function personShare(expenses, participantId) {
  if (!participantId) return 0;
  return expenses.reduce((s, e) => s + (expenseShares(e)[participantId] || 0), 0) / 100;
}

// Per participant: paid, share (what they consumed), net (+ = should receive).
export function computeBalances(trip, expenses, settlements) {
  const rows = {};
  for (const p of trip.participants || []) rows[p.id] = { id: p.id, name: p.name, paid: 0, share: 0, net: 0 };
  const row = (id) => (rows[id] ||= { id, name: participantName(trip, id), paid: 0, share: 0, net: 0 });

  for (const e of expenses) {
    row(e.paid_by).paid += toCents(e.amount_base);
    for (const [id, c] of Object.entries(expenseShares(e))) row(id).share += c;
  }
  for (const r of Object.values(rows)) r.net = r.paid - r.share;
  for (const s of settlements) {
    const c = toCents(s.amount_base);
    row(s.from_participant).net += c;
    row(s.to_participant).net -= c;
  }
  return Object.values(rows).map(r => ({
    ...r, paid: r.paid / 100, share: r.share / 100, net: r.net / 100,
  }));
}

// Greedy minimal list of transfers that settles everyone.
export function suggestTransfers(balances) {
  const debtors = balances.filter(b => b.net < -0.004).map(b => ({ id: b.id, c: -toCents(b.net) }));
  const creditors = balances.filter(b => b.net > 0.004).map(b => ({ id: b.id, c: toCents(b.net) }));
  debtors.sort((a, b) => b.c - a.c);
  creditors.sort((a, b) => b.c - a.c);
  const out = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amt = Math.min(debtors[i].c, creditors[j].c);
    if (amt > 0) out.push({ from: debtors[i].id, to: creditors[j].id, amount: amt / 100 });
    debtors[i].c -= amt;
    creditors[j].c -= amt;
    if (debtors[i].c === 0) i++;
    if (creditors[j].c === 0) j++;
  }
  return out;
}
