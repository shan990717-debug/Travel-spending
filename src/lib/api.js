// All reads/writes to Supabase. Row Level Security on the server decides
// what each signed-in user can see, so queries here don't filter by user.
import { supabase } from './supabase';

const num = (v) => (v == null ? 0 : Number(v));
const check = ({ data, error }) => {
  if (error) throw error;
  return data;
};

const normTrip = (t) => ({
  ...t,
  budget: num(t.budget),
  participants: [...(t.participants || [])].sort((a, b) => (a.created_at < b.created_at ? -1 : 1)),
});
const normExpense = (e) => ({
  ...e,
  amount: num(e.amount),
  exchange_rate: num(e.exchange_rate),
  amount_base: num(e.amount_base),
  custom_shares: (e.custom_shares || []).map(s => ({ ...s, amount_base: num(s.amount_base) })),
});
const normSettlement = (s) => ({ ...s, amount_base: num(s.amount_base) });

// ---- trips
export async function listTrips() {
  const rows = check(await supabase.from('trips')
    .select('*, participants(id, name, user_id, created_at), expenses(amount_base)')
    .order('created_at', { ascending: false }));
  return rows.map(t => ({ ...normTrip(t), spent: (t.expenses || []).reduce((s, e) => s + num(e.amount_base), 0) }));
}

export async function getTrip(id) {
  return normTrip(check(await supabase.from('trips').select('*, participants(*)').eq('id', id).single()));
}

const TRIP_FIELDS = ['name', 'destination', 'emoji', 'start_date', 'end_date', 'base_currency', 'budget', 'notes', 'is_archived'];
const pickTrip = (f) => Object.fromEntries(TRIP_FIELDS.filter(k => k in f).map(k => [k, f[k] === '' ? null : f[k]]));

// people: [{ id?, name, isMe? }]
export async function createTrip(fields, people, userId) {
  const trip = check(await supabase.from('trips').insert(pickTrip(fields)).select().single());
  const rows = people.map(p => ({ trip_id: trip.id, name: p.name, user_id: p.isMe ? userId : null }));
  check(await supabase.from('participants').insert(rows));
  return trip;
}

export async function updateTrip(id, fields, people, original) {
  check(await supabase.from('trips').update(pickTrip(fields)).eq('id', id));
  const keep = new Set(people.filter(p => p.id).map(p => p.id));
  const removed = original.filter(p => !keep.has(p.id));
  for (const p of removed) check(await supabase.from('participants').delete().eq('id', p.id));
  for (const p of people) {
    if (!p.id) check(await supabase.from('participants').insert({ trip_id: id, name: p.name }));
    else if (original.find(o => o.id === p.id)?.name !== p.name)
      check(await supabase.from('participants').update({ name: p.name }).eq('id', p.id));
  }
}

export async function deleteTrip(id) {
  const files = check(await supabase.storage.from('receipts').list(id, { limit: 1000 })) || [];
  if (files.length) await supabase.storage.from('receipts').remove(files.map(f => `${id}/${f.name}`));
  check(await supabase.from('trips').delete().eq('id', id));
}

// ---- expenses
export async function listExpenses(tripId) {
  const rows = check(await supabase.from('expenses').select('*').eq('trip_id', tripId)
    .order('date', { ascending: false }).order('created_at', { ascending: false }));
  return rows.map(normExpense);
}

export async function saveExpense(id, record) {
  if (id) return check(await supabase.from('expenses').update(record).eq('id', id));
  return check(await supabase.from('expenses').insert(record));
}

export async function deleteExpense(expense) {
  if (expense.receipt_path) await supabase.storage.from('receipts').remove([expense.receipt_path]);
  check(await supabase.from('expenses').delete().eq('id', expense.id));
}

// ---- settle up
export async function listSettlements(tripId) {
  const rows = check(await supabase.from('settlements').select('*').eq('trip_id', tripId)
    .order('date', { ascending: false }).order('created_at', { ascending: false }));
  return rows.map(normSettlement);
}
export const createSettlement = async (row) => check(await supabase.from('settlements').insert(row));
export const deleteSettlement = async (id) => check(await supabase.from('settlements').delete().eq('id', id));

// ---- joining
export const previewTrip = async (code) => check(await supabase.rpc('trip_preview', { code }));
export const joinTrip = async (code, claimId, name) =>
  check(await supabase.rpc('join_trip', { code, claim_participant: claimId || null, display_name: name || null }));

// ---- receipts
export async function uploadReceipt(tripId, blob) {
  const path = `${tripId}/${crypto.randomUUID()}.jpg`;
  check(await supabase.storage.from('receipts').upload(path, blob, { contentType: 'image/jpeg' }));
  return path;
}

export async function receiptUrl(path) {
  const { data } = await supabase.storage.from('receipts').createSignedUrl(path, 3600);
  return data?.signedUrl || null;
}

export async function scanReceipt(tripId, base64, fallbackCurrency) {
  const { data, error } = await supabase.functions.invoke('scan-receipt', {
    body: { trip_id: tripId, image_base64: base64, media_type: 'image/jpeg', fallback_currency: fallbackCurrency },
  });
  if (error) throw error;
  return data;
}
