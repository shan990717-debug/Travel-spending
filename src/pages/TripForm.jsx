import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Trash2, X, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth';
import { useLang } from '@/lib/i18n';
import { createTrip, updateTrip, deleteTrip, getTrip, listExpenses, listSettlements, setParticipantBudget } from '@/lib/api';
import { invalidateTrip } from '@/hooks/useTrip';
import Shell, { Field, inputCls, Spinner, CurrencySelect, Button } from '@/components/Shell';
import { CURRENCIES, TRIP_EMOJIS } from '@/lib/trips';

let tempId = 0;
const nextKey = () => `new-${++tempId}`;

export default function TripForm() {
  const { tripId } = useParams();
  const { user, displayName } = useAuth();
  const { zh } = useLang();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [form, setForm] = useState({
    name: '', destination: '', emoji: '✈️', start_date: '', end_date: '',
    base_currency: 'MYR', budget: '', notes: '', is_archived: false,
  });
  // people: { key, id?, name, user_id?, isMe? }
  const [people, setPeople] = useState([{ key: nextKey(), name: displayName || (zh ? '我' : 'Me'), isMe: true }]);
  const [original, setOriginal] = useState(null);
  const [usedIds, setUsedIds] = useState(new Set());
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!tripId) return;
    (async () => {
      try {
        const [t, exps, sets] = await Promise.all([getTrip(tripId), listExpenses(tripId), listSettlements(tripId)]);
        setOriginal(t);
        setForm({
          name: t.name || '', destination: t.destination || '', emoji: t.emoji || '✈️',
          start_date: t.start_date || '', end_date: t.end_date || '',
          base_currency: t.base_currency,
          budget: (() => { const b = t.participants.find(p => p.user_id === user.id)?.budget; return b ? String(b) : ''; })(),
          notes: t.notes || '', is_archived: !!t.is_archived,
        });
        setPeople(t.participants.map(p => ({ key: p.id, id: p.id, name: p.name, user_id: p.user_id, email: p.email })));
        const ids = new Set();
        exps.forEach(e => {
          ids.add(e.paid_by);
          (e.split_among || []).forEach(i => ids.add(i));
          (e.custom_shares || []).forEach(s => ids.add(s.participant_id));
        });
        sets.forEach(s => { ids.add(s.from_participant); ids.add(s.to_participant); });
        setUsedIds(ids);
      } catch (e) {
        toast.error(e.message);
        navigate('/', { replace: true });
      }
    })();
  }, [tripId, navigate, user.id]);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const hasExpenses = usedIds.size > 0;

  const addPerson = () => {
    const name = newName.trim();
    if (!name) return;
    setPeople(ps => [...ps, { key: nextKey(), name }]);
    setNewName('');
  };
  const renamePerson = (key, name) => setPeople(ps => ps.map(p => (p.key === key ? { ...p, name } : p)));
  const removePerson = (p) => {
    if (p.id && usedIds.has(p.id)) return toast.error(zh ? '这个人已有账目，不能删除' : 'This person already has expenses');
    if (p.user_id) return toast.error(zh ? '已加入的成员不能删除' : "Can't remove someone who has joined");
    setPeople(ps => ps.filter(x => x.key !== p.key));
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error(zh ? '请输入旅行名称' : 'Enter a trip name');
    const cleaned = people.map(p => ({ ...p, name: p.name.trim() }));
    if (cleaned.length === 0) return toast.error(zh ? '至少要有一个人' : 'Add at least one person');
    if (cleaned.some(p => !p.name)) return toast.error(zh ? '名字不能空白' : 'Names cannot be empty');
    setSaving(true);
    const myBudget = Math.max(0, parseFloat(form.budget) || 0);
    const fields = { ...form, name: form.name.trim() };
    try {
      if (tripId) {
        await updateTrip(tripId, fields, cleaned, original.participants);
        const me = original.participants.find(p => p.user_id === user.id);
        if (me && me.budget !== myBudget) await setParticipantBudget(me.id, myBudget);
        invalidateTrip(qc, tripId);
        toast.success(zh ? '已保存' : 'Saved');
        navigate(`/t/${tripId}`, { replace: true });
      } else {
        const trip = await createTrip(fields, cleaned.map(p => (p.isMe ? { ...p, budget: myBudget } : p)), user.id);
        qc.invalidateQueries({ queryKey: ['trips'] });
        toast.success(zh ? '旅行已创建，可以分享给朋友了' : 'Trip created — share it with your friends');
        navigate(`/t/${trip.id}`, { replace: true });
      }
    } catch (e) {
      toast.error(e.message);
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm(zh ? '删除这个旅行和所有账目？无法恢复。' : 'Delete this trip and all its expenses? This cannot be undone.')) return;
    try {
      await deleteTrip(tripId);
      qc.invalidateQueries({ queryKey: ['trips'] });
      toast.success(zh ? '已删除' : 'Deleted');
      navigate('/', { replace: true });
    } catch (e) {
      toast.error(e.message);
    }
  };

  if (tripId && !original) return <Spinner />;
  const isOwner = !tripId || original?.created_by === user.id;

  return (
    <Shell
      title={tripId ? (zh ? '编辑旅行' : 'Edit trip') : (zh ? '新旅行' : 'New trip')}
      back={tripId ? `/t/${tripId}` : '/'}
      action={tripId && isOwner && (
        <button onClick={remove} className="p-2 rounded-xl text-destructive hover:bg-destructive/10" aria-label="Delete">
          <Trash2 className="w-4 h-4" />
        </button>
      )}
      footer={
        <Button onClick={save} disabled={saving} className="w-full h-12 text-base">
          {saving ? '…' : (zh ? '保存' : 'Save')}
        </Button>
      }>
      <Field label={zh ? '旅行名称 *' : 'Trip name *'}>
        <input value={form.name} onChange={e => set('name', e.target.value)} className={inputCls}
          placeholder={zh ? '例如：东京 2026' : 'e.g. Tokyo 2026'} />
      </Field>

      <div className="flex gap-2 flex-wrap">
        {TRIP_EMOJIS.map(e => (
          <button key={e} onClick={() => set('emoji', e)}
            className={`w-10 h-10 rounded-xl text-xl border ${form.emoji === e ? 'border-primary bg-primary/10' : 'border-transparent bg-secondary'}`}>
            {e}
          </button>
        ))}
      </div>

      <Field label={zh ? '目的地' : 'Destination'}>
        <input value={form.destination} onChange={e => set('destination', e.target.value)} className={inputCls}
          placeholder={zh ? '例如：日本' : 'e.g. Japan'} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={zh ? '出发' : 'From'}>
          <input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} className={inputCls} />
        </Field>
        <Field label={zh ? '回来' : 'To'}>
          <input type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} className={inputCls} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label={zh ? '记账货币' : 'Home currency'}
          hint={hasExpenses ? (zh ? '已有账目，不能更改' : 'Locked once expenses exist') : (zh ? '预算和分账用这个货币' : 'Budget & balances use this')}>
          <CurrencySelect value={form.base_currency} onChange={v => set('base_currency', v)} currencies={CURRENCIES}
            className={hasExpenses ? 'opacity-60 pointer-events-none' : ''} />
        </Field>
        <Field label={zh ? `我的旅费目标 (${form.base_currency})` : `My budget (${form.base_currency})`}
          hint={zh ? '每个人各自设定，只算自己的花费' : 'Everyone sets their own'}>
          <input type="number" inputMode="decimal" value={form.budget} onChange={e => set('budget', e.target.value)}
            placeholder="0.00" className={`${inputCls} font-bold`} />
        </Field>
      </div>

      <Field label={zh ? '一起去的人' : "Who's going"}
        hint={zh ? '先写名字就好，朋友用分享链接加入时可以认领自己的名字' : 'Just add names — friends claim theirs when they join via the share link'}>
        <div className="space-y-2">
          {people.map(p => (
            <div key={p.key} className="flex items-center gap-2">
              <input value={p.name} onChange={e => renamePerson(p.key, e.target.value)} className={inputCls} />
              {(p.isMe || p.user_id === user.id) && <span className="text-[10px] text-primary font-semibold shrink-0">{zh ? '我' : 'me'}</span>}
              {p.user_id && p.user_id !== user.id && <span className="text-[10px] text-primary font-semibold shrink-0">{zh ? '已加入' : 'joined'}</span>}
              {!p.isMe && !p.user_id && (
                <button onClick={() => removePerson(p)} className="p-2 rounded-xl text-muted-foreground hover:text-destructive" aria-label="Remove">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
          <div className="flex gap-2">
            <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addPerson()}
              placeholder={zh ? '添加名字' : 'Add a name'} className={inputCls} />
            <Button variant="secondary" onClick={addPerson} aria-label="Add"><UserPlus className="w-4 h-4" /></Button>
          </div>
        </div>
      </Field>

      <Field label={zh ? '备注' : 'Notes'}>
        <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} className={`${inputCls} resize-none`} />
      </Field>

      {tripId && (
        <label className="flex items-center gap-3 text-sm font-medium">
          <input type="checkbox" checked={form.is_archived} onChange={e => set('is_archived', e.target.checked)} className="w-4 h-4" />
          {zh ? '旅行已结束（归档）' : 'Trip is over (archive)'}
        </label>
      )}
    </Shell>
  );
}
