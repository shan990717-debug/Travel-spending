import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, Users, LogIn, LogOut, KeyRound } from 'lucide-react';
import { useLang } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import { listTrips } from '@/lib/api';
import { inputCls, Button, ProgressBar } from '@/components/Shell';
import { fmt, myParticipant, personShare } from '@/lib/trips';

export default function Trips() {
  const { zh, toggle } = useLang();
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const { data: trips = [], isLoading, error } = useQuery({ queryKey: ['trips'], queryFn: listTrips });
  const [code, setCode] = useState('');

  const active = trips.filter(t => !t.is_archived);
  const archived = trips.filter(t => t.is_archived);

  return (
    <div className="min-h-screen max-w-lg mx-auto px-4 pb-16" style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top))' }}>
      <div className="flex items-center justify-between py-2">
        <h1 className="text-2xl font-extrabold">✈️ {zh ? '我的旅行' : 'My Trips'}</h1>
        <div className="flex items-center gap-1">
          <button onClick={toggle} className="px-2 py-2 text-xs font-semibold text-muted-foreground">{zh ? 'EN' : '中文'}</button>
          <button onClick={() => navigate('/password')} className="p-2 rounded-xl text-muted-foreground hover:bg-secondary" aria-label={zh ? '设定密码' : 'Set password'}>
            <KeyRound className="w-4 h-4" />
          </button>
          <button onClick={() => confirm(zh ? `退出 ${user?.email}？` : `Sign out ${user?.email}?`) && signOut()}
            className="p-2 rounded-xl text-muted-foreground hover:bg-secondary" aria-label="Sign out">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="space-y-4 mt-2">
        <Button onClick={() => navigate('/new')} className="w-full h-12">
          <Plus className="w-5 h-5" />{zh ? '开一个新旅行' : 'New trip'}
        </Button>

        {isLoading && <p className="text-sm text-muted-foreground text-center py-8">…</p>}
        {error && <p className="text-sm text-destructive text-center">{error.message}</p>}

        {!isLoading && trips.length === 0 && (
          <div className="text-center py-8 space-y-2">
            <p className="text-5xl">🧳</p>
            <p className="font-bold">{zh ? '还没有旅行' : 'No trips yet'}</p>
            <p className="text-sm text-muted-foreground">
              {zh ? '每次旅行开一个账本：设预算、记每笔花费、最后自动算谁给谁多少钱。' : 'One ledger per trip: set a budget, log spending, and see who owes whom at the end.'}
            </p>
          </div>
        )}

        {active.map(t => <TripCard key={t.id} trip={t} userId={user?.id} zh={zh} onClick={() => navigate(`/t/${t.id}`)} />)}

        {archived.length > 0 && (
          <>
            <p className="text-sm font-bold text-muted-foreground pt-2">{zh ? '已结束' : 'Archived'}</p>
            {archived.map(t => <TripCard key={t.id} trip={t} userId={user?.id} zh={zh} onClick={() => navigate(`/t/${t.id}`)} />)}
          </>
        )}

        <div className="bg-card border border-border rounded-2xl p-4 space-y-2">
          <p className="text-sm font-bold flex items-center gap-2"><LogIn className="w-4 h-4" />{zh ? '加入朋友的旅行' : "Join a friend's trip"}</p>
          <div className="flex gap-2">
            <input value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} maxLength={6}
              placeholder={zh ? '6位邀请码' : '6-letter code'} className={`${inputCls} tracking-widest`} />
            <Button disabled={code.length < 6} onClick={() => navigate(`/join/${code}`)}>{zh ? '加入' : 'Join'}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TripCard({ trip, userId, zh, onClick }) {
  const me = myParticipant(trip, userId);
  const budget = me?.budget || 0;
  const spent = personShare(trip.expenses, me?.id);
  const left = budget - spent;
  const over = budget > 0 && left < 0;
  return (
    <button onClick={onClick} className="w-full text-left bg-card border border-border rounded-2xl p-4 space-y-3 hover:border-primary/40 transition-colors">
      <div className="flex items-start gap-3">
        <span className="text-3xl">{trip.emoji || '✈️'}</span>
        <div className="flex-1 min-w-0">
          <p className="font-bold truncate">{trip.name}</p>
          <p className="text-xs text-muted-foreground truncate">
            {[trip.destination, trip.start_date && `${trip.start_date}${trip.end_date ? ` → ${trip.end_date}` : ''}`].filter(Boolean).join(' · ')}
          </p>
        </div>
        <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
          <Users className="w-3.5 h-3.5" />{trip.participants.length}
        </span>
      </div>
      {budget > 0 ? (
        <div>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-muted-foreground">{zh ? '我花了' : 'My spending'} {fmt(spent, trip.base_currency)}</span>
            <span className={`font-bold ${over ? 'text-destructive' : 'text-primary'}`}>
              {over ? (zh ? '超支 ' : 'Over ') : (zh ? '剩 ' : 'Left ')}{fmt(Math.abs(left), trip.base_currency)}
            </span>
          </div>
          <ProgressBar value={spent} max={budget} barClass={over ? 'bg-destructive' : 'bg-primary'} />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {zh ? '我花了' : 'My spending'} {fmt(spent, trip.base_currency)} · {zh ? '全团' : 'Group'} {fmt(trip.spent, trip.base_currency)}
        </p>
      )}
    </button>
  );
}
