// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import AnomalyBoard from './AnomalyBoard'

const formProps = vi.fn()
vi.mock('./AnomalyForm', () => ({
  default: (props) => { formProps(props); return null },
}))

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
})

let root, container
afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  formProps.mockClear()
})

const tasks = [
  { id: 't1', projectId: 'p1', name: 'Tarefa P1' },
  { id: 't2', projectId: 'p2', name: 'Tarefa P2' },
]
const anomalies = [
  { id: 'a1', projectId: 'p1', title: 'Vazamento', status: 'aberta', severity: 'alta', photos: [] },
  { id: 'a2', projectId: 'p2', title: 'Trinca', status: 'aberta', severity: 'baixa', photos: [] },
]

function mount(props) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(
    <AnomalyBoard anomalies={anomalies} tasks={tasks} projects={[]} onUpdate={vi.fn()} onDelete={vi.fn()} {...props} />,
  ))
}

const button = (pred) => [...container.querySelectorAll('button')].find(pred)
const lastFormTasks = () => formProps.mock.calls.at(-1)[0].tasks

describe('AnomalyBoard: tarefas oferecidas no formulário', () => {
  it('na central global, editar uma anomalia oferece só as tarefas do projeto dela', () => {
    mount({ showProject: true, canCreate: false })
    act(() => button((b) => b.textContent.includes('Trinca')).click())
    act(() => button((b) => b.title === 'Editar').click())
    expect(formProps.mock.calls.at(-1)[0].open).toBe(true)
    expect(lastFormTasks().map((t) => t.id)).toEqual(['t2'])
  })

  it('ao registrar na tela do projeto (sem projectId no rascunho), mantém a lista recebida', () => {
    mount({ tasks: [tasks[0]], onCreate: vi.fn() })
    act(() => button((b) => b.textContent.includes('Registrar')).click())
    expect(lastFormTasks().map((t) => t.id)).toEqual(['t1'])
  })
})
