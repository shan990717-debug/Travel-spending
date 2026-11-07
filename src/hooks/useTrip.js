import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { getTrip, listExpenses, listSettlements } from '@/lib/api';

// One trip + its expenses + settle-up payments, kept live: when anyone on
// the trip adds or edits something, every open screen refreshes.
export function useTrip(tripId) {
  const qc = useQueryClient();
  const trip = useQuery({ queryKey: ['trip', tripId], queryFn: () => getTrip(tripId), enabled: !!tripId });
  const expenses = useQuery({ queryKey: ['expenses', tripId], queryFn: () => listExpenses(tripId), enabled: !!tripId });
  const settlements = useQuery({ queryKey: ['settlements', tripId], queryFn: () => listSettlements(tripId), enabled: !!tripId });

  useEffect(() => {
    if (!tripId) return;
    const refresh = (key) => () => qc.invalidateQueries({ queryKey: [key, tripId] });
    const filter = `trip_id=eq.${tripId}`;
    const channel = supabase.channel(`trip-${tripId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter }, refresh('expenses'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settlements', filter }, refresh('settlements'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'participants', filter }, refresh('trip'))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'trips', filter: `id=eq.${tripId}` }, refresh('trip'))
      // Delete events carry no trip_id, so refresh on any delete.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'expenses' }, refresh('expenses'))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'settlements' }, refresh('settlements'))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tripId, qc]);

  return {
    trip: trip.data,
    expenses: expenses.data || [],
    settlements: settlements.data || [],
    isLoading: trip.isLoading || expenses.isLoading || settlements.isLoading,
    error: trip.error,
  };
}

export function invalidateTrip(qc, tripId) {
  for (const k of ['trip', 'expenses', 'settlements']) qc.invalidateQueries({ queryKey: [k, tripId] });
  qc.invalidateQueries({ queryKey: ['trips'] });
}
