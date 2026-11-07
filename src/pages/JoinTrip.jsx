import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth';
import { useLang } from '@/lib/i18n';
import { previewTrip, joinTrip } from '@/lib/api';
import Shell, { inputCls, Spinner, Button } from '@/components/Shell';

export default function JoinTrip() {
  const { code } = useParams();
  const { displayName } = useAuth();
  const { zh } = useLang();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [trip, setTrip] = useState(undefined);
  const [choice, setChoice] = useState('new');
  const [name, setName] = useState(displayName);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    previewTrip(code).then(t => {
      if (t?.is_member) return navigate(`/t/${t.id}`, { replace: true });
      setTrip(t);
      const open = (t?.participants || []).filter(p => !p.claimed);
      if (open.length) setChoice(open[0].id);
    }).catch(() => setTrip(null));
  }, [code, navigate]);

  const join = async () => {
    if (choice === 'new' && !name.trim()) return toast.error(zh ? '请输入你的名字' : 'Enter your name');
    setJoining(true);
    try {
      const id = await joinTrip(code, choice === 'new' ? null : choice, choice === 'new' ? name.trim() : null);
      qc.invalidateQueries({ queryKey: ['trips'] });
      toast.success(zh ? '已加入旅行！' : 'Joined the trip!');
      navigate(`/t/${id}`, { replace: true });
    } catch (e) {
      toast.error(e.message);
      setJoining(false);
    }
  };

  if (trip === undefined) return <Spinner />;

  if (!trip) {
    return (
      <Shell title={zh ? '加入旅行' : 'Join trip'} back="/">
        <div className="text-center py-10 space-y-2">
          <p className="text-4xl">🔍</p>
          <p className="font-bold">{zh ? '找不到这个邀请码' : 'Invite code not found'}</p>
          <p className="text-sm text-muted-foreground">{zh ? '请检查链接或邀请码是否正确。' : 'Check the link or code and try again.'}</p>
        </div>
      </Shell>
    );
  }

  const open = trip.participants.filter(p => !p.claimed);

  return (
    <Shell title={zh ? '加入旅行' : 'Join trip'} back="/"
      footer={
        <Button onClick={join} disabled={joining} className="w-full h-12 text-base">
          {joining ? '…' : (zh ? '加入并开始记账' : 'Join & start logging')}
        </Button>
      }>
      <div className="text-center py-4">
        <p className="text-5xl">{trip.emoji || '✈️'}</p>
        <p className="text-xl font-extrabold mt-2">{trip.name}</p>
        {trip.destination && <p className="text-sm text-muted-foreground">{trip.destination}</p>}
        <p className="text-xs text-muted-foreground mt-1">{trip.participants.map(p => p.name).join(' · ')}</p>
      </div>

      <p className="text-sm font-bold">{zh ? '你是哪一位？' : 'Which one are you?'}</p>
      <div className="space-y-2">
        {open.map(p => (
          <label key={p.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer ${choice === p.id ? 'border-primary bg-primary/5' : 'border-border'}`}>
            <input type="radio" checked={choice === p.id} onChange={() => setChoice(p.id)} />
            <span className="font-semibold text-sm">{p.name}</span>
          </label>
        ))}
        <label className={`block p-3 rounded-xl border cursor-pointer space-y-2 ${choice === 'new' ? 'border-primary bg-primary/5' : 'border-border'}`}>
          <span className="flex items-center gap-3">
            <input type="radio" checked={choice === 'new'} onChange={() => setChoice('new')} />
            <span className="font-semibold text-sm">{open.length ? (zh ? '都不是，添加我' : "I'm not listed") : (zh ? '你的名字' : 'Your name')}</span>
          </span>
          {choice === 'new' && (
            <input value={name} onChange={e => setName(e.target.value)} className={inputCls} placeholder={zh ? '名字' : 'Name'} />
          )}
        </label>
      </div>
    </Shell>
  );
}
