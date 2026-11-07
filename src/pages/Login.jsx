import React, { useState } from 'react';
import { Mail } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useLang } from '@/lib/i18n';
import { Button, inputCls } from '@/components/Shell';

// Google sign-in needs the Google provider switched on in Supabase first.
// Set VITE_ENABLE_GOOGLE=true in Vercel once it is, to show the button.
const GOOGLE_ENABLED = import.meta.env.VITE_ENABLE_GOOGLE === 'true';

export default function Login() {
  const { zh, toggle } = useLang();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  // A home-screen app on iPhone doesn't share login with Safari, so the email
  // link would log in Safari instead. The code in the email works everywhere.
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone;
  const joining = window.location.pathname.startsWith('/join/');
  // Come back to the same page (e.g. an invite link) after signing in.
  const redirectTo = window.location.href;

  const sendLink = async (e) => {
    e.preventDefault();
    if (!email.includes('@')) return toast.error(zh ? '请输入正确的邮箱' : 'Enter a valid email');
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirectTo } });
    setBusy(false);
    if (error) return toast.error(error.message);
    setSent(true);
  };

  const verifyCode = async (e) => {
    e.preventDefault();
    const token = code.replace(/\D/g, '');
    if (token.length < 6) return toast.error(zh ? '请输入邮件里的验证码' : 'Enter the code from the email');
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token, type: 'email' });
    setBusy(false);
    if (error) toast.error(zh ? '验证码不对或已过期，请重新发送' : 'Wrong or expired code — send a new one');
  };

  const google = async () => {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
    if (error) toast.error(error.message);
  };

  return (
    <div className="min-h-screen max-w-md mx-auto px-6 flex flex-col justify-center gap-6">
      <button onClick={toggle} className="absolute top-4 right-4 text-xs font-semibold text-muted-foreground">
        {zh ? 'EN' : '中文'}
      </button>
      <div className="text-center space-y-2">
        <p className="text-6xl">✈️</p>
        <h1 className="text-2xl font-extrabold">TripSplit</h1>
        <p className="text-sm text-muted-foreground">
          {joining
            ? (zh ? '登录后就能加入朋友的旅行账本' : "Sign in to join your friend's trip")
            : (zh ? '旅行预算 · 拍照记账 · 自动分账' : 'Trip budget · snap receipts · split bills')}
        </p>
      </div>

      {sent ? (
        <div className="bg-card border border-border rounded-2xl p-5 text-center space-y-2">
          <Mail className="w-8 h-8 mx-auto text-primary" />
          <p className="font-bold">{zh ? '请查看邮箱' : 'Check your email'}</p>
          <p className="text-sm text-muted-foreground">
            {standalone
              ? (zh ? `已发送到 ${email}，请输入邮件里的验证码。` : `Sent to ${email}. Enter the code from the email.`)
              : (zh ? `已发送到 ${email}。点邮件里的链接，或输入邮件里的验证码。` : `Sent to ${email}. Tap the link, or enter the code from the email.`)}
          </p>
          <form onSubmit={verifyCode} className="space-y-2 pt-1">
            <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 10))}
              inputMode="numeric" autoComplete="one-time-code" placeholder={zh ? '验证码' : 'Code'}
              className={`${inputCls} text-center text-2xl font-bold tracking-[0.4em]`} />
            <Button type="submit" disabled={busy} className="w-full h-11">{busy ? '…' : (zh ? '用验证码登录' : 'Sign in with code')}</Button>
          </form>
          <button onClick={() => setSent(false)} className="text-xs text-primary font-semibold">{zh ? '换个邮箱' : 'Use another email'}</button>
        </div>
      ) : (
        <div className="space-y-3">
          {GOOGLE_ENABLED && <>
          <Button variant="secondary" onClick={google} className="w-full h-12 border border-border bg-card">
            <svg viewBox="0 0 24 24" className="w-5 h-5"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.77.43 3.45 1.18 4.94l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.6 10.6 0 0 0 12 1 11 11 0 0 0 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
            {zh ? '用 Google 登录' : 'Continue with Google'}
          </Button>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="flex-1 h-px bg-border" />{zh ? '或' : 'or'}<div className="flex-1 h-px bg-border" />
          </div>
          </>}
          <form onSubmit={sendLink} className="space-y-3">
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email"
              placeholder={zh ? '你的邮箱' : 'Your email'} className={inputCls} />
            <Button type="submit" disabled={busy} className="w-full h-12">
              {busy ? '…' : (zh ? '发送登录链接' : 'Email me a sign-in link')}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
