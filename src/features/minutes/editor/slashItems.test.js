// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { SLASH_ITEMS, filterSlashItems } from './slashItems'

const labels = (items) => items.map((item) => item.label)

describe('menu /', () => {
  it('lista os 11 blocos na ordem do plano com a busca vazia', () => {
    const expected = [
      'Texto',
      'Título 1',
      'Título 2',
      'Título 3',
      'Lista',
      'Lista numerada',
      'Checklist',
      'Citação',
      'Divisor',
      'Ação',
      'Decisão',
    ]
    expect(labels(SLASH_ITEMS)).toEqual(expected)
    expect(labels(filterSlashItems(''))).toEqual(expected)
    expect(labels(filterSlashItems('   '))).toEqual(expected)
  })

  it.each(['aç', 'ac', 'AÇÃO', 'acao', 'Ação'])('"%s" traz Ação em primeiro', (query) => {
    expect(filterSlashItems(query)[0].label).toBe('Ação')
  })

  it('compara sem acento e sem diferença de maiúsculas', () => {
    expect(labels(filterSlashItems('titulo'))).toEqual(['Título 1', 'Título 2', 'Título 3'])
    expect(labels(filterSlashItems('TÍTULO'))).toEqual(['Título 1', 'Título 2', 'Título 3'])
    expect(labels(filterSlashItems('decisao'))).toEqual(['Decisão'])
  })

  it('o início do rótulo vem antes de uma palavra do meio, que vem antes de um trecho', () => {
    // "numerada" é palavra do meio de "Lista numerada"; "ação" é trecho de "Citação".
    expect(labels(filterSlashItems('num'))).toEqual(['Lista numerada'])
    expect(labels(filterSlashItems('lista'))).toEqual(['Lista', 'Lista numerada'])
    expect(labels(filterSlashItems('ação'))).toEqual(['Ação', 'Citação'])
  })

  it('sem correspondência devolve lista vazia', () => {
    expect(filterSlashItems('xyz')).toEqual([])
  })
})
