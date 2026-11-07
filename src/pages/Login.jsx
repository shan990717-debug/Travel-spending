import React, { useState } from 'react';
import { Mail } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useLang } from '@/lib/i18n';
import { Button, inputCls } from '@/components/Shell';

// Google sign-in needs the Google provider switched on in Supabase first.
// Set VITE_ENABLE_GOOGLE=true in Vercel once it is, to show the button.
const GOOGLE_ENABLED = import.meta.env.VITE_ENABLE_GOOGLE === 'true';

// Supabase errors → friendly Chinese/English.
function explain(error, zh) {
  const m = (error?.message || '').toLowerCase();
  if (m.includes('invalid login credentials')) return zh ? '邮箱或密码不对' : 'Wrong email or password';
  if (m.includes('already registered')) return zh ? '这个邮箱已经注册过，请直接登录' : 'This email is already registered — please log in';
  if (m.includes('email not confirmed')) return zh ? '这个邮箱还没确认，请先到邮箱点确认链接' : 'Please confirm your email first';
  if (m.includes('rate limit')) return zh ? '邮件发送太频繁，请稍后再试（约 1 小时）' : 'Too many emails — try again later';
  if (m.includes('password should be')) return zh ? '密码至少 6 个字' : 'Password must be at least 6 characters';
  return error?.message || 'Error';
}

export default function Login() {
  const { zh, toggle } = useLang();
  // login | signup | link | forgot
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [sent, setSent] = useState(null); // 'link' | 'confirm' | 'reset'
  const [busy, setBusy] = useState(false);
  const joining = window.location.pathname.startsWith('/join/');
  // Come back to the same page (e.g. an invite link) after an email link.
  const redirectTo = window.location.href;

  const run = async (fn) => {
    if (!email.includes('@')) return toast.error(zh ? '请输入正确的邮箱' : 'Enter a valid email');
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };

  const login = (e) => { e.preventDefault(); run(async () => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) toast.error(explain(error, zh));
  }); };

  const signup = (e) => { e.preventDefault(); run(async () => {
    if (!name.trim()) return toast.error(zh ? '请输入你的名字' : 'Enter your name');
    if (password.length < 6) return toast.error(zh ? '密码至少 6 个字' : 'Password must be at least 6 characters');
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(), password,
      options: { data: { full_name: name.trim() }, emailRedirectTo: redirectTo },
    });
    if (error) return toast.error(explain(error, zh));
    if (!data.session) setSent('confirm'); // email confirmation is switched on in Supabase
  }); };

  const sendLink = (e) => { e.preventDefault(); run(async () => {
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirectTo } });
    if (error) return toast.error(explain(error, zh));
    setSent('link');
  }); };

  const forgot = (e) => { e.preventDefault(); run(async () => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
    if (error) return toast.error(explain(error, zh));
    setSent('reset');
  }); };

  const google = async () => {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
    if (error) toast.error(error.message);
  };

  const sentText = {
    link: zh ? `登录链接已发送到 ${email}，点链接即可登录。` : `We sent a sign-in link to ${email}.`,
    confirm: zh ? `已发送确认邮件到 ${email}，点邮件里的链接完成注册后再登录。` : `We sent a confirmation email to ${email}. Confirm, then log in.`,
    reset: zh ? `重设密码的链接已发送到 ${email}。点链接后会让你设定新密码。` : `We sent a password reset link to ${email}.`,
  };

  const Tab = ({ k, children }) => (
    <button type="button" onClick={() => setMode(k)}
      className={`py-2 rounded-lg text-sm font-bold ${mode === k ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>{children}</button>
  );

  return (
    <div className="min-h-screen max-w-md mx-auto px-6 flex flex-col justify-center gap-6 py-10">
      <button onClick={toggle} className="absolute top-4 right-4 text-xs font-semibold text-muted-foreground">
        {zh ? 'EN' : '中文'}
      </button>
      <div className="text-center space-y-2">
        <img src="/icon-192.png" alt="" className="w-16 h-16 mx-auto rounded-2xl shadow" />
        <h1 className="text-2xl font-extrabold">TripSplit</h1>
        <p className="text-sm text-muted-foreground">
          {joining
            ? (zh ? '登录或注册后就能加入朋友的旅行账本' : "Log in or sign up to join your friend's trip")
            : (zh ? '旅行预算 · 记账 · 自动分账' : 'Trip budget · expenses · split bills')}
        </p>
      </div>

      {sent ? (
        <div className="bg-card border border-border rounded-2xl p-5 text-center space-y-2">
          <Mail className="w-8 h-8 mx-auto text-primary" />
          <p className="font-bold">{zh ? '请查看邮箱' : 'Check your email'}</p>
          <p className="text-sm text-muted-foreground">{sentText[sent]}</p>
          <button onClick={() => { setSent(null); setMode('login'); }} className="text-xs text-primary font-semibold">{zh ? '返回登录' : 'Back to log in'}</button>
        </div>
      ) : (
        <div className="space-y-4">
          {(mode === 'login' || mode === 'signup') && (
            <div className="grid grid-cols-2 gap-1 p-1 bg-secondary rounded-xl">
              <Tab k="login">{zh ? '登录' : 'Log in'}</Tab>
              <Tab k="signup">{zh ? '注册' : 'Sign up'}</Tab>
            </div>
          )}

          {mode === 'login' && (
            <form onSubmit={login} className="space-y-3">
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" placeholder={zh ? '邮箱' : 'Email'} className={inputCls} />
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" placeholder={zh ? '密码' : 'Password'} className={inputCls} />
              <Button type="submit" disabled={busy} className="w-full h-12">{busy ? '…' : (zh ? '登录' : 'Log in')}</Button>
              <div className="flex justify-between text-xs font-semibold">
                <button type="button" onClick={() => setMode('forgot')} className="text-muted-foreground">{zh ? '忘记密码 / 还没设密码？' : 'Forgot or no password?'}</button>
                <button type="button" onClick={() => setMode('link')} className="text-primary">{zh ? '用邮件链接登录' : 'Email me a link'}</button>
              </div>
            </form>
          )}

          {mode === 'signup' && (
            <form onSubmit={signup} className="space-y-3">
              <input value={name} onChange={e => setName(e.target.value)} autoComplete="name" placeholder={zh ? '你的名字（朋友会看到）' : 'Your name (friends see this)'} className={inputCls} />
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" placeholder={zh ? '邮箱' : 'Email'} className={inputCls} />
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" placeholder={zh ? '设一个密码（至少 6 个字）' : 'Choose a password (6+ characters)'} className={inputCls} />
              <Button type="submit" disabled={busy} className="w-full h-12">{busy ? '…' : (zh ? '注册并登录' : 'Sign up')}</Button>
            </form>
          )}

          {(mode === 'link' || mode === 'forgot') && (
            <form onSubmit={mode === 'link' ? sendLink : forgot} className="space-y-3">
              <p className="text-sm font-bold">{mode === 'link' ? (zh ? '用邮件链接登录' : 'Sign in with an email link') : (zh ? '设定 / 重设密码' : 'Set or reset password')}</p>
              <p className="text-xs text-muted-foreground">
                {mode === 'link'
                  ? (zh ? '会寄一个登录链接到你的邮箱。注意：加到主屏幕的 app 请用密码登录。' : 'We email you a sign-in link. In the home-screen app, use your password instead.')
                  : (zh ? '会寄一个链接到你的邮箱，点开后设定新密码。之前用邮件链接登录、还没有密码的人也用这个。' : "We'll email a link to set a new password — also for accounts that never had one.")}
              </p>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" placeholder={zh ? '邮箱' : 'Email'} className={inputCls} />
              <Button type="submit" disabled={busy} className="w-full h-12">{busy ? '…' : (zh ? '发送邮件' : 'Send email')}</Button>
              <button type="button" onClick={() => setMode('login')} className="w-full text-xs font-semibold text-muted-foreground">{zh ? '← 返回密码登录' : '← Back'}</button>
            </form>
          )}

          {GOOGLE_ENABLED && (
            <Button variant="secondary" onClick={google} className="w-full h-12 border border-border bg-card">
              {zh ? '用 Google 登录' : 'Continue with Google'}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
