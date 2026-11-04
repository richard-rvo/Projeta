import { useContext, useEffect, useState } from 'react'
import { ArrowLeft, Search } from 'lucide-react'
import { AppContext } from '../../context/AppContext'
import ConfirmDialog from '../../components/ConfirmDialog'
import ViewBar, { ViewBarButton, ViewBarSpacer } from '../../components/shell/ViewBar'
import { cn } from '@/lib/utils'
import { useProjectMinutes } from './useProjectMinutes'
import MinuteEditor from './editor/MinuteEditor'
import MinuteHeader from './MinuteHeader'
import MinuteList from './MinuteList'
import NewMinuteMenu from './NewMinuteMenu'

const SAVE_LABEL = { pending: 'Salvando…', saving: 'Salvando…', saved: 'Salvo' }

function SaveIndicator({ status, onRetry }) {
  if (status === 'error') {
    return (
      <button type="button" onClick={onRetry} className="shrink-0 text-small font-medium text-sched-late">
        Erro ao salvar — tentar de novo
      </button>
    )
  }
  const label = SAVE_LABEL[status]
  return label ? (
    <span role="status" className="shrink-0 text-small text-text-3">{label}</span>
  ) : null
}

export default function PageMinutes() {
  const { state, showToast, openTaskInspector } = useContext(AppContext)
  const {
    minutes, setQuery, activeMinute, openMinute, createMinute,
    updateActiveMinute, removeMinute, retrySave, saveStatus, loading, error,
  } = useProjectMinutes(state.activeProjectId)

  const [search, setSearch] = useState('')
  const [showList, setShowList] = useState(true)
  const [toDelete, setToDelete] = useState(null)

  useEffect(() => {
    const id = setTimeout(() => setQuery(search), 300)
    return () => clearTimeout(id)
  }, [search, setQuery])

  const open = async (id) => {
    await openMinute(id)
    setShowList(false)
  }
  const create = async (templateId) => {
    if (await createMinute(templateId)) setShowList(false)
  }
  const confirmDelete = () => {
    removeMinute(toDelete.id)
    if (toDelete.id === activeMinute?.id) setShowList(true)
  }
  const createTaskSoon = () => showToast('Converter ação em tarefa chega na próxima versão.', 'info')

  const noMinutes = !minutes.length && !search && !activeMinute
  // Sem ata aberta, a lista é o único painel útil no celular.
  const listVisible = showList || !activeMinute
  const contentError = () =>
    showToast('Esta ata não pôde ser aberta para edição. Recarregue a página.', 'error')

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ViewBar>
        <div className="relative w-56 shrink-0">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-text-3" />
          <input
            type="search"
            aria-label="Buscar atas"
            placeholder="Buscar atas"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-full rounded-[var(--radius-control)] border border-line bg-surface-2 pl-8 pr-2 text-small text-text-1 outline-none placeholder:text-text-3 focus-visible:ring-2 focus-visible:ring-brand"
          />
        </div>
        <ViewBarSpacer />
        <SaveIndicator status={saveStatus} onRetry={retrySave} />
        <NewMinuteMenu onCreate={create} />
      </ViewBar>
      {error && <p role="alert" className="border-b border-line px-4 py-2 text-small text-sched-late">{error}</p>}

      {noMinutes && loading ? (
        <p role="status" className="p-6 text-small text-text-3">Carregando atas…</p>
      ) : noMinutes ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-title font-semibold text-text-1">Nenhuma ata neste projeto</p>
          <ViewBarButton variant="primary" onClick={() => create('status')}>Criar a primeira ata</ViewBarButton>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <aside className={cn('w-full flex-col border-r border-line bg-surface-1 md:flex md:w-[280px] md:shrink-0', listVisible ? 'flex' : 'hidden')}>
            <MinuteList minutes={minutes} activeId={activeMinute?.id} onOpen={open} onDelete={setToDelete} />
          </aside>
          <main className={cn('min-w-0 flex-1 overflow-y-auto md:block', listVisible ? 'hidden' : 'block')}>
            {activeMinute ? (
              <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
                <ViewBarButton icon={ArrowLeft} className="self-start md:hidden" onClick={() => setShowList(true)}>
                  Atas
                </ViewBarButton>
                <MinuteHeader minute={activeMinute} onChange={updateActiveMinute} />
                <MinuteEditor
                  key={activeMinute.id}
                  content={activeMinute.content}
                  onChange={(content) => updateActiveMinute({ content })}
                  onCreateTask={createTaskSoon}
                  onContentError={contentError}
                  onOpenTask={openTaskInspector}
                />
              </div>
            ) : (
              <p className="p-6 text-small text-text-3">Selecione uma ata para ler ou editar.</p>
            )}
          </main>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        title="Excluir ata"
        message={`A ata "${toDelete?.title || 'Sem título'}" será excluída. Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
      />
    </div>
  )
}
