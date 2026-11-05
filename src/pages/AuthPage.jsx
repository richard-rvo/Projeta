import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { validatePassword } from '@/utils/password';
import { authErrorMessage, isTransientAuthError } from '@/utils/authErrors';

const FORGOT_MESSAGE = 'Se houver uma conta com este e-mail, enviamos um link para redefinir a senha.';

export default function AuthPage({ mode = 'login', notice = '', onModeChange, onBack, signIn, requestPasswordReset, updatePassword }) {
  const [form, setForm] = useState({ email: '', password: '', confirm: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(notice || '');
  const isForgot = mode === 'forgot';
  const isInvite = mode === 'invite';
  const isReset = mode === 'reset' || isInvite;

  const submit = async (event) => {
    event.preventDefault(); setError(''); setMessage('');
    if (isForgot) {
      setBusy(true);
      try {
        const result = await requestPasswordReset(form.email.trim());
        // Mensagem neutra: não revela se a conta existe. Só falhas de rede, limite ou servidor viram erro.
        if (isTransientAuthError(result?.error)) setError(authErrorMessage(result.error));
        else setMessage(FORGOT_MESSAGE);
      } catch (submitError) { setError(authErrorMessage(submitError)); } finally { setBusy(false); }
      return;
    }
    if (isReset) {
      const passwordError = validatePassword(form.password);
      if (passwordError) { setError(passwordError); return; }
    }
    if (isReset && form.password !== form.confirm) { setError('As senhas não conferem.'); return; }
    setBusy(true);
    try {
      if (isReset) {
        const result = await updatePassword(form.password);
        if (result?.error) setError(authErrorMessage(result.error));
        return;
      }
      const result = await signIn(form.email.trim(), form.password);
      if (result?.error) throw result.error;
    } catch (submitError) { setError(authErrorMessage(submitError)); } finally { setBusy(false); }
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

          <p className="text-micro font-semibold uppercase tracking-[0.22em] text-brand">{isInvite ? 'Convite aceito' : isForgot || isReset ? 'Recuperação de acesso' : 'Acesso seguro'}</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em]">{isInvite ? 'Bem-vindo ao Projeta — defina sua senha' : isForgot ? 'Esqueci minha senha' : isReset ? 'Nova senha' : 'Bem-vindo de volta'}</h2>
          <p className="mt-2 text-sm leading-6 text-text-2">{isInvite ? 'Escolha a senha que você usará para entrar no Projeta.' : isForgot ? 'Informe seu e-mail para receber um link de redefinição.' : isReset ? 'Escolha uma nova senha para acessar sua conta.' : 'Acesse seus projetos e continue de onde parou.'}</p>

          <form onSubmit={submit} className="mt-7 flex flex-col gap-4">
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
                <Input type={showPassword ? 'text' : 'password'} required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={isReset ? 'Mínimo de 10 caracteres, com letras e números' : 'Sua senha'} className="pr-10" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 flex items-center px-3 text-text-3 hover:text-text-1" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </label>
            )}

            {!isForgot && !isReset && (
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
              {busy ? 'Aguarde...' : isForgot ? 'Enviar link' : isInvite ? 'Definir senha e entrar' : isReset ? 'Salvar nova senha' : 'Entrar'}
              <ArrowRight data-icon="inline-end" />
            </Button>
          </form>

          {!isReset && (
            <p className="mt-6 text-center text-xs text-text-3">
              {isForgot ? (
                <>Lembrou a senha?{' '}<button type="button" onClick={() => goTo('login')} className="font-medium text-brand hover:text-brand-hover">Entrar</button></>
              ) : 'O acesso ao Projeta é feito por convite.'}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
