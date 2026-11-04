import { describe, it, expect, vi, afterEach } from 'vitest'
import { createAutosaver } from './autosaver'

afterEach(() => vi.useRealTimers())

describe('autosaver', () => {
  it('agrupa digitação em um só save', async () => {
    vi.useFakeTimers()
    const save = vi.fn().mockResolvedValue()
    const a = createAutosaver({ save, onStatus: () => {} })
    a.schedule('a')
    vi.advanceTimersByTime(500)
    a.schedule('b')
    vi.advanceTimersByTime(500)
    a.schedule('c')
    await vi.advanceTimersByTimeAsync(1200)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith('c')
  })

  it('flush salva o pendente na hora', async () => {
    vi.useFakeTimers()
    const save = vi.fn().mockResolvedValue()
    const a = createAutosaver({ save, onStatus: () => {} })
    a.schedule('v')
    await a.flush()
    expect(save).toHaveBeenCalledWith('v')
  })

  it('informa erro e mantém o valor pendente', async () => {
    vi.useFakeTimers()
    const save = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue()
    const onStatus = vi.fn()
    const a = createAutosaver({ save, onStatus })
    a.schedule('v')
    await a.flush()
    expect(onStatus).toHaveBeenCalledWith('error')
    await a.flush()
    expect(save).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenLastCalledWith('v')
    expect(onStatus).toHaveBeenLastCalledWith('saved')
  })

  it('dispose cancela o timer', async () => {
    vi.useFakeTimers()
    const save = vi.fn().mockResolvedValue()
    const a = createAutosaver({ save, onStatus: () => {} })
    a.schedule('v')
    a.dispose()
    await vi.advanceTimersByTimeAsync(2000)
    expect(save).not.toHaveBeenCalled()
  })
})

describe('autosaver (flush confiável)', () => {
  it('flush só resolve depois do save do valor mais novo', async () => {
    vi.useFakeTimers()
    const resolvers = []
    const save = vi.fn(() => new Promise((r) => resolvers.push(r)))
    const a = createAutosaver({ save, onStatus: () => {} })
    a.schedule('v1')
    await vi.advanceTimersByTimeAsync(1200)
    expect(save).toHaveBeenCalledWith('v1')
    a.schedule('v2')
    let done = false
    const p = a.flush().then(() => { done = true })
    resolvers[0]()
    await vi.advanceTimersByTimeAsync(0)
    expect(save).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenLastCalledWith('v2')
    expect(done).toBe(false)
    resolvers[1]()
    await p
    expect(done).toBe(true)
  })

  it('flush após save em andamento que falha termina com status error', async () => {
    vi.useFakeTimers()
    let reject
    const save = vi.fn(() => new Promise((_, rej) => { reject = rej }))
    const onStatus = vi.fn()
    const a = createAutosaver({ save, onStatus })
    a.schedule('v')
    await vi.advanceTimersByTimeAsync(1200)
    const p = a.flush()
    reject(new Error('x'))
    await p
    expect(onStatus).toHaveBeenLastCalledWith('error')
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('discard após falha impede novo save', async () => {
    vi.useFakeTimers()
    const save = vi.fn().mockRejectedValue(new Error('x'))
    const a = createAutosaver({ save, onStatus: () => {} })
    a.schedule('v')
    await a.flush()
    a.discard()
    await a.flush()
    expect(save).toHaveBeenCalledTimes(1)
  })
})
