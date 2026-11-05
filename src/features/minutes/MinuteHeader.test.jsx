// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import MinuteHeader from './MinuteHeader'

beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true })

let root, container
afterEach(() => { act(() => root?.unmount()); container?.remove() })

describe('MinuteHeader', () => {
  it('limita título, local e participantes aos tamanhos aceitos pelo banco', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    const minute = { id: 'm1', title: 'T', meetingAt: '', location: '', participants: '' }
    act(() => root.render(<MinuteHeader minute={minute} onChange={() => {}} />))
    expect(container.querySelector('#minute-m1-title').maxLength).toBe(200)
    expect(container.querySelector('#minute-m1-location').maxLength).toBe(200)
    expect(container.querySelector('#minute-m1-participants').maxLength).toBe(2000)
  })
})
