import { EMPTY_DOC } from './minuteDoc'

const heading = (text) => ({
  type: 'heading',
  attrs: { level: 2 },
  content: [{ type: 'text', text }],
})
const paragraph = () => ({ type: 'paragraph' })
const emptyAction = () => ({
  type: 'actionItem',
  attrs: { id: null, ownerName: '', dueDate: null, status: 'aberta', taskId: null },
})

const build = (titles) => ({
  type: 'doc',
  content: titles.flatMap((title) =>
    title === 'Ações' ? [heading(title), emptyAction()] : [heading(title), paragraph()],
  ),
})

export const MINUTE_TEMPLATES = [
  {
    id: 'status',
    label: 'Reunião de status',
    doc: build(['Pauta', 'Avanço desde a última reunião', 'Desvios e riscos', 'Decisões', 'Ações', 'Próxima reunião']),
  },
  {
    id: 'kickoff',
    label: 'Kickoff',
    doc: build(['Objetivo do projeto', 'Escopo', 'Marcos', 'Papéis e responsáveis', 'Riscos iniciais', 'Ações']),
  },
  {
    id: 'daily',
    label: 'Diária de campo',
    doc: build(['Segurança', 'Executado ontem', 'Programado hoje', 'Impedimentos', 'Ações']),
  },
  { id: 'blank', label: 'Em branco', doc: EMPTY_DOC },
]
