// Nó `decision`: um parágrafo marcado, com o rótulo "Decisão" fora do conteúdo.
import { Node, mergeAttributes } from '@tiptap/core'

export const Decision = Node.create({
  name: 'decision',
  group: 'block',
  content: 'inline*',
  defining: true,

  addAttributes() {
    return {
      id: {
        default: null,
        keepOnSplit: false,
        parseHTML: (el) => el.getAttribute('data-id') || null,
        renderHTML: (attrs) => (attrs.id ? { 'data-id': attrs.id } : {}),
      },
    }
  },

  // O rótulo também vai no HTML copiado, para quem cola fora do Projeta;
  // ao colar de volta, só o corpo vira conteúdo.
  parseHTML() {
    return [
      {
        tag: 'div[data-type="decision"]',
        contentElement: (dom) => dom.querySelector('[data-decision-body]') || dom,
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'decision', class: 'minute-decision' }),
      ['div', { class: 'minute-decision__label', contenteditable: 'false' }, 'Decisão'],
      ['div', { class: 'minute-decision__body', 'data-decision-body': '' }, 0],
    ]
  },
})
