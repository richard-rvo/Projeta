// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createAutosaver } from './autosaver'

// O registro é estado de módulo: cada teste usa uma instância nova.
let registry
beforeEach(async () => {
  vi.useFakeTimers()
  vi.resetModules()
  registry = await import('./pendingSaves')
})
afterEach(() => vi.useRealTimers())

const failing = () => vi.fn().mockRejectedValue(new Error('offline'))
const autosaverWith = (save) => createAutosaver({ save, onStatus: () => {} })

function beforeUnloadPrevented() {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event.defaultPrevented
}

describe('pendingSaves', () => {
  it('desmontar com tudo salvo grava, descarta o autosaver e esvazia o registro', async () => {
    const save = vi.fn().mockResolvedValue()
    const a = autosaverWith(save)
    const release = registry.registerMinuteAutosaver(a)
    a.schedule('v')
    release()
    await vi.advanceTimersByTimeAsync(0)
    expect(save).toHaveBeenCalledWith('v')
    expect(registry.hasPendingMinuteSaves()).toBe(false)
    a.schedule('depois do dispose')
    await vi.advanceTimersByTimeAsync(5000)
    expect(save).toHaveBeenCalledTimes(1)
    expect(beforeUnloadPrevented()).toBe(false)
  })

  it('save que falha no desmonte continua tentando em 2s, 5s, 15s, 30s e depois a cada 60s, até salvar', async () => {
    const save = failing()
    const a = autosaverWith(save)
    const release = registry.registerMinuteAutosaver(a)
    a.schedule('texto')
    release()
    await vi.advanceTimersByTimeAsync(0)
    expect(save).toHaveBeenCalledTimes(1) // flush do desmonte
    expect(registry.hasPendingMinuteSaves()).toBe(true)

    const expectAfter = async (ms, calls) => {
      await vi.advanceTimersByTimeAsync(ms - 1)
      expect(save).toHaveBeenCalledTimes(calls - 1)
      await vi.advanceTimersByTimeAsync(1)
      expect(save).toHaveBeenCalledTimes(calls)
    }
    await expectAfter(2000, 2)
    await expectAfter(5000, 3)
    await expectAfter(15000, 4)
    await expectAfter(30000, 5)
    await expectAfter(60000, 6)
    await expectAfter(60000, 7)
    expect(save).toHaveBeenLastCalledWith('texto')

    save.mockResolvedValue()
    await expectAfter(60000, 8)
    expect(registry.hasPendingMinuteSaves()).toBe(false)
    await vi.advanceTimersByTimeAsync(10 * 60000)
    expect(save).toHaveBeenCalledTimes(8)
  })

  it('flushAllMinuteSaves grava os montados na hora e devolve false enquanto algo falha', async () => {
    const mountedSave = vi.fn().mockResolvedValue()
    const mounted = autosaverWith(mountedSave)
    registry.registerMinuteAutosaver(mounted)
    mounted.schedule('digitando')

    const orphanSave = failing()
    const orphan = autosaverWith(orphanSave)
    const release = registry.registerMinuteAutosaver(orphan)
    orphan.schedule('perdido?')
    release()
    await vi.advanceTimersByTimeAsync(0)

    let result
    registry.flushAllMinuteSaves().then((r) => { result = r })
    await vi.advanceTimersByTimeAsync(0)
    expect(mountedSave).toHaveBeenCalledWith('digitando')
    expect(orphanSave).toHaveBeenCalledTimes(2)
    expect(result).toBe(false)

    orphanSave.mockResolvedValue()
    registry.flushAllMinuteSaves().then((r) => { result = r })
    await vi.advanceTimersByTimeAsync(0)
    expect(result).toBe(true)
    expect(orphanSave).toHaveBeenCalledTimes(3)
    expect(registry.hasPendingMinuteSaves()).toBe(false)
    // O órfão saiu do registro: o retry agendado não roda mais.
    await vi.advanceTimersByTimeAsync(120000)
    expect(orphanSave).toHaveBeenCalledTimes(3)
  })

  it('flushAll falho durante a espera não duplica o retry agendado', async () => {
    const save = failing()
    const a = autosaverWith(save)
    const release = registry.registerMinuteAutosaver(a)
    a.schedule('v')
    release()
    await vi.advanceTimersByTimeAsync(1000)
    expect(await registry.flushAllMinuteSaves()).toBe(false)
    expect(save).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1000) // 2s desde o desmonte
    expect(save).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(4999)
    expect(save).toHaveBeenCalledTimes(3)
    save.mockResolvedValue()
    await vi.advanceTimersByTimeAsync(1)
    expect(save).toHaveBeenCalledTimes(4)
    expect(registry.hasPendingMinuteSaves()).toBe(false)
  })

  it('avisa antes de fechar a aba só enquanto há texto não salvo', async () => {
    const save = failing()
    const a = autosaverWith(save)
    const release = registry.registerMinuteAutosaver(a)
    expect(beforeUnloadPrevented()).toBe(false) // montado e sem pendência
    a.schedule('v')
    release()
    await vi.advanceTimersByTimeAsync(0)
    expect(beforeUnloadPrevented()).toBe(true)
    save.mockResolvedValue()
    await vi.advanceTimersByTimeAsync(2000)
    expect(registry.hasPendingMinuteSaves()).toBe(false)
    expect(beforeUnloadPrevented()).toBe(false)
  })
})
