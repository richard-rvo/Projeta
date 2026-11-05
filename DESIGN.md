# Design System — "Precision Calm"

> **Versão**: 3.1 · novembro de 2026
> Histórico do redesign: [`docs/REDESIGN.md`](docs/REDESIGN.md)

**Apple** (calma, hierarquia, material) × **MS Project** (densidade, rigor de cronograma) × **ClickUp** (velocidade, comando, views).

---

## Princípios

**1. Um chrome só.** Uma barra de contexto por nível, nunca três empilhadas. Do topo da janela até a primeira linha do Gantt existem no máximo duas barras (52px + 44px).

**2. Cor é informação.** Superfícies neutras; cor reservada para estado de cronograma. Quando tudo é colorido, nada é destaque.

**3. Densidade adaptativa.** Confortável para leitura executiva, compacta para trabalho de plano. Um token controla as duas.

**4. O Gantt manda.** Todo o resto cede altura para ele.

**5. Teclado primeiro.** Toda ação do Gantt é alcançável sem mouse.

---

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/styles/tokens.css` | Todos os tokens + `@theme` do Tailwind |
| `src/styles/base.css` | Padrões de elemento sobre o preflight |
| `src/styles/views/gantt.css` | CSS semântico do Gantt (camada `components`) |
| `src/styles/print.css` | Impressão |

Ordem das camadas: `theme → base → components → utilities`. Utilitário sempre vence.

> O `legacy.css` de 3.492 linhas com que este redesign começou foi **deletado por completo** na Fase 8.

---

## Tokens

Nenhum componente declara cor literal. Tudo vem de `tokens.css`.

### Superfícies e texto

| Token | Uso |
|---|---|
| `--surface-0` | Fundo da aplicação |
| `--surface-1` | Painel, card, linha |
| `--surface-2` | Alternativa sutil, hover |
| `--surface-3` | Recuado: cabeçalhos, trilhos, segmented |
| `--surface-inset` | Mesa de trabalho, fundo mais profundo |
| `--text-1` / `--text-2` / `--text-3` | Primário / secundário / terciário |
| `--line-hairline` / `--line-strong` | Divisória interna / borda de painel |

### Estados de cronograma

**A única fonte de cor semântica do produto.** Substituíram as seis cores arbitrárias e os hex soltos dentro dos componentes.

| Token | Significado |
|---|---|
| `--sched-not-started` | Não iniciada |
| `--sched-on-track` | Em andamento |
| `--sched-at-risk` | Em risco |
| `--sched-late` | Atrasada · destrutivo |
| `--sched-done` | Concluída |
| `--sched-critical` | Caminho crítico |
| `--sched-baseline` | Linha de base, setas de dependência |
| `--sched-slack` | Folga |
| `--gantt-weekend` | Faixa de não-útil na timeline |

Cada um tem variante `-soft` para fundo de pílula. O token de fim de semana é próprio porque reutilizar uma superfície inverte o contraste no tema escuro.

### Marca

A marca é o **laranja `#FF6A00`** (`--brand`; `#FF8A3D` no tema escuro) com o
**grafite `#1A1A1A`** do logo. Tokens: `--brand`, `--brand-hover`, `--brand-soft`
e `--brand-gradient`. Permitidos em **quatro** lugares e mais nenhum:

1. Botão primário
2. Anel de foco e célula ativa
3. Logo
4. Barra de progresso do projeto

### Raio, tipografia, movimento

- **Raio**: 9 (`--radius-control`) · 12 (`--radius-card`) · 16 (`--radius-sheet`) · pill. Raio grande destrói densidade.
- **Tipografia**: SF-first (`-apple-system`), Inter de fallback. A Inter é **auto-hospedada** (`@fontsource-variable/inter`, importada em `main.jsx`): não há Google Fonts nem CDN de fontes, e a CSP só permite `font-src 'self'`. Escala: `micro` 11 · `small` 12 · `body` 13 · `read` 15 · `title` 19 · `display` 28. `tabular-nums` em toda data e número.
- **Movimento**: 3 durações (120 / 200 / 320ms) e 2 easings. `prefers-reduced-motion` respeitado.
- **Elevação**: 4 níveis com tinta neutra fria, nunca preto puro.

### Densidade

`[data-density]` no `<html>` controla `--gantt-row-h` (40px / 30px), paddings e alturas de controle.

### Decisões aprovadas (04/11/2026)

- **Archivo** para títulos e números de KPI, com Inter no corpo. Aprovada, mas
  **ainda não implementada**: entra na Fase 3 (hoje o produto usa só Inter).
- **Sinal do desvio**: `Realizado − Planejado`, em pontos percentuais. Um desvio
  de −3 p.p. significa três pontos atrás do planejado.

---

## Material

Vidro (`backdrop-filter`) é para **overlays sobre conteúdo**, nunca para superfícies densas de dados. Na versão anterior, `glass-card` estava em KPI, projeto, anomalia, tabela e settings — quando tudo é vidro, nada é destaque.

---

## Componentes estruturais

| Componente | Altura | Papel |
|---|---|---|
| `AppRail` | 64px | Navegação global; expande em overlay, não empurra o layout |
| `TopBar` | 52px | *Onde você está*: projeto + views |
| `ViewBar` | 44px | *O que dá para fazer aqui* |
| `Inspector` | 380px | Único caminho de edição de detalhe |

---

## O Gantt

### Layout

**Um scroller para os dois eixos.** O cabeçalho gruda com `position: sticky; top: 0`; a planilha com `left: 0`. Scroll vertical e horizontal ficam alinhados nativamente, sem uma linha de JS.

Uma linha é **um elemento** contendo as células e a barra. É isso que faz a seleção atravessar as duas metades.

Não há realce de **hover** na linha: o ponteiro cruza dezenas de linhas a caminho da barra que interessa, e acender cada uma no caminho é ruído. O que precisa estar visível é a seleção — ela diz onde o usuário está, o hover só dizia por onde o mouse passou.

As duas metades dividem o mesmo `gridWidth`, mas só o cabeçalho tem o botão "+" de adicionar coluna. O corpo reserva a mesma faixa (`--gantt-add-col-w`); sem isso a coluna que cresce absorve a diferença e o cabeçalho sai do lugar em relação às células.

### Barras

- Altura derivada de `--gantt-row-h`, centrada verticalmente
- Progresso como **faixa interna mais escura**, não overlay branco: a cor de status continua legível
- Rótulo dentro quando cabe, **fora quando não cabe** — nunca some
- Tarefa-resumo é um **colchete**, não uma barra: comunica agrupamento, não trabalho
- Marco em losango; baseline tracejada; folga pontilhada após o término
- **Agendada manualmente** tem pontas em colchete (a convenção do MS Project): "esta tarefa
  não vai andar sozinha" precisa ser legível na barra, sem abrir a coluna Modo
- **Violação de dependência** — manual com data que desrespeita a predecessora — é contorno
  tracejado em `--sched-late` mais um ícone à direita da barra. Só marca; corrigir seria
  desfazer a decisão que o modo manual representa
- A barra mostra a **hora** a partir de `dayWidth ≥ 18`, medida sobre a jornada do calendário
  (abertura → fechamento), não sobre as 24h do relógio: sobre 24h uma tarefa de um dia inteiro
  ocuparia um terço da célula e o Gantt pareceria quebrado

### Timeline

Fins de semana e linhas de dia desenhados com **gradientes repetidos**, não com um elemento por dia. Um ano de timeline custava 365 nós; agora custa zero.

Ticks e setas de dependência são cortados fora da janela visível.

### Virtualização

Por **spacers**, não `transform` — transform criaria bloco de contenção e perturbaria o `sticky`.

---

## Acessibilidade

- Anel de foco visível em tudo (`--focus-ring`)
- Overlays sobre Radix: foco preso, `Escape` fecha, papéis ARIA corretos
- Contraste calibrado em oklch para os dois temas
- Alvos densos com no mínimo 26px

---

## Regras para código novo

1. **Nunca** escreva cor literal. Use um token.
2. **Nunca** use a marca fora dos quatro lugares permitidos.
3. Tailwind para shell, páginas e formulários; CSS semântico só onde a densidade exige (o miolo do Gantt).
4. Overlays sempre sobre Radix — não escreva Dialog, Popover ou Menu à mão.
5. Data e número sempre com `tabular-nums`.
6. Uma instância de tooltip e de menu de contexto, posicionada por estado — nunca uma por linha.
7. **Nunca** faça aritmética de calendário fora de `utils/worktime.js`, e **nunca** resolva o
   calendário pelo projeto quando existe uma tarefa: use `calendarOf(project, task)`. Duas
   tarefas da mesma cadeia podem rodar em jornadas diferentes, e é o motivo de o motor contar
   em minutos úteis.
8. Datas são strings ordenáveis — `'YYYY-MM-DD'` ou `'YYYY-MM-DDTHH:mm'`. Nenhum objeto `Date`
   atravessa fronteira de módulo. Ao comparar um instante com uma data-só, reduza os dois com
   `dateOf()`: `'…T08:00'` é maior que a data-só do mesmo dia, e a diferença silenciosa é de
   um dia inteiro.
9. Duração se lê e se escreve por `utils/duration.js`. O editor abre com a mesma unidade que o
   commit grava — abrir e gravar em unidades diferentes já custou uma semana de cronograma.
