import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Tela cheia quando o workspace não carrega: em vez da página pública, o erro e o que fazer. */
export default function WorkspaceLoadError({ message, onRetry, onSignOut }) {
  return (
    <main className="grid min-h-screen place-items-center bg-surface-0 p-6 text-text-1">
      <section role="alert" className="flex max-w-sm flex-col items-center gap-3 text-center">
        <AlertTriangle size={32} strokeWidth={1.6} className="text-sched-late" />
        <h1 className="text-title font-semibold">Não foi possível carregar o workspace</h1>
        <p className="text-small text-text-2">{message || 'Falha ao carregar o workspace.'}</p>
        <div className="mt-2 flex gap-2">
          <Button type="button" onClick={onRetry}>Tentar de novo</Button>
          <Button type="button" variant="outline" onClick={onSignOut}>Sair</Button>
        </div>
      </section>
    </main>
  );
}
