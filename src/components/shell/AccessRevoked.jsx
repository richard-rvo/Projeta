import React from 'react';
import { ShieldOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Tela cheia para o usuário cujo acesso foi revogado: só resta sair. */
export default function AccessRevoked({ message, onSignOut }) {
  return (
    <main className="grid min-h-screen place-items-center bg-surface-0 p-6 text-text-1">
      <section role="alert" className="flex max-w-sm flex-col items-center gap-3 text-center">
        <ShieldOff size={32} strokeWidth={1.6} className="text-sched-late" />
        <h1 className="text-title font-semibold">Acesso revogado</h1>
        <p className="text-small text-text-2">{message || 'Seu acesso ao Projeta foi revogado. Fale com o administrador.'}</p>
        <Button type="button" variant="outline" className="mt-2" onClick={onSignOut}>Sair</Button>
      </section>
    </main>
  );
}
