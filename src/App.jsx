import React, { useContext, useState } from 'react';
import { AppContext } from './context/AppContext';
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts';
import AppRail from './components/shell/AppRail';
import TopBar from './components/shell/TopBar';
import Toast from './components/Toast';
import TaskInspectorDrawer from './components/TaskInspectorDrawer';
import CommandPalette from './components/CommandPalette';
import ProjectWorkspace from './components/ProjectWorkspace';
import PagePortfolio from './pages/PagePortfolio';
import PageAnomalies from './pages/PageAnomalies';
import PageReports from './pages/PageReports';
import PageSettings from './pages/PageSettings';
import PublicLanding from './pages/PublicLanding';
import AuthPage from './pages/AuthPage';
import WorkspaceLoadError from './components/shell/WorkspaceLoadError';
import AccessRevoked from './components/shell/AccessRevoked';

/**
 * Contêiner de rolagem para views que são documentos, não superfícies.
 * O Gantt NÃO usa isto: ele preenche a altura e rola por dentro.
 */
export function PageScroll({ children }) {
  return <div className="h-full overflow-auto p-5">{children}</div>;
}

function App() {
  const { state, signIn, requestPasswordReset, updatePassword, retryLoad, signOut } = useContext(AppContext);
  const [authMode, setAuthMode] = useState('landing');
  useGlobalShortcuts();

  if (state.auth.status === 'loading') {
    return <div className="grid min-h-screen place-items-center bg-surface-0 text-sm text-text-2">Carregando workspace...</div>;
  }

  // Falha ao carregar não é "deslogado": mostra o erro em vez da página pública.
  if (state.auth.status === 'error' && state.auth.errorCode === 'access_revoked') {
    return (
      <>
        <AccessRevoked message={state.auth.error} onSignOut={signOut} />
        <Toast />
      </>
    );
  }
  if (state.auth.status === 'error') {
    return (
      <>
        <WorkspaceLoadError message={state.auth.error} onRetry={retryLoad} onSignOut={signOut} />
        <Toast />
      </>
    );
  }

  if (state.auth.user && state.auth.recovery) {
    return <AuthPage mode="reset" updatePassword={updatePassword} />;
  }

  if (state.auth.user && state.auth.mustSetPassword) {
    return <AuthPage mode="invite" updatePassword={updatePassword} />;
  }

  if (!state.auth.user) {
    return authMode === 'landing'
      ? <PublicLanding onStart={() => setAuthMode('login')} />
      : <AuthPage mode={authMode} onModeChange={setAuthMode} onBack={() => setAuthMode('landing')} signIn={signIn} requestPasswordReset={requestPasswordReset} />;
  }

  const renderPage = () => {
    switch (state.activePage) {
      case 'pageProjectWorkspace':
        return <ProjectWorkspace />;
      case 'pageAnomalies':
        return <PageAnomalies />;
      case 'pageReports':
        return <PageScroll><PageReports /></PageScroll>;
      case 'pageSettings':
        return <PageScroll><PageSettings /></PageScroll>;
      case 'pagePortfolio':
      default:
        return <PagePortfolio />;
    }
  };

  return (
    <div className="flex h-full overflow-hidden bg-surface-0">
      <AppRail />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="min-h-0 flex-1 overflow-hidden">{renderPage()}</main>
      </div>
      <TaskInspectorDrawer />
      <CommandPalette />
      <Toast />
    </div>
  );
}

export default App;
