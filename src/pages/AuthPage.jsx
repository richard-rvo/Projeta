import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { validatePassword } from '@/utils/password';

const FORGOT_MESSAGE = 'Se houver uma conta com este e-mail, enviamos um link para redefinir a senha.';

export default function AuthPage({ mode = 'login', onModeChange, onBack, signIn, signUp, requestPasswordReset, updatePassword }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const isSignup = mode === 'signup';
  const isForgot = mode === 'forgot';
  const isReset = mode === 'reset';

  const submit = async (event) => {
    event.preventDefault(); setError(''); setMessage('');
    if (isForgot) {
      setBusy(true);
      try {
        await requestPasswordReset(form.email.trim());
        // Mensagem neutra: não revela se a conta existe, mesmo se o Supabase devolver erro.
        setMessage(FORGOT_MESSAGE);
      } catch (submitError) { setError(submitError?.message || 'Não foi possível enviar o link agora. Tente novamente.'); } finally { setBusy(false); }
      return;
    }
    if (isSignup || isReset) {
      const passwordError = validatePassword(form.password);
      if (passwordError) { setError(passwordError); return; }
    }
    if (isReset && form.password !== form.confirm) { setError('As senhas não conferem.'); return; }
    setBusy(true);
    try {
      if (isReset) {
        const result = await updatePassword(form.password);
        if (result?.error) throw result.error;
        return;
      }
      const result = isSignup ? await signUp(form.email.trim(), form.password, form.name.trim()) : await signIn(form.email.trim(), form.password);
      if (result?.error) throw result.error;
      if (isSignup && !result?.data?.session) setMessage('Conta criada. Confira seu e-mail para confirmar o acesso.');
    } catch (submitError) { setError(submitError?.message || 'Não foi possível concluir o acesso.'); } finally { setBusy(false); }
  };

  const goTo = (next) => { setError(''); setMessage(''); onModeChange(next); };

  return (
    <main className="min-h-screen bg-surface-0 text-text-1">
      <div className="mx-auto grid min-h-screen max-w-6xl items-center gap-12 px-6 py-10 lg:grid-cols-[1fr_420px] lg:px-10">
        <section className="hidden max-w-lg lg:block">
          <button type="button" onClick={onBack} className="mb-16 flex items-center gap-2 text-sm text-text-3 transition hover:text-text-1">
            <ArrowLeft />
            Voltar para a página inicial
          </button>
          <p className="text-micro font-semibold uppercase tracking-[0.25em] text-brand">PROJETA / ACCESS</p>
          <h1 className="mt-5 text-6xl font-semibold leading-[0.95] tracking-[-0.05em]">Seu cronograma merece uma fonte única.</h1>
          <p className="mt-7 max-w-md text-base leading-7 text-text-2">Entre no workspace para organizar projetos, calendário e equipe em uma única visão operacional.</p>
        </section>

        <section className="rounded-[18px] border border-line-strong bg-surface-1 p-6 shadow-elev-4 sm:p-8">
          <div className="mb-8 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src="/logo-premium.svg" alt="Projeta" className="size-9 rounded-[10px] object-cover" />
              <span className="text-xs font-semibold tracking-[0.18em]">PROJETA</span>
            </div>
            <button type="button" onClick={onBack} className="text-text-3 hover:text-text-1 lg:hidden" aria-label="Voltar">
              <ArrowLeft />
            </button>
          </div>

          <p className="text-micro font-semibold uppercase tracking-[0.22em] text-brand">{isSignup ? 'Novo workspace' : isForgot || isReset ? 'Recuperação de acesso' : 'Acesso seguro'}</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em]">{isSignup ? 'Crie sua conta' : isForgot ? 'Esqueci minha senha' : isReset ? 'Nova senha' : 'Bem-vindo de volta'}</h2>
          <p className="mt-2 text-sm leading-6 text-text-2">{isSignup ? 'Seu primeiro workspace será criado automaticamente.' : isForgot ? 'Informe seu e-mail para receber um link de redefinição.' : isReset ? 'Escolha uma nova senha para acessar sua conta.' : 'Acesse seus projetos e continue de onde parou.'}</p>

          <form onSubmit={submit} className="mt-7 flex flex-col gap-4">
            {isSignup && (
              <label className="flex flex-col gap-1.5 text-xs text-text-2">
                Nome
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Seu nome" />
              </label>
            )}

            {!isReset && (
            <label className="flex flex-col gap-1.5 text-xs text-text-2">
              E-mail
              <Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="voce@empresa.com" />
            </label>
            )}

            {!isForgot && (
            <label className="flex flex-col gap-1.5 text-xs text-text-2">
              {isReset ? 'Nova senha' : 'Senha'}
              <div className="relative">
                <Input type={showPassword ? 'text' : 'password'} required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={isSignup || isReset ? 'Mínimo de 10 caracteres, com letras e números' : 'Sua senha'} className="pr-10" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 flex items-center px-3 text-text-3 hover:text-text-1" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </label>
            )}

            {!isSignup && !isForgot && !isReset && (
              <button type="button" onClick={() => goTo('forgot')} className="-mt-2 self-start text-xs font-medium text-brand hover:text-brand-hover">
                Esqueci minha senha
              </button>
            )}

            {isReset && (
              <label className="flex flex-col gap-1.5 text-xs text-text-2">
                Confirmar senha
                <Input type={showPassword ? 'text' : 'password'} required value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} placeholder="Repita a nova senha" />
              </label>
            )}

            {error && <p role="alert" className="rounded-[var(--radius-control)] border border-sched-late/30 bg-sched-late-soft px-3 py-2 text-xs text-sched-late">{error}</p>}
            {message && <p role="status" className="rounded-[var(--radius-control)] border border-brand/30 bg-brand-soft px-3 py-2 text-xs text-brand">{message}</p>}

            <Button type="submit" disabled={busy} className="mt-2 h-11">
              {busy ? 'Aguarde...' : isSignup ? 'Criar conta' : isForgot ? 'Enviar link' : isReset ? 'Salvar nova senha' : 'Entrar'}
              <ArrowRight data-icon="inline-end" />
            </Button>
          </form>

          {!isReset && (
            <p className="mt-6 text-center text-xs text-text-3">
              {isForgot ? 'Lembrou a senha?' : isSignup ? 'Já possui uma conta?' : 'Ainda não possui uma conta?'}{' '}
              <button type="button" onClick={() => goTo(isSignup || isForgot ? 'login' : 'signup')} className="font-medium text-brand hover:text-brand-hover">
                {isSignup || isForgot ? 'Entrar' : 'Criar conta'}
              </button>
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
