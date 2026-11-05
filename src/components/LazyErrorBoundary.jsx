import React from 'react';
import { Button } from '@/components/ui/button';

/**
 * Envolve views carregadas sob demanda. Se o pedaço do app não baixar (deploy
 * novo trocou os arquivos, rede caiu), mostra o aviso e Recarregar em vez de
 * derrubar a árvore inteira em tela branca.
 */
export default class LazyErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const reload = this.props.onReload || (() => window.location.reload());
    return (
      <div role="alert" className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-body text-text-1">Não foi possível carregar esta parte do app. Recarregue a página.</p>
        <Button type="button" onClick={reload}>Recarregar</Button>
      </div>
    );
  }
}
