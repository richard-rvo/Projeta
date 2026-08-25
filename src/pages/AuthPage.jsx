import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function AuthPage({ mode = 'login', onModeChange, onBack, signIn, signUp }) {
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const isSignup = mode === 'signup';

  const submit = async (event) => {
    event.preventDefault(); setError(''); setMessage('');
    if (form.password.length < 6) { setError('Use uma senha com pelo menos 6 caracteres.'); return; }
    setBusy(true);
    try {
      const result = isSignup ? await signUp(form.email.trim(), form.password, form.name.trim()) : await signIn(form.email.trim(), form.password);
      if (result?.error) throw result.error;
      if (isSignup && !result?.data?.session) setMessage('Conta criada. Confira seu e-mail para confirmar o acesso.');
    } catch (submitError) { setError(submitError?.message || 'Não foi possível concluir o acesso.'); } finally { setBusy(false); }
  };

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

          <p className="text-micro font-semibold uppercase tracking-[0.22em] text-brand">{isSignup ? 'Novo workspace' : 'Acesso seguro'}</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em]">{isSignup ? 'Crie sua conta' : 'Bem-vindo de volta'}</h2>
          <p className="mt-2 text-sm leading-6 text-text-2">{isSignup ? 'Seu primeiro workspace será criado automaticamente.' : 'Acesse seus projetos e continue de onde parou.'}</p>

          <form onSubmit={submit} className="mt-7 flex flex-col gap-4">
            {isSignup && (
              <label className="flex flex-col gap-1.5 text-xs text-text-2">
                Nome
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Seu nome" />
              </label>
            )}

            <label className="flex flex-col gap-1.5 text-xs text-text-2">
              E-mail
              <Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="voce@empresa.com" />
            </label>

            <label className="flex flex-col gap-1.5 text-xs text-text-2">
              Senha
              <div className="relative">
                <Input type={showPassword ? 'text' : 'password'} required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Mínimo de 6 caracteres" className="pr-10" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 flex items-center px-3 text-text-3 hover:text-text-1" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </label>

            {error && <p role="alert" className="rounded-[var(--radius-control)] border border-sched-late/30 bg-sched-late-soft px-3 py-2 text-xs text-sched-late">{error}</p>}
            {message && <p role="status" className="rounded-[var(--radius-control)] border border-brand/30 bg-brand-soft px-3 py-2 text-xs text-brand">{message}</p>}

            <Button type="submit" disabled={busy} className="mt-2 h-11">
              {busy ? 'Aguarde...' : isSignup ? 'Criar conta' : 'Entrar'}
              <ArrowRight data-icon="inline-end" />
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-text-3">
            {isSignup ? 'Já possui uma conta?' : 'Ainda não possui uma conta?'}{' '}
            <button type="button" onClick={() => { setError(''); setMessage(''); onModeChange(isSignup ? 'login' : 'signup'); }} className="font-medium text-brand hover:text-brand-hover">
              {isSignup ? 'Entrar' : 'Criar conta'}
            </button>
          </p>
        </section>
      </div>
    </main>
  );
}
