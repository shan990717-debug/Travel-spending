import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Camera, Plus, Share2, Pencil, ArrowRight, Check, Copy, X, Paperclip, Trash2, FileText, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth';
import { useLang } from '@/lib/i18n';
import { useTrip, invalidateTrip } from '@/hooks/useTrip';
import { createSettlement, deleteSettlement, setParticipantBudget } from '@/lib/api';
import Shell, { Spinner, ProgressBar } from '@/components/Shell';
import {
  EXPENSE_CATEGORIES, categoryOf, computeBalances, suggestTransfers, fmt,
  participantName, shareLink, expenseShares, myParticipant, personShare,
} from '@/lib/trips';

export default function TripDetail() {
  const { tripId } = useParams();
  const { user } = useAuth();
  const { zh } = useLang();
  const navigate = useNavigate();
  const { trip, expenses, settlements, isLoading, error } = useTrip(tripId);
  const [tab, setTab] = useState('expenses');
  const [showShare, setShowShare] = useState(false);

  if (isLoading) return <Spinner />;
  if (error || !trip) {
    return (
      <Shell title={zh ? '找不到旅行' : 'Trip not found'} back="/">
        <p className="text-sm text-muted-foreground">
          {zh ? '这个旅行不存在、已被删除，或你还不是成员（请向朋友索取邀请链接）。' : "This trip doesn't exist, was deleted, or you're not a member yet (ask a friend for the invite link)."}
        </p>
      </Shell>
    );
  }
  const groupSpent = expenses.reduce((s, e) => s + (e.amount_base || 0), 0);
  const me = myParticipant(trip, user.id);

  return (
    <Shell
      title={`${trip.emoji || '✈️'} ${trip.name}`}
      subtitle={[trip.destination, trip.start_date && `${trip.start_date}${trip.end_date ? ` → ${trip.end_date}` : ''}`].filter(Boolean).join(' · ')}
      back="/"
      action={
        <div className="flex gap-1">
          <button onClick={() => navigate(`/t/${tripId}/report`)} className="p-2 rounded-xl hover:bg-secondary" aria-label={zh ? '花费明细' : 'Report'}>
            <FileText className="w-4 h-4" />
          </button>
          <button onClick={() => setShowShare(true)} className="p-2 rounded-xl hover:bg-secondary" aria-label="Share">
            <Share2 className="w-4 h-4" />
          </button>
          <button onClick={() => navigate(`/t/${tripId}/edit`)} className="p-2 rounded-xl hover:bg-secondary" aria-label="Edit">
            <Pencil className="w-4 h-4" />
          </button>
        </div>
      }>
      <MyBudgetCard trip={trip} me={me} expenses={expenses} groupSpent={groupSpent} zh={zh} />

      {/* Tabs */}
      <div className="grid grid-cols-3 gap-1 p-1 bg-secondary rounded-xl">
        {[['expenses', zh ? '账目' : 'Expenses'], ['balances', zh ? '分账' : 'Split'], ['people', zh ? '成员' : 'People']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`py-2 rounded-lg text-sm font-bold ${tab === k ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>{l}</button>
        ))}
      </div>

      {tab === 'expenses' && <ExpenseList trip={trip} expenses={expenses} zh={zh} />}
      {tab === 'balances' && <Balances trip={trip} expenses={expenses} settlements={settlements} zh={zh} />}
      {tab === 'people' && <People trip={trip} expenses={expenses} zh={zh} onShare={() => setShowShare(true)} />}

      {/* Floating add buttons */}
      {tab === 'expenses' && <div className="fixed bottom-6 inset-x-0 max-w-lg mx-auto px-4 flex justify-end gap-3 pointer-events-none z-30"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <button onClick={() => navigate(`/t/${tripId}/expense?scan=1`)} aria-label={zh ? '拍照记账' : 'Scan receipt'}
          className="pointer-events-auto w-14 h-14 rounded-full bg-card border border-border shadow-lg flex items-center justify-center active:scale-95">
          <Camera className="w-6 h-6 text-primary" />
        </button>
        <button onClick={() => navigate(`/t/${tripId}/expense`)}
          className="pointer-events-auto h-14 px-5 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 flex items-center gap-2 font-bold active:scale-95">
          <Plus className="w-5 h-5" />{zh ? '记一笔' : 'Add'}
        </button>
      </div>}

      {showShare && <ShareSheet trip={trip} zh={zh} onClose={() => setShowShare(false)} />}
    </Shell>
  );
}

// Each person sees their own budget: target minus their share of spending
// (shared costs split to them + their personal expenses).
function MyBudgetCard({ trip, me, expenses, groupSpent, zh }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const base = trip.base_currency;
  const budget = me?.budget || 0;
  const spent = personShare(expenses, me?.id);
  const left = budget - spent;
  const over = budget > 0 && left < 0;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const mine = me ? expenses.filter(e => expenseShares(e)[me.id]) : [];

  const startEdit = () => { setValue(budget ? String(budget) : ''); setEditing(true); };
  const save = async () => {
    setSaving(true);
    try {
      await setParticipantBudget(me.id, Math.max(0, parseFloat(value) || 0));
      invalidateTrip(qc, trip.id);
      setEditing(false);
      toast.success(zh ? '已更新我的旅费目标' : 'Budget updated');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`rounded-2xl p-5 text-white ${over ? 'bg-gradient-to-br from-red-500 to-red-600' : 'bg-gradient-to-br from-primary to-primary/80'}`}>
      {editing ? (
        <div className="space-y-2">
          <p className="text-xs opacity-80">{zh ? `我的旅费目标 (${base})` : `My budget (${base})`}</p>
          <div className="flex gap-2">
            <input type="number" inputMode="decimal" autoFocus value={value} onChange={e => setValue(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && save()} placeholder="0.00"
              className="flex-1 min-w-0 rounded-xl bg-white/20 px-3 py-2.5 text-xl font-extrabold placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-white" />
            <button onClick={save} disabled={saving} className="rounded-xl bg-white text-primary px-4 font-bold text-sm">
              {saving ? '…' : (zh ? '保存' : 'Save')}
            </button>
            <button onClick={() => setEditing(false)} className="rounded-xl bg-white/20 px-3" aria-label="Cancel"><X className="w-4 h-4" /></button>
          </div>
          <p className="text-[11px] opacity-80">{zh ? '只有你自己看得到这个余额，每个人可以设不同的目标。' : 'Each person sets their own target and sees their own balance.'}</p>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between">
            <p className="text-xs opacity-80">
              {budget > 0 ? (over ? (zh ? '我已超支' : "I'm over budget") : (zh ? '我的剩余旅费' : 'My budget left')) : (zh ? '我的花费' : 'My spending')}
            </p>
            {me && (
              <button onClick={startEdit} className="-mt-1 -mr-1 p-1.5 rounded-lg hover:bg-white/15" aria-label={zh ? '编辑我的旅费目标' : 'Edit my budget'}>
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <p className="text-3xl font-extrabold">{fmt(budget > 0 ? Math.abs(left) : spent, base)}</p>
          {budget > 0 ? (
            <>
              <p className="text-xs opacity-80 mt-0.5">
                {zh ? `我花了 ${fmt(spent, base)} / 目标 ${fmt(budget, base)}` : `${fmt(spent, base)} spent of ${fmt(budget, base)}`}
              </p>
              <ProgressBar value={spent} max={budget} className="mt-3 bg-white/20" barClass="bg-white" />
            </>
          ) : me && (
            <button onClick={startEdit} className="text-xs underline opacity-90 mt-1">
              {zh ? '设定我的旅费目标' : 'Set my budget'}
            </button>
          )}
          <p className="text-[11px] opacity-75 mt-2">
            {zh ? `全团总花费 ${fmt(groupSpent, base)}` : `Group total ${fmt(groupSpent, base)}`}
          </p>
          {spent > 0 && <CategoryBar expenses={mine} spent={spent} shareOf={me.id} base={base} zh={zh} />}
          {groupSpent > 0 && (
            <button onClick={() => navigate(`/t/${trip.id}/report`)}
              className="mt-3 w-full flex items-center justify-between rounded-xl bg-white/15 hover:bg-white/25 px-3 py-2 text-xs font-bold">
              <span>📒 {zh ? '查看花费明细账单' : 'View spending report'}</span><ChevronRight className="w-4 h-4" />
            </button>
          )}
        </>
      )}
    </div>
  );
}

function CategoryBar({ expenses, spent, shareOf, base, zh }) {
  const totals = EXPENSE_CATEGORIES.map(c => ({
    ...c, total: expenses.filter(e => (e.category || 'other') === c.key)
      .reduce((s, e) => s + (shareOf ? (expenseShares(e)[shareOf] || 0) / 100 : (e.amount_base || 0)), 0),
  })).filter(c => c.total > 0).sort((a, b) => b.total - a.total);
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-3 text-[11px]">
      {totals.map(c => (
        <div key={c.key} className="flex items-center justify-between gap-1 opacity-95">
          <span className="truncate">{c.icon} {zh ? c.labelZh : c.label}</span>
          <span className="font-bold whitespace-nowrap">{fmt(c.total, base)} <span className="opacity-70 font-normal">{Math.round((c.total / spent) * 100)}%</span></span>
        </div>
      ))}
    </div>
  );
}

function ExpenseList({ trip, expenses, zh }) {
  const navigate = useNavigate();
  const base = trip.base_currency;
  const groups = useMemo(() => {
    const m = new Map();
    for (const e of expenses) {
      const d = e.date || '—';
      if (!m.has(d)) m.set(d, []);
      m.get(d).push(e);
    }
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [expenses]);

  if (expenses.length === 0) {
    return (
      <div className="text-center py-10 text-sm text-muted-foreground">
        <p className="text-4xl mb-2">🧾</p>
        {zh ? '还没有账目，拍张收据或点「记一笔」' : 'No expenses yet — snap a receipt or tap Add'}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map(([date, list]) => (
        <div key={date} className="space-y-2">
          <div className="flex justify-between text-xs font-bold text-muted-foreground px-1">
            <span>{date}</span>
            <span>{fmt(list.reduce((s, e) => s + (e.amount_base || 0), 0), base)}</span>
          </div>
          <div className="bg-card border border-border rounded-2xl divide-y divide-border overflow-hidden">
            {list.map(e => {
              const cat = categoryOf(e.category);
              const n = e.split_type === 'custom' ? Object.keys(expenseShares(e)).length : (e.split_among?.length || 1);
              return (
                <button key={e.id} onClick={() => navigate(`/t/${trip.id}/expense?id=${e.id}`)}
                  className="w-full flex items-center gap-3 p-3 text-left hover:bg-secondary/50">
                  <span className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center text-lg shrink-0">{cat.icon}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold truncate">
                      {e.title}{e.receipt_path && <Paperclip className="inline w-3 h-3 ml-1 text-muted-foreground" />}
                    </span>
                    <span className="block text-xs text-muted-foreground truncate">
                      {participantName(trip, e.paid_by)} {zh ? '付' : 'paid'} · {zh ? `${n}人分` : `split ${n}`}
                    </span>
                  </span>
                  <span className="text-right shrink-0">
                    <span className="block text-sm font-bold">{fmt(e.amount_base, base)}</span>
                    {e.currency !== base && <span className="block text-[11px] text-muted-foreground">{fmt(e.amount, e.currency)}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function Balances({ trip, expenses, settlements, zh }) {
  const qc = useQueryClient();
  const base = trip.base_currency;
  const balances = computeBalances(trip, expenses, settlements);
  const transfers = suggestTransfers(balances);
  const [busy, setBusy] = useState(null);
  const name = (id) => participantName(trip, id);

  const markPaid = async (t, i) => {
    if (!confirm(zh ? `确认 ${name(t.from)} 已付 ${fmt(t.amount, base)} 给 ${name(t.to)}？` : `Mark ${name(t.from)} paid ${fmt(t.amount, base)} to ${name(t.to)}?`)) return;
    setBusy(i);
    try {
      await createSettlement({ trip_id: trip.id, from_participant: t.from, to_participant: t.to, amount_base: t.amount });
      invalidateTrip(qc, trip.id);
      toast.success(zh ? '已记录还款' : 'Payment recorded');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  };

  const undo = async (s) => {
    if (!confirm(zh ? '撤销这笔还款记录？' : 'Undo this payment?')) return;
    try {
      await deleteSettlement(s.id);
      invalidateTrip(qc, trip.id);
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
        <p className="text-sm font-bold">{zh ? '谁给谁钱' : 'Who pays whom'}</p>
        {transfers.length === 0 ? (
          <p className="text-sm text-primary font-semibold">{expenses.length ? (zh ? '✓ 全部结清了！' : '✓ All settled up!') : (zh ? '还没有账目' : 'No expenses yet')}</p>
        ) : transfers.map((t, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-sm font-semibold truncate max-w-[30%]">{name(t.from)}</span>
            <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-semibold truncate max-w-[30%]">{name(t.to)}</span>
            <span className="ml-auto text-sm font-extrabold shrink-0">{fmt(t.amount, base)}</span>
            <button onClick={() => markPaid(t, i)} disabled={busy === i} aria-label={zh ? '标记已付' : 'Mark paid'}
              className="p-2 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 shrink-0">
              <Check className="w-4 h-4" />
            </button>
          </div>
        ))}
        {transfers.length > 0 && (
          <p className="text-[11px] text-muted-foreground">{zh ? '已用最少转账次数计算。付款后按 ✓ 记录。' : 'Fewest transfers needed. Tap ✓ once someone has paid.'}</p>
        )}
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 px-4 py-2 text-[11px] font-bold text-muted-foreground border-b border-border">
          <span>{zh ? '人' : 'Person'}</span><span className="text-right">{zh ? '付了' : 'Paid'}</span>
          <span className="text-right">{zh ? '应摊' : 'Share'}</span><span className="text-right w-24">{zh ? '差额' : 'Balance'}</span>
        </div>
        {balances.map(b => (
          <div key={b.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 px-4 py-2.5 text-sm items-center border-b border-border last:border-0">
            <span className="font-semibold truncate">{b.name}</span>
            <span className="text-right text-xs text-muted-foreground">{fmt(b.paid, base)}</span>
            <span className="text-right text-xs text-muted-foreground">{fmt(b.share, base)}</span>
            <span className={`text-right font-bold w-24 whitespace-nowrap ${b.net > 0.004 ? 'text-primary' : b.net < -0.004 ? 'text-destructive' : 'text-muted-foreground'}`}>
              {b.net > 0.004 ? '+' : ''}{fmt(b.net, base)}
            </span>
          </div>
        ))}
        <p className="text-[11px] text-muted-foreground px-4 py-2">{zh ? '+ 代表要收钱，− 代表要给钱' : '+ gets money back, − owes money'}</p>
      </div>

      {settlements.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-4 space-y-2">
          <p className="text-sm font-bold">{zh ? '还款记录' : 'Payments made'}</p>
          {settlements.map(s => (
            <div key={s.id} className="flex items-center gap-2 text-sm">
              <span className="text-xs text-muted-foreground w-20 shrink-0">{s.date}</span>
              <span className="truncate">{name(s.from_participant)} → {name(s.to_participant)}</span>
              <span className="ml-auto font-bold shrink-0">{fmt(s.amount_base, base)}</span>
              <button onClick={() => undo(s)} className="p-1.5 text-muted-foreground hover:text-destructive" aria-label="Undo">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function People({ trip, expenses, zh, onShare }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const base = trip.base_currency;
  return (
    <div className="space-y-3">
      <div className="bg-card border border-border rounded-2xl divide-y divide-border">
        {(trip.participants || []).map(p => {
          const paid = expenses.filter(e => e.paid_by === p.id).reduce((s, e) => s + (e.amount_base || 0), 0);
          return (
            <div key={p.id} className="flex items-center gap-3 p-3">
              <span className="w-9 h-9 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center">{p.name?.[0]?.toUpperCase()}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold truncate">{p.name}{p.user_id === user.id && <span className="text-primary text-xs"> · {zh ? '我' : 'me'}</span>}</span>
                <span className="block text-xs text-muted-foreground truncate">
                  {p.user_id ? (p.email || (zh ? '已加入' : 'Joined')) : (zh ? '还没加入（只有名字）' : 'Not joined yet (name only)')}
                </span>
              </span>
              <span className="text-xs text-muted-foreground">{zh ? '付了' : 'paid'} {fmt(paid, base)}</span>
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={onShare} className="rounded-xl bg-primary text-primary-foreground py-3 text-sm font-bold flex items-center justify-center gap-2">
          <Share2 className="w-4 h-4" />{zh ? '邀请朋友' : 'Invite friends'}
        </button>
        <button onClick={() => navigate(`/t/${trip.id}/edit`)} className="rounded-xl bg-secondary py-3 text-sm font-bold">
          {zh ? '管理成员' : 'Manage people'}
        </button>
      </div>
    </div>
  );
}

function ShareSheet({ trip, zh, onClose }) {
  const link = shareLink(trip);
  const text = zh
    ? `一起记「${trip.name}」的旅行账吧！打开链接加入：${link}（邀请码 ${trip.share_code}）`
    : `Join "${trip.name}" to log our trip expenses together: ${link} (code ${trip.share_code})`;

  const copy = async () => {
    try { await navigator.clipboard.writeText(link); toast.success(zh ? '链接已复制' : 'Link copied'); }
    catch { toast.error(link); }
  };
  const share = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: trip.name, text }); } catch { /* cancelled */ }
    } else copy();
  };
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(text)}`;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-lg bg-card rounded-t-3xl p-5 space-y-4" onClick={e => e.stopPropagation()}
        style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}>
        <div className="flex items-center justify-between">
          <p className="font-bold">{zh ? '分享这个旅行账本' : 'Share this trip'}</p>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-secondary"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-sm text-muted-foreground">
          {zh ? '朋友打开链接登录后就能一起记账，大家看到同一份账目。' : 'Friends open the link, sign in, and can add expenses. Everyone sees the same ledger.'}
        </p>
        <div className="text-center bg-secondary rounded-2xl py-4">
          <p className="text-xs text-muted-foreground">{zh ? '邀请码' : 'Invite code'}</p>
          <p className="text-3xl font-extrabold tracking-[0.3em]">{trip.share_code}</p>
        </div>
        <div className="flex gap-2">
          <input readOnly value={link} className="flex-1 min-w-0 bg-secondary rounded-xl px-3 py-2.5 text-xs" onFocus={e => e.target.select()} />
          <button onClick={copy} className="px-3 rounded-xl bg-secondary" aria-label="Copy"><Copy className="w-4 h-4" /></button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <a href={whatsapp} target="_blank" rel="noreferrer" className="rounded-xl bg-green-600 text-white py-3 text-sm font-bold text-center">WhatsApp</a>
          <button onClick={share} className="rounded-xl bg-primary text-primary-foreground py-3 text-sm font-bold">{zh ? '更多分享方式' : 'More…'}</button>
        </div>
      </div>
    </div>
  );
}
