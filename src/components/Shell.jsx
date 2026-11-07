import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

// Page frame for the Trips module: sticky header with back button.
export default function TripShell({ title, subtitle, back = -1, action, children, footer }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background flex flex-col max-w-lg mx-auto">
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border px-4 py-3 flex items-center gap-3">
        <button onClick={() => (typeof back === 'string' ? navigate(back) : navigate(back))}
          className="p-2 -ml-2 rounded-xl hover:bg-secondary transition-colors" aria-label="Back">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold truncate">{title}</h1>
          {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="flex-1 px-4 py-4 space-y-4 pb-32">{children}</div>
      {footer && (
        <div className="sticky bottom-0 bg-background border-t border-border px-4 py-4" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
          {footer}
        </div>
      )}
    </div>
  );
}

export function Field({ label, children, hint }) {
  return (
    <div>
      <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

export const inputCls =
  'w-full bg-secondary rounded-xl px-3 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary';

export function Spinner() {
  return (
    <div className="flex items-center justify-center h-screen">
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );
}

export function CurrencySelect({ value, onChange, currencies, className = '' }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={`${inputCls} ${className}`}>
      {currencies.map(c => (
        <option key={c.code} value={c.code}>{c.flag} {c.code}</option>
      ))}
    </select>
  );
}

export function Button({ variant = 'primary', className = '', ...props }) {
  const styles = {
    primary: 'bg-primary text-primary-foreground hover:opacity-90',
    secondary: 'bg-secondary text-foreground hover:opacity-80',
  };
  return (
    <button {...props}
      className={`inline-flex shrink-0 whitespace-nowrap items-center justify-center gap-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50 active:scale-[0.98] ${styles[variant]} ${className}`} />
  );
}

export function ProgressBar({ value, max, className = '', barClass = 'bg-primary' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={`w-full h-2 bg-secondary rounded-full overflow-hidden ${className}`}>
      <div className={`h-full rounded-full transition-all duration-500 ${barClass}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
