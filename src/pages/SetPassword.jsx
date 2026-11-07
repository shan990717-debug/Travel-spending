import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useLang } from '@/lib/i18n';
import Shell, { Field, inputCls, Button } from '@/components/Shell';

// Set or change the password of the signed-in account (also shown after a
// reset-password email link).
export default function SetPassword() {
  const { user, clearRecovery } = useAuth();
  const { zh } = useLang();
  const navigate = useNavigate();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    if (pw.length < 6) return toast.error(zh ? '密码至少 6 个字' : 'At least 6 characters');
    if (pw !== pw2) return toast.error(zh ? '两次输入的密码不一样' : "Passwords don't match");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(zh ? '密码已设定，以后可以用邮箱 + 密码登录' : 'Password saved');
    clearRecovery();
    navigate('/', { replace: true });
  };

  return (
    <Shell title={zh ? '设定密码' : 'Set password'} subtitle={user?.email} back="/">
      <form onSubmit={save} className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {zh ? '设定后，在手机主屏幕的 app 里用「邮箱 + 密码」登录就可以了。' : 'Then log in with email + password in the home-screen app.'}
        </p>
        <Field label={zh ? '新密码（至少 6 个字）' : 'New password (6+ characters)'}>
          <input type="password" value={pw} onChange={e => setPw(e.target.value)} autoComplete="new-password" className={inputCls} />
        </Field>
        <Field label={zh ? '再输入一次' : 'Repeat password'}>
          <input type="password" value={pw2} onChange={e => setPw2(e.target.value)} autoComplete="new-password" className={inputCls} />
        </Field>
        <Button type="submit" disabled={busy} className="w-full h-12">{busy ? '…' : (zh ? '保存密码' : 'Save password')}</Button>
      </form>
    </Shell>
  );
}
