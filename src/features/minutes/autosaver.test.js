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
