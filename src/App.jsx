import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from '@/lib/auth';
import { LangProvider } from '@/lib/i18n';
import { isConfigured } from '@/lib/supabase';
import { Spinner } from '@/components/Shell';
import Login from '@/pages/Login';
import Trips from '@/pages/Trips';
import TripForm from '@/pages/TripForm';
import TripDetail from '@/pages/TripDetail';
import ExpenseForm from '@/pages/ExpenseForm';
import JoinTrip from '@/pages/JoinTrip';
import Report from '@/pages/Report';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, refetchOnWindowFocus: true, retry: 1 } },
});

function Routed() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Login />;
  return (
    <Routes>
      <Route path="/" element={<Trips />} />
      <Route path="/new" element={<TripForm />} />
      <Route path="/join/:code" element={<JoinTrip />} />
      <Route path="/t/:tripId" element={<TripDetail />} />
      <Route path="/t/:tripId/edit" element={<TripForm />} />
      <Route path="/t/:tripId/expense" element={<ExpenseForm />} />
      <Route path="/t/:tripId/report" element={<Report />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  if (!isConfigured) {
    return (
      <div className="max-w-md mx-auto p-6 space-y-2 text-sm">
        <p className="font-bold text-lg">Supabase not configured</p>
        <p>Copy <code>.env.example</code> to <code>.env.local</code> and fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. See README.</p>
      </div>
    );
  }
  return (
    <QueryClientProvider client={queryClient}>
      <LangProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routed />
          </BrowserRouter>
          <Toaster position="top-center" richColors />
        </AuthProvider>
      </LangProvider>
    </QueryClientProvider>
  );
}
