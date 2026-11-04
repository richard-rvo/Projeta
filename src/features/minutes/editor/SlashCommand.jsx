// Menu /: a extensão @tiptap/suggestion abre a lista em cmdk junto ao cursor.
// O foco fica no editor; setas e Enter chegam aqui por onKeyDown.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Extension } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import { ReactRenderer } from '@tiptap/react'
import Suggestion from '@tiptap/suggestion'
import { Command, CommandEmpty, CommandItem, CommandList } from '@/components/ui/command'
import { filterSlashItems } from './slashItems'

const STEP = { ArrowDown: 1, ArrowUp: -1 }

const SlashMenu = forwardRef(function SlashMenu({ items, loading, command }, ref) {
  const [active, setActive] = useState(0)
  const rootRef = useRef(null)
  // A lista muda a cada letra; até o efeito zerar o índice, não sai do fim dela.
  const current = Math.min(active, Math.max(items.length - 1, 0))

  useEffect(() => setActive(0), [items])
  useEffect(() => {
    rootRef.current?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [current])

  useImperativeHandle(
    ref,
    () => ({
      onKeyDown(event) {
        if (!items.length) return false
        if (STEP[event.key]) {
          setActive((index) => (index + STEP[event.key] + items.length) % items.length)
          return true
        }
        if (event.key !== 'Enter') return false
        command(items[current])
        return true
      },
    }),
    [items, current, command],
  )

  return (
    // mousedown sem default: clicar num item não tira o foco do editor.
    <div
      ref={rootRef}
      className="w-56 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      onMouseDown={(event) => event.preventDefault()}
    >
      <Command
        shouldFilter={false}
        value={items[current]?.id ?? ''}
        onValueChange={(value) => setActive(Math.max(0, items.findIndex((item) => item.id === value)))}
      >
        <CommandList label="Inserir bloco">
          {!loading && <CommandEmpty>Nenhum bloco encontrado</CommandEmpty>}
          {items.map(({ id, label, icon: Icon }, index) => (
            <CommandItem key={id} value={id} onSelect={() => command(items[index])}>
              <Icon aria-hidden="true" />
              {label}
            </CommandItem>
          ))}
        </CommandList>
      </Command>
    </div>
  )
})

function renderMenu() {
  let renderer = null
  let unmount = null
  return {
    onStart(props) {
      renderer = new ReactRenderer(SlashMenu, { editor: props.editor, props, className: 'z-50' })
      unmount = props.mount(renderer.element)
    },
    onUpdate(props) {
      renderer?.updateProps(props)
    },
    onKeyDown({ event }) {
      return renderer?.ref?.onKeyDown(event) ?? false
    },
    onExit() {
      unmount?.()
      renderer?.destroy()
      renderer = null
      unmount = null
    },
  }
}

export const SlashCommand = Extension.create({
  name: 'slashCommand',
  // Antes dos atalhos dos nós: com o menu aberto, Enter e as setas são dele.
  priority: 200,

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        pluginKey: new PluginKey('slashCommand'),
        char: '/',
        items: ({ query }) => filterSlashItems(query),
        command: ({ editor, range, props: item }) => item.run(editor, range),
        allow: ({ state, range }) => !state.doc.resolve(range.from).parent.type.spec.code,
        render: renderMenu,
      }),
    ]
  },
})
