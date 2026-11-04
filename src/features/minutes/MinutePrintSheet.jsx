import { ArrowLeft, Printer } from 'lucide-react'
import ViewBar, { ViewBarButton, ViewBarSpacer } from '../../components/shell/ViewBar'
import { formatDateLong, today } from '../../utils/schedule'
import MinuteEditor from './editor/MinuteEditor'
import { extractActions } from './minuteDoc'

const STATUS_LABEL = { aberta: 'Aberta', 'concluída': 'Concluída' }
const TH = 'border-b border-[#bbb] px-2 py-1 text-left text-[9px] font-bold uppercase tracking-wide text-[#666]'
const TD = 'border-b border-[#ddd] px-2 py-1.5 align-top text-[11px]'

/** Folha A4 da ata: cabeçalho, corpo somente leitura, tabela de ações e rodapé. */
export default function MinutePrintSheet({ minute, projectName }) {
  const actions = extractActions(minute.content)
  const date = (minute.meetingAt || '').slice(0, 10)
  return (
    <article className="print-report minute-print mx-auto w-[210mm] max-w-full bg-white p-[14mm] text-[#111] shadow-elev-3">
      <header className="mb-6 border-b-2 border-[#111] pb-4">
        <div className="mb-3 flex items-center gap-3">
          <img src="/logo-premium.svg" alt="" className="h-11 w-11 object-contain" />
          <div>
            <div className="text-[15px] font-bold tracking-tight">PROJETA</div>
            <div className="text-[13px] text-[#555]">{projectName}</div>
          </div>
        </div>
        <h1 className="text-[19px] font-bold leading-tight">{minute.title || 'Sem título'}</h1>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px]">
          <dt className="font-bold text-[#666]">Data</dt>
          <dd>{formatDateLong(date)}</dd>
          {minute.location && (<><dt className="font-bold text-[#666]">Local</dt><dd>{minute.location}</dd></>)}
          {minute.participants && (
            <><dt className="font-bold text-[#666]">Participantes</dt><dd className="whitespace-pre-line">{minute.participants}</dd></>
          )}
        </dl>
      </header>

      <MinuteEditor content={minute.content} editable={false} />

      <section className="minute-print-actions mt-8">
        <h2 className="mb-2 text-[13px] font-bold">Ações</h2>
        {actions.length ? (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={TH}>Descrição</th>
                <th className={TH}>Responsável</th>
                <th className={TH}>Prazo</th>
                <th className={TH}>Status</th>
              </tr>
            </thead>
            <tbody>
              {actions.map((a, i) => (
                <tr key={a.id ?? i}>
                  <td className={TD}>{a.description || '—'}</td>
                  <td className={TD}>{a.ownerName || '—'}</td>
                  <td className={TD}>{a.dueDate ? formatDateLong(a.dueDate) : '—'}</td>
                  <td className={TD}>{STATUS_LABEL[a.status] || a.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-[11px] text-[#666]">Nenhuma ação registrada.</p>
        )}
      </section>

      <footer className="mt-8 border-t border-[#ddd] pt-2 text-[9px] text-[#888]">
        Projeta · {projectName} · gerado em {formatDateLong(today())}
      </footer>
    </article>
  )
}

/** Pré-visualização: a folha sobre a mesa recuada, com o chrome que não imprime. */
export function MinutePrintPreview({ minute, projectName, onBack }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ViewBar className="no-print">
        <ViewBarButton icon={ArrowLeft} onClick={onBack}>Voltar à edição</ViewBarButton>
        <ViewBarSpacer />
        <ViewBarButton icon={Printer} variant="primary" onClick={() => window.print()}>
          Imprimir / PDF
        </ViewBarButton>
      </ViewBar>
      <div className="min-h-0 flex-1 overflow-auto bg-surface-inset p-6">
        <MinutePrintSheet minute={minute} projectName={projectName} />
      </div>
    </div>
  )
}
