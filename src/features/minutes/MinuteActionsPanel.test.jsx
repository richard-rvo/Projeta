// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { createTaskFromAction } from './MinuteActionsPanel'

const project = { id: 'p1', name: 'Obra', calendars: [] }

describe('createTaskFromAction', () => {
  it('corta o nome da tarefa em 500 caracteres (a ação aceita até 1000)', () => {
    const task = createTaskFromAction(project, { description: 'a'.repeat(900), dueDate: null }, 0)
    expect(task.name).toBe('a'.repeat(500))
  })

  it('mantém descrições curtas como estão', () => {
    expect(createTaskFromAction(project, { description: 'Comprar flanges', dueDate: null }, 0).name).toBe('Comprar flanges')
  })
})
