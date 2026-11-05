# Fase 5 — Atas de reunião: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a aba **Atas** em cada projeto: um editor de blocos no estilo do Notion, simplificado, em que as **ações** viram dados consultáveis e podem virar tarefa no Gantt.

**Architecture:**
- O conteúdo da ata é um documento ProseMirror (JSON), editado com TipTap e gravado em `meeting_minutes.content`.
- No mesmo salvamento, funções puras extraem as ações do documento. A RPC transacional `save_meeting_minute` grava a ata e reescreve `meeting_actions`.
- O **documento é a fonte da verdade**; `meeting_actions` é uma projeção para consulta (painel de ações, Visão Geral e, na Fase 4, OPR).
- As atas não entram no `AppContext`: carregam ao abrir a aba, com um hook próprio.

**Tech Stack:** React 18, TipTap v3 (`@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-list`, `@tiptap/extensions`, `@tiptap/suggestion`), cmdk (já instalado), Supabase, Vitest.

**Spec:** [2026-11-04-plano-de-acao-projeta.md](2026-11-04-plano-de-acao-projeta.md), seção "Fase 5".

**Pré-requisito:** Fase 1 concluída. Esta fase usa `private.project_ids_with_role`, `private.forbid_column_changes`, `private.stamp_created_at`, o harness `tests/rls/helpers.js` e a constraint `tasks_id_project_id_key`.

## Global Constraints

- RLS das tabelas novas segue a regra padrão da Fase 1:
  - select: `project_id in (select private.project_ids_with_role('viewer'))`;
  - insert, update e delete: o mesmo com `'editor'`.
- Datas de reunião em `timestamp without time zone` e strings `'YYYY-MM-DDTHH:mm'`, como as tarefas (regra 8 do `DESIGN.md`). Prazos de ação em `date` e `'YYYY-MM-DD'`.
- Nenhuma cor ou medida literal: só tokens de `src/styles/tokens.css`. A marca (`--brand`) só no botão primário e no foco.
- Nada de `dangerouslySetInnerHTML`. Impressão e leitura usam o TipTap com `editable: false`.
- Overlays (menu `/`, confirmação, seletor de modelo) sobre Radix ou cmdk.
- Toda a interface em português.
- Limites:
  - `content` ≤ 500.000 bytes;
  - título ≤ 200 caracteres;
  - local ≤ 200;
  - participantes ≤ 2.000;
  - descrição de ação ≤ 1.000;
  - texto de busca ≤ 20.000.

## Review Focus

1. **Colar um bloco de Ação**, na mesma ata ou de outra, duplica o `id`. Ao colar, o id é regenerado (`transformPasted`), e no banco o `on conflict` só atualiza ação da mesma ata. Testes nas Tasks 1 e 2.
2. **Fechar a aba ou trocar de ata com salvamento pendente** não pode perder texto. O autosave faz `flush` ao trocar de ata e ao desmontar, e avisa no `beforeunload`. Teste na Task 3.
3. **Ata com zero ações** depois de o usuário apagar a última: a RPC precisa remover todas as linhas de `meeting_actions` daquela ata (nunca `not in` com lista vazia ou com nulo). Teste na Task 1.
4. **Tarefa do Gantt apagada depois de virar ação**: a ação continua existindo, com `task_id` nulo, e volta a oferecer "Criar tarefa". Teste na Task 1.
5. **Busca com caracteres especiais** (`,`, `(`, `%`, aspas) não pode quebrar nem injetar filtro. A busca usa `textSearch` sobre coluna gerada, nunca `.or()` montado com texto do usuário. Teste na Task 1.

---

### Task 1: Tabelas, RLS e RPC transacional

**Files:**
- Create: `supabase/migrations/20261118000000_meeting_minutes.sql`
- Create: `tests/rls/minutes.test.js`

**Interfaces:**
- Produces, em SQL:
  - `public.meeting_minutes`:
    - `id uuid pk`, `workspace_id uuid`, `project_id uuid`;
    - `title text`, `meeting_at timestamp`, `location text`, `participants text`;
    - `template text check (template in ('status','kickoff','daily','blank'))`;
    - `content jsonb`, `content_text text`;
    - `search_tsv tsvector generated always as (to_tsvector('portuguese'::regconfig, coalesce(title,'') || ' ' || coalesce(content_text,''))) stored` com índice GIN;
    - `created_by uuid default auth.uid()`, `created_at`, `updated_at`;
    - `unique (id, project_id)`;
    - FK `(project_id, workspace_id) → projects(id, workspace_id) on delete cascade`.
  - `public.meeting_actions`:
    - `id uuid pk`, `minute_id uuid`, `project_id uuid`, `workspace_id uuid`;
    - `description text`, `owner_name text`, `due_date date`;
    - `status text check (status in ('aberta','concluída','cancelada'))`;
    - `task_id uuid`, `position int`, `created_at`, `updated_at`;
    - FK `(minute_id, project_id) → meeting_minutes(id, project_id) on delete cascade`;
    - FK `(task_id, project_id) → tasks(id, project_id) on delete set null (task_id)`;
    - índice em `(project_id, status, due_date)`.
  - `public.save_meeting_minute(p_minute jsonb, p_actions jsonb) returns public.meeting_minutes`: `security invoker`, de modo que a RLS vale dentro dela, com `set search_path = ''`.
    - Faz o upsert da ata pelo `id`.
    - Apaga as ações da ata cujo id não está em `p_actions`, usando `id <> all(array(...))`.
    - Faz o upsert das ações com `position` = ordinal no array, e `on conflict (id) do update ... where meeting_actions.minute_id = excluded.minute_id`.
    - Devolve a ata salva.
  - Triggers da Fase 1:
    - `stamp_created_at` nas duas tabelas;
    - `forbid_column_changes('workspace_id','project_id','created_by','created_at')` em `meeting_minutes`;
    - `forbid_column_changes('workspace_id','project_id','minute_id','created_at')` em `meeting_actions`;
    - `set_updated_at` nas duas tabelas.
  - Grants:
    - `meeting_minutes`: select, insert, update e delete;
    - `meeting_actions`: só select, porque escrita apenas pela RPC;
    - execute da RPC para `authenticated`.

- [ ] **Step 1: Escrever os testes que falham** em `tests/rls/minutes.test.js`. A é dono do projeto P, B é viewer de P e D não tem vínculo.
  - `dono salva ata com duas ações pela RPC`: a ata volta da chamada e `meeting_actions` de P tem 2 linhas com `position` 1 e 2.
  - `salvar de novo sem uma ação remove essa ação`: resta 1 linha.
  - `salvar com zero ações remove todas`: restam 0 linhas.
  - `ação com id de outra ata não é sequestrada`: salvar a ata Y com o id de uma ação da ata X deixa a ação de X intacta (mesma descrição e `minute_id` de X).
  - `viewer lê mas não salva`: o select de B em `meeting_minutes` devolve a ata; a RPC chamada por B dá erro `42501`.
  - `sem vínculo não vê ata nem ações`: D recebe `[]` nas duas tabelas.
  - `cliente não escreve meeting_actions direto`: o insert de A dá erro `42501`.
  - `apagar tarefa ligada mantém a ação`: com a ação `task_id = T`, depois do delete de T a ação existe com `task_id === null`.
  - `busca com caracteres especiais não quebra`: `.textSearch('search_tsv', "status, (urgente) 100%", { type: 'websearch', config: 'portuguese' })` não dá erro; e uma ata com "concreto" no corpo é encontrada pela busca `concreto`.
- [ ] **Step 2: Rodar e ver falhar.** `npm run test:rls -- minutes`. Esperado: FAIL, porque as tabelas ainda não existem.
- [ ] **Step 3: Escrever a migração** conforme as Interfaces, com RLS `enable` e `force` e as policies padrão.
- [ ] **Step 4: Aplicar e rodar.** `npm run db:push:staging && npm run test:rls`. Esperado: todas as suítes PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(db): meeting minutes and actions with per-project RLS and transactional save"`

---

### Task 2: Modelo do documento: funções puras e modelos de ata

**Files:**
- Create: `src/features/minutes/minuteDoc.js`
- Create: `src/features/minutes/minuteDoc.test.js`
- Create: `src/features/minutes/templates.js`

**Interfaces:**
- Produces, em `minuteDoc.js` (o documento é um JSON ProseMirror; o nó de ação tem `type: 'actionItem'`, `attrs: { id, ownerName, dueDate, status, taskId }` e o texto da descrição como conteúdo inline; o nó de decisão tem `type: 'decision'`):
  - `EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] }`
  - `extractActions(doc): Array<{ id, description, ownerName, dueDate, status, taskId, position }>`, na ordem do documento, com `position` começando em 1.
  - `extractPlainText(doc, maxLength = 20000): string`. Blocos separados por `\n`, cortado em `maxLength`.
  - `updateActionInDoc(doc, actionId: string, patch: object): object`. Imutável: devolve um documento novo e não altera o original.
  - `dedupeActionIds(doc, makeId: () => string): object`. Ids repetidos, a partir da segunda ocorrência, recebem `makeId()`.
  - `isActionOverdue(action, todayStr: string): boolean`. Verdadeiro se `status === 'aberta'` e `dueDate < todayStr`.
- Produces, em `templates.js`: `MINUTE_TEMPLATES: Array<{ id: 'status'|'kickoff'|'daily'|'blank', label: string, doc: object }>`, com as seções:
  - `status` (rótulo "Reunião de status"): títulos "Pauta", "Avanço desde a última reunião", "Desvios e riscos", "Decisões", "Ações" (com um `actionItem` vazio) e "Próxima reunião".
  - `kickoff` (rótulo "Kickoff"): "Objetivo do projeto", "Escopo", "Marcos", "Papéis e responsáveis", "Riscos iniciais", "Ações".
  - `daily` (rótulo "Diária de campo"): "Segurança", "Executado ontem", "Programado hoje", "Impedimentos", "Ações".
  - `blank` (rótulo "Em branco"): `EMPTY_DOC`.

- [ ] **Step 1: Escrever os testes que falham:**
  - `extractActions lê ações na ordem com descrição em texto puro`: um doc com parágrafo, ação "Comprar flanges" (dono "João", prazo `2026-11-20`) e ação "Liberar PT" devolve 2 itens, com o primeiro `{ description: 'Comprar flanges', ownerName: 'João', dueDate: '2026-11-20', status: 'aberta', position: 1 }`.
  - `extractActions acha ação dentro de lista`: uma ação aninhada em `bulletList > listItem` é encontrada.
  - `extractPlainText separa blocos e corta no limite`: `extractPlainText(doc, 10).length === 10`.
  - `updateActionInDoc não muta o original`: depois de `updateActionInDoc(doc, id, { status: 'concluída' })`, o original continua `'aberta'` e o novo está `'concluída'`.
  - `dedupeActionIds mantém o primeiro e renova os repetidos`: com dois nós `id: 'a'` e `makeId = () => 'b'`, os ids passam a ser `['a', 'b']`.
  - `isActionOverdue`: aberta com prazo `2026-11-01`, vista em `2026-11-04`, dá `true`; concluída dá `false`; sem prazo dá `false`.
  - `todo modelo é um doc válido`: cada `MINUTE_TEMPLATES[i].doc.type === 'doc'`, e `extractActions` não lança erro.
- [ ] **Step 2: Rodar e ver falhar.** `npx vitest run src/features/minutes/minuteDoc.test.js`
- [ ] **Step 3: Implementar** com um único percurso recursivo de nós (`walk(node, visit)`) reaproveitado pelas cinco funções.
- [ ] **Step 4: Rodar.** `npm test`. Esperado: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(minutes): pure document model, action extraction and templates"`

---

### Task 3: Repositório de atas e autosave

**Files:**
- Create: `src/features/minutes/minutesRepository.js`
- Create: `src/features/minutes/minutesRepository.test.js`
- Create: `src/features/minutes/autosaver.js`
- Create: `src/features/minutes/autosaver.test.js`
- Create: `src/features/minutes/useProjectMinutes.js`

**Interfaces:**
- Consumes: `extractActions`, `extractPlainText` e `dedupeActionIds` (Task 2); a RPC `save_meeting_minute` (Task 1); `generateId` de `src/utils/ids.js`; `friendlyDbError` (Fase 1, Task 5).
- Produces, em `minutesRepository.js`:
  - `minuteFromRow(row): Minute`, com o formato `{ id, projectId, title, meetingAt, location, participants, template, content, createdAt, updatedAt }`.
  - `minuteToRpcArgs(minute: Minute, workspaceId: string): { p_minute, p_actions }`. Aplica `dedupeActionIds` e preenche `content_text` com `extractPlainText`.
  - `listMinutes(projectId: string, query?: string): Promise<MinuteSummary[]>`. Seleciona `id, title, meeting_at, location, updated_at`, ordena por `meeting_at desc`, e usa `textSearch('search_tsv', query, { type: 'websearch', config: 'portuguese' })` quando `query` não for vazio.
  - `loadMinute(id: string): Promise<Minute>`
  - `saveMinute(minute: Minute, workspaceId: string): Promise<Minute>`
  - `deleteMinute(id: string): Promise<void>`
  - `listProjectActions(projectId: string, { status?: string }): Promise<MeetingAction[]>`, ordenado por `due_date` com nulos por último.
- Produces, em `autosaver.js`: `createAutosaver({ save: (value) => Promise, delay = 1200, onStatus: (status: 'idle'|'pending'|'saving'|'saved'|'error') => void }): { schedule(value), flush(): Promise, dispose() }`.
- Produces, em `useProjectMinutes.js`: `useProjectMinutes(projectId): { minutes, query, setQuery, activeMinute, openMinute(id), createMinute(templateId), updateActiveMinute(patch), removeMinute(id), saveStatus }`.
  - `createMinute` usa o título "Reunião de dd/mm" e `meetingAt` no início da hora atual.
  - `openMinute` faz `flush` antes de trocar de ata.

- [ ] **Step 1: Escrever os testes que falham:**
  - `minuteToRpcArgs extrai ações e texto`: um doc com duas ações gera `p_actions.length === 2`, `p_minute.content_text` contendo "Comprar flanges" e `p_minute.workspace_id === 'w1'`.
  - `minuteToRpcArgs renova ids duplicados`: um doc com duas ações de mesmo id gera `p_actions` com dois ids distintos.
  - `minuteFromRow mapeia snake_case para camelCase`: `meeting_at` vira `meetingAt`, e assim por diante.
  - `autosaver agrupa digitação em um só save` (com `vi.useFakeTimers()`): três `schedule` em 500 ms seguidos de `advanceTimersByTime(1200)` chamam `save` uma vez, com o último valor.
  - `autosaver.flush salva o pendente na hora`: depois de `schedule(v)` e `await flush()`, `save` foi chamado com `v` sem avançar o relógio.
  - `autosaver informa erro e mantém o valor pendente`: com `save` rejeitando, `onStatus` recebe `'error'` e o próximo `flush()` tenta de novo com o mesmo valor.
- [ ] **Step 2: Rodar e ver falhar.** `npx vitest run src/features/minutes`
- [ ] **Step 3: Implementar.** `useProjectMinutes` registra um `beforeunload` enquanto houver salvamento pendente, no mesmo padrão de `AppContext.jsx` (efeito sobre `save.pending`), e chama `dispose` ao desmontar, depois de `flush`.
- [ ] **Step 4: Rodar.** `npm test`. Esperado: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(minutes): repository, search and debounced autosave"`

---

### Task 4: Editor de blocos: TipTap, Ação, Decisão e menu `/`

**Files:**
- Modify: `package.json` (pacotes TipTap v3 listados no Tech Stack)
- Create: `src/features/minutes/editor/ActionItem.jsx`: nó `actionItem` com NodeView em React
- Create: `src/features/minutes/editor/Decision.js`: nó `decision`
- Create: `src/features/minutes/editor/SlashCommand.jsx`: extensão `@tiptap/suggestion` mais a lista em cmdk
- Create: `src/features/minutes/editor/MinuteEditor.jsx`
- Create: `src/styles/views/minutes.css`, importado em `src/index.css` na camada `components`

**Interfaces:**
- Consumes: `generateId`, `isActionOverdue` (Task 2) e `today()` de `src/utils/schedule.js`.
- Produces:
  - `<MinuteEditor content={doc} editable={boolean} onChange={(doc) => void} onCreateTask={(actionId) => void} />`. `onChange` recebe `editor.getJSON()` a cada transação que altera o documento.
  - Nó `actionItem`: grupo `block`, `content: 'inline*'`, `attrs: { id, ownerName: '', dueDate: null, status: 'aberta', taskId: null }`. `addProseMirrorPlugins` inclui um `transformPasted` que dá `generateId()` novo a todo `actionItem` colado (Review Focus 1).
  - Nó `decision`: grupo `block`, `content: 'inline*'`, `attrs: { id }`.
  - Itens do menu `/`, nesta ordem:
    - Texto
    - Título 1, Título 2, Título 3
    - Lista, Lista numerada
    - Checklist
    - Citação
    - Divisor
    - Ação
    - Decisão

  O filtro é por rótulo, sem acento e sem diferença de maiúsculas.

- [ ] **Step 1: Instalar.** `npm i @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-list @tiptap/extensions @tiptap/suggestion`. Conferir no `package.json` que todos estão na mesma versão major 3.
- [ ] **Step 2: Implementar os nós e o editor.** `StarterKit`, `TaskList`, `TaskItem` (com `nested: true`), `Placeholder` ("Digite / para inserir um bloco"), `ActionItem`, `Decision` e `SlashCommand`.

  Visual com tokens:

  | Elemento | Estilo |
  |----------|--------|
  | Coluna do documento | `max-width: 760px`; corpo em `--text-read` com `line-height: 1.6` |
  | Títulos | `--text-title` e `--text-read` em semibold |
  | Ação | Linha com botão de status redondo (aberta, concluída riscada, cancelada esmaecida), texto editável, chip de responsável (input), chip de prazo (`input type=date`, em `--sched-late` quando vencida), e botão "Criar tarefa" ou link "Ver tarefa" quando há `taskId` |
  | Decisão | Borda esquerda de 2px em `--text-1`, rótulo "DECISÃO" em `--text-micro` |

- [ ] **Step 3: Verificação manual** em `npm run dev`, com uma página temporária ou a Task 5:
  - `/` abre o menu, `/aç` filtra para "Ação" e Enter insere o bloco;
  - Tab e Shift+Tab nas listas;
  - colar uma ação copiada gera id novo (conferir `editor.getJSON()` no console);
  - prazo vencido fica vermelho;
  - Ctrl+Z desfaz.
- [ ] **Step 4: Rodar.** `npm test && npm run build`. Esperado: PASS e build ok. O TipTap deve estar num chunk próprio, porque a Task 5 carrega a página com `React.lazy`.
- [ ] **Step 5: Commit.** `git commit -m "feat(minutes): TipTap block editor with action, decision and slash menu"`

---

### Task 5: Aba Atas: lista, cabeçalho e edição com salvamento automático

**Files:**
- Create: `src/features/minutes/PageMinutes.jsx`
- Create: `src/features/minutes/MinuteHeader.jsx`
- Create: `src/features/minutes/NewMinuteMenu.jsx`
- Modify: `src/components/shell/projectViews.js` (item `{ id: 'minutes', icon: NotebookPen, label: 'Atas' }` depois de "Curva S")
- Modify: `src/components/ProjectWorkspace.jsx` (`case 'minutes'` com `React.lazy(() => import('../features/minutes/PageMinutes'))` e `<Suspense>`)

**Interfaces:**
- Consumes: `useProjectMinutes` (Task 3), `MinuteEditor` (Task 4), `MINUTE_TEMPLATES` (Task 2), `ConfirmDialog` e `ViewBar`, que já existem.

**Layout** (tokens apenas):
- **ViewBar**:
  - busca à esquerda, com debounce de 300 ms para `setQuery`;
  - indicador de salvamento à direita ("Salvando…", "Salvo", "Erro ao salvar — tentar de novo");
  - botão primário "Nova ata", que abre o `NewMinuteMenu` com os quatro modelos.
- **Coluna esquerda (280 px)**:
  - atas agrupadas por mês ("Novembro de 2026");
  - cada item mostra título, data `dd/mm hh:mm` em `tabular-nums` e local;
  - item ativo com `bg-surface-3`;
  - menu do item com "Excluir", que abre `ConfirmDialog`.
- **Área principal**:
  - `MinuteHeader`: título grande em input sem borda (`--text-display`); abaixo, uma linha de campos com Data e hora (`datetime-local`), Local e Participantes (textarea que cresce);
  - depois, o `MinuteEditor`.
- **Celular (< 768 px)**: uma coluna por vez, e "← Atas" volta para a lista.
- **Tela vazia**: "Nenhuma ata neste projeto" e o botão "Criar a primeira ata" com o modelo "Reunião de status".

- [ ] **Step 1: Implementar** a página e o registro da aba.
- [ ] **Step 2: Verificação manual** em `npm run dev` contra o staging:
  - criar uma ata pelo modelo de status, digitar e esperar "Salvo";
  - recarregar a página: o conteúdo está igual;
  - trocar de ata logo depois de digitar: nada se perde (Review Focus 2);
  - a busca por uma palavra do corpo encontra a ata;
  - excluir pede confirmação e remove a ata;
  - no celular (DevTools, 390 px), a navegação lista → ata → lista funciona.
- [ ] **Step 3: Rodar.** `npm test && npm run build`. Esperado: PASS e build ok.
- [ ] **Step 4: Commit.** `git commit -m "feat(minutes): project Atas tab with list, search, templates and autosave"`

---

### Task 6: Ações: painel, criar tarefa e "Ações abertas" na Visão Geral

**Files:**
- Create: `src/utils/taskFactory.js`
- Create: `src/utils/taskFactory.test.js`
- Modify: `src/views/gantt/GanttView.jsx:1018-1032` (`buildNewTask` passa a chamar a fábrica)
- Modify: `src/pages/PageKanban.jsx:72-86` (`addTo` passa a chamar a fábrica)
- Create: `src/features/minutes/MinuteActionsPanel.jsx`
- Modify: `src/features/minutes/PageMinutes.jsx` (painel à direita, 300 px, recolhível; abaixo de 1280 px vira `Sheet`)
- Modify: `src/pages/PageProjectOverview.jsx` (cartão "Ações abertas" na coluna estreita, acima de "Anomalias")

**Interfaces:**
- Consumes: `addTask` do `AppContext`; `updateActionInDoc`, `extractActions` e `isActionOverdue` (Task 2); `listProjectActions`, `loadMinute` e `saveMinute` (Task 3).
- Produces:
  - `buildNewTask(project, { name: string, order: number, startDay?: string, workingDays?: number = 5 }): Task`, em `src/utils/taskFactory.js`.
    - Resolve o calendário com `defaultCalendarOf(project)`.
    - `startDate = workdayStart(cal, startDay ?? today())`.
    - `endDate = addWorkingMinutes(cal, startDate, workingDays * minutesPerDay(cal))`.
    - `scheduleMode: SCHEDULE_MODES.AUTO`, `progress: 0`, `dependsOn: []`, `indentLevel: 0`.
    - É a mesma regra que hoje está duplicada no Gantt e no Quadro.
  - `createTaskFromAction(project, action, order): Task`, em `MinuteActionsPanel.jsx`, que chama `buildNewTask(project, { name: action.description, order, startDay: action.dueDate ?? undefined, workingDays: 1 })`.

- [ ] **Step 1: Escrever os testes que falham** em `taskFactory.test.js`:
  - `buildNewTask nasce no próximo início de jornada e dura 5 dias úteis`: para um projeto com o calendário padrão (seg a sex, 08–12 e 13–17) e `startDay: '2026-11-06'` (sexta), `startDate === '2026-11-06T08:00'` e `endDate === '2026-11-12T17:00'`.
  - `buildNewTask com workingDays 1 termina no mesmo dia`: `startDay: '2026-11-04'` dá `endDate === '2026-11-04T17:00'`.
  - `buildNewTask usa o nome e a ordem`: `name` e `order` vêm iguais ao que foi passado, e `id` é string não vazia.
- [ ] **Step 2: Rodar e ver falhar.** `npx vitest run src/utils/taskFactory.test.js`
- [ ] **Step 3: Implementar a fábrica** e trocar os dois pontos duplicados (Gantt e Quadro).
- [ ] **Step 4: Rodar a suíte completa.** `npm test`. Esperado: os 133 testes antigos e os novos passam, provando que Gantt e Quadro não mudaram de comportamento.
- [ ] **Step 5: Implementar o painel e o cartão.**
  - O painel lista as ações da ata aberta, lidas do documento em memória com `extractActions`:
    - filtro por status (Abertas, Todas);
    - mudar o status ou clicar em "Criar tarefa" altera o documento via `updateActionInDoc` e passa pelo autosave;
    - "Criar tarefa" chama `addTask(createTaskFromAction(...))` e grava `taskId` na ação;
    - "Ver tarefa" abre o Inspector com `openTaskInspector(taskId)`.
  - O cartão da Visão Geral usa `listProjectActions(projectId, { status: 'aberta' })`:
    - mostra até 6 ações, ordenadas por prazo;
    - vencidas em `--sched-late`;
    - clicar abre a aba Atas na ata de origem;
    - marcar como concluída faz `loadMinute`, depois `updateActionInDoc` e `saveMinute`.
- [ ] **Step 6: Verificação manual:**
  - criar 3 ações numa ata e converter uma em tarefa: ela aparece no Gantt com 1 dia útil terminando no prazo;
  - apagar a tarefa no Gantt e reabrir a ata: a ação volta a oferecer "Criar tarefa" (Review Focus 4);
  - concluir uma ação pela Visão Geral e abrir a ata: ela aparece riscada.
- [ ] **Step 7: Commit.** `git commit -m "feat(minutes): actions panel, action-to-task and open actions on overview"`

---

### Task 7: Imprimir e gerar PDF da ata

**Files:**
- Create: `src/features/minutes/MinutePrintSheet.jsx`
- Modify: `src/features/minutes/PageMinutes.jsx` (botão "Imprimir / PDF" na ViewBar)
- Modify: `src/styles/print.css` (regras de `.minute-print`)

**Interfaces:**
- Consumes: `MinuteEditor` com `editable={false}` (Task 4), `extractActions` (Task 2) e `formatDateLong` de `src/utils/schedule.js`.

- [ ] **Step 1: Implementar a folha A4**, no mesmo padrão de `PageReports.jsx` (uma folha branca sobre `bg-surface-inset` e `window.print()`):
  - cabeçalho com o logo do Projeta, o nome do projeto, o título da ata, a data por extenso, o local e os participantes;
  - o corpo vem do editor em modo leitura;
  - ao final, uma **tabela de ações** (descrição, responsável, prazo, status);
  - rodapé com "Projeta · <projeto> · gerado em <data>".
- [ ] **Step 2: Verificação manual.** Imprimir para PDF (Chrome, A4) uma ata com 2 páginas: o cabeçalho não se repete quebrado, as ações não se partem no meio da linha (`break-inside: avoid`) e nenhum controle de edição aparece.
- [ ] **Step 3: Rodar.** `npm test && npm run build`. Esperado: PASS e build ok.
- [ ] **Step 4: Commit.** `git commit -m "feat(minutes): A4 print sheet with actions table"`
