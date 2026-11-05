# Pendências pós-lançamento — Projeta 5.0

> Publicado em produção em 05/11/2026 (`main` @ `8715a5e`). Este arquivo guarda
> o que ficou para a próxima rodada e as decisões tomadas durante a execução,
> para que nada se perca quando os registros temporários forem apagados.

## Prioridade 1 — próxima rodada

1. **Salvamento das atas ao sair da aba (item 5 da revisão final).** Hoje, se um
   salvamento falha (por exemplo, sem internet) e o usuário sai da aba Atas ou da
   conta, o texto não salvo pode se perder. A primeira tentativa de correção foi
   desfeita porque permitia dois salvadores para a mesma ata (sobrescrever
   edições novas ou ressuscitar uma ata apagada) e podia travar o "Sair".
   Desenho pedido: **um único dono por ata** (registro por id da ata), erros
   definitivos (42501, 23503, 23514, 22P02, P0001, 403) param de tentar e
   aparecem para o usuário, `openMinute`/`complete`/`removeMinute` abortam se o
   salvamento pendente daquela ata falhar, e opção "Sair mesmo assim" com aviso.
2. **Painel do Supabase (manual, dono do projeto):** modelos de e-mail de
   confirmação e redefinição em português; Redirect URLs com o domínio de
   produção; itens da checklist em `supabase/README.md`; verificação manual do
   fluxo "Esqueci minha senha" ponta a ponta.
3. **Conferência no navegador** (não automatizável aqui): console sem violações
   de CSP em login, Gantt, anomalia com foto e Atas; impressão real da ata e do
   relatório em A4.

## Prioridade 2 — melhorias registradas nas revisões

- Erros: `TypeError` genérico vira "Sem conexão" sem registrar no console;
  limites de texto podem cortar um emoji ao meio (usar contagem por caractere);
  `PageSettings` sem `maxLength` em nome/descrição do projeto; `addTask` no
  Gantt sem tratamento de erro; `AUTH_ERROR` zera o modo de recuperação de senha;
  "Sair" offline sem retorno visual.
- Atas: ids de ação duplicados no documento em memória (regenerados a cada
  salvamento); busca e abertura de ata sem proteção contra respostas fora de
  ordem; acessibilidade do menu "/" (`aria-activedescendant`) e de atraso só por
  cor; tokens de layout (280/300/760px) a criar na Fase 3.
- Banco (antes de times): `saveProject` deve atualizar projetos existentes em vez
  de upsert (editor fora do workspace); índice "um dono por projeto";
  `projects.owner_id on delete cascade` a rever; RPC para remover membros;
  revogar privilégios padrão do Supabase (TRUNCATE etc.) em todas as tabelas
  públicas; mensagem "not authenticated" da RPC em português.
- Testes: variações de papel/comando ainda não cobertas (viewer em anomalias e
  projetos, editor em inserts/deletes), teste de revogação do EXECUTE para anon.

## Fases ainda não iniciadas

Fase 2 (URLs, salvamento atômico, fotos no Storage), Fase 3 (retrofit de design
— mockups e decisões aprovados), Fase 4 (OPR e análise do gestor) e Fase 6
(pacote de homologação). Ver o plano mestre.

## Apêndice — registro técnico das execuções

### Decisões tomadas durante a execução (rulings)
- Ruling: Task 2 and Task 6 Steps 1-4 run now although the plan lists "Pré-requisito: Fase 1 concluída" — they touch no database/RLS surface — cost if wrong: none expected (pure functions + refactor guarded by existing 133 tests).
- Ruling: Task 6 split into 6a (Steps 1-4: taskFactory + Gantt/Kanban refactor, commit "refactor: shared task factory for Gantt, Board and minutes") and 6b (Steps 5-7: panel, card, manual checks, original commit message) — 6b depends on Task 3 — cost if wrong: one extra review cycle.
- Ruling: RPC wire shapes fixed in Task 3 dispatch — p_minute {id, workspace_id, project_id, title, meeting_at, location, participants, template, content, content_text}; p_actions [{id, description, owner_name, due_date, status, task_id}] (position derived from order) — Task 1 RPC must read exactly these keys — cost if wrong: RPC/client mismatch caught by Task 1 RLS tests
- Ruling: Task 4 Step 3 manual browser checks replaced by jsdom tests (slash filter, schema round-trip, paste id regeneration); visual check deferred to Task 5 — cost if wrong: visual polish issues found later
- Ruling: Fase 3/4 mockups (OPR, Visão Geral retrofit, Atas) produced now in worktree p5-design-mockups — plan requires user visual approval before Fase 3/4 implementation; mockups are design artifacts, gated by user approval instead of code review — cost if wrong: one subagent of design work
- Task 4: Ruling: keep implementer Enter/Backspace action behavior (Backspace at start drops owner/due/taskId but is undoable, tested) — cost if wrong: minor UX surprise
- Task 4: Ruling: outline removed on ProseMirror root only accepted; chips/buttons keep visible focus — cost if wrong: a11y audit flag
- Ruling: Task 5 Step 2 manual staging check replaced by jsdom tests with mocked useProjectMinutes (empty state, month grouping, save indicator, delete confirm) + TipTap chunk check; real-DB check deferred to staging — cost if wrong: integration bug found at staging
- Ruling: Task 5 passes a temporary onCreateTask toast (6b replaces it) and onOpenTask=openTaskInspector — cost if wrong: none (replaced next task)
- Task 5: Ruling: plan-specified 280px column and Tailwind scale classes accepted until Fase 3 layout tokens — cost if wrong: Fase 3 cleanup
- Ruling: add clearMissingTaskLinks(doc, existingTaskIds) — doc is source of truth so a Gantt-deleted task leaves a dangling taskId that would break the FK on save; applied on minute open/task change and before Overview "Concluir" save — cost if wrong: extra pure function
- Ruling: AppContext gains focusMinuteId + openMinuteFromOverview(minuteId) for cross-tab open (no router until Fase 2) — cost if wrong: replaced by URL in Fase 2
- Ruling: Task 6 Step 6 manual checks replaced by jsdom tests with mocks — cost if wrong: integration issue found at staging
- Ruling: Task 7 uses a print-preview mode (like PageReports) with flush before entering; Step 2 manual Chrome PDF check replaced by jsdom tests; real printer check pending for owner — cost if wrong: print layout tweaks later
- Task 7: Ruling: hard-coded paper ink colors in MinutePrintSheet follow existing PageReports print convention; Fase 3 introduces --paper-* tokens — cost if wrong: Fase 3 cleanup
- Ruling: plan conflict — save_meeting_minute is security invoker but meeting_actions grants only SELECT (writes "only via RPC"), so an invoker RPC cannot write actions. Resolution: public RPC stays security invoker (minute upsert under RLS); action writes go through private.write_meeting_actions(...) security definer, which re-checks editor role via project_ids_with_role and minute/project consistency; meeting_actions keeps SELECT-only grants — cost if wrong: one extra private function
- Ruling: Task 1 adds a contract test — payload from the real minuteToRpcArgs saved through the RPC — to pin the client/RPC wire shape — cost if wrong: none
- Task 1: second interruption (machine slept); migration file written but not pushed; Ruling: no PGlite dry-run harness (out of scope; push is transactional) — resumed same agent
- Task 1: Ruling: promoted Minor "dangling task_id fails whole save (23503)" to Important (same data-loss class) — null it when no task in project
- Task 1: Ruling: include null p_actions → 22023; editor re-save test pinning created_by; WAF POST probe test — cost if wrong: small extra tests
- Task 1: Ruling: ratify extra insert check created_by = auth.uid() (stricter than standard rule) — cost if wrong: none (RPC default fills it)
- Task 1: Ruling: fix via NEW migration 20261118010000_minutes_save_hardening.sql (applied migration not edited)
- Ruling: Run tracks A, B (and Fase 5 track C) in parallel worktrees despite SDD's "never parallel implementers" — user explicitly requested parallel subagent implementation; worktrees remove the file-conflict reason behind the rule — cost if wrong: merge conflicts at integration (resolved by controller via fresh fix dispatch).
- Ruling: Task 6 Step 4 (Supabase dashboard auth settings) and Step 5 (manual recovery e-mail flow) are deferred to Track D once staging access exists; implementer documents the checklist in supabase/README.md and verifies via unit tests + build — cost if wrong: recovery flow bug found later in staging.
- Ruling: Task 7 Step 5 (Vercel preview + curl + CSP console check) deferred to deploy time (needs push/deploy, which requires user approval); implementer verifies via unit test + `npm run build` + inspection that dist/index.html has no inline script — cost if wrong: a CSP violation discovered on first preview deploy.
- Ruling: Task 9 Steps 2-5 (production pre-flight, backup, db push, deploy) require explicit user approval — security-sensitive and outward-facing.
- Task 6: Ruling: promoted reviewer Minor "Supabase updateUser errors reach user in English" to Important — violates global constraint Mensagens ao usuário em português — cost if wrong: small extra fix scope
- Ruling: Task 1 must also add .worktrees/** and .superpowers/** to vite.config test.exclude — running vitest in the main checkout currently collects worktree copies (584 tests observed) — cost if wrong: confusing counts only
- Ruling: test target is the Projeta project itself (owner-authorized, disposable data) instead of a separate staging (free-tier limit) — assertNotProduction becomes assertConfirmedTarget(url, confirmRef) requiring RLS_CONFIRM_PROJECT_REF; npm script keeps the name db:push:staging — cost if wrong: test users/data created in the live project (cleaned per run)
- Task 1: Ruling: promoted Minor "denied update/delete do not assert error is null" to Important — a constraint error would masquerade as RLS denial in a security suite — cost if wrong: small extra assertions
- Ruling: Task 3 Step 5 manual app smoke replaced by an RLS test that round-trips app payloads built by exported projectToRow/taskToRow/anomalyToRow through a test user client and reads back with *FromRow — cost if wrong: UI-only regressions found later
- Ruling: Task 4 enforce_project_limit must skip when a project with NEW.id already exists — BEFORE INSERT triggers fire on INSERT..ON CONFLICT DO UPDATE, so the app upsert of an existing project would hit the limit at 10 projects — test required — cost if wrong: users at the limit cannot edit projects
- Task 4: Ruling: fix via NEW migration 20261104030000_project_limit_lock.sql (applied migration must not be edited) — cost if wrong: one extra migration file
- Task 4: parked — reviewer Important #2 "cleanup discards legacy data (status case variants, oversized photos/metadata)" — Ruling: brief-mandated defaults; the only DB is disposable and already clean, no legacy environment exists; migration already applied so editing it would drift — real but nothing builds on it
- Ruling: Task 9 Steps 2-4 (pre-flight, backup, db push) already satisfied — target DB was this project: backup JSON taken, owner-authorized wipe, all migrations pushed; Step 5 verification after frontend deploy (needs owner approval) — cost if wrong: none
- Ruling: final fix wave = Important 1-7 + cheap minors (overview stale guard + complete() uses minute.projectId; print label cancelada; action→task name clamp 500; ErrorBoundary for lazy route + vercel rewrite excludes /assets/; maxLength on core forms; README invites row + live-target wording) — one dispatch, opus, worktree p5-final-fix from f205c5f — cost if wrong: larger fix diff
- Final fix wave: parked — Minor TypeError→Sem conexão without log; surrogate-pair split in clamps; orphan across account switch (moot after revert) — Ruling: non-blocking, next round

### Itens adiados e estacionados
- Task 5: minor (deferred): no tests for friendlyDbError fallback paths (unknown code → message; nothing → default)
- Task 5: minor (deferred): no test that row createdAt/updatedAt beat metadata
- Task 5: minor (deferred): saveErrorMessage is a one-line passthrough to friendlyDbError
- Task 5: minor (deferred, pre-existing): stale metadata keys (e.g. workspaceId) still leak into Project object
- Task 7: minor (deferred): CSP test uses substring checks; does not pin script-src to exactly self
- Task 7: minor (deferred): tokens.css:159 comment still says Inter is fallback
- Task 7: minor (deferred): custom Supabase domain would need CSP update
- Task 8: minor (deferred): async onExcel fired without await; repeated clicks during first chunk load may start parallel exports
- Task 8: minor (deferred, pre-existing): row building runs outside try in exportToExcel
- Task 6: minor (deferred): reset screen Voltar buttons do nothing (onBack not passed); no cancel/sign-out
- Task 6: minor (deferred): no reducer tests for recovery flag transitions
- Task 6: minor (deferred): missing autoComplete new-password/current-password
- Task 6: minor (deferred, out-of-scope obs): login/signup Supabase errors (e.g. Invalid login credentials) still shown in English — reuse authErrorMessage
- Task 1: minor (deferred): cleanup drops failed ids silently; createTestUser builds adminClient per call; db:push:staging exposes DB URL in process list (plan-mandated, low risk); cascade assumption on workspace delete
- Task 2: minor (deferred): anon RPC test passes via body raise, not proving the EXECUTE revoke (assert permission denied)
- Task 2: minor (deferred): note near triggers that upserts must never send created_at (EXCLUDED gets now())
- Task 2: minor (deferred): forbid_column_changes silently no-ops on misspelled column (guard with ? operator)
- Task 2: minor (deferred): ensure_personal_workspace select into without strict; does not ensure owner membership row
- Task 2: minor (deferred): tests missing for member UPDATE/DELETE revokes, non-owner rename, anomalies forbid, naming pin; todayUtc flake at midnight
- Task 2: minor (deferred, plan-mandated): not authenticated message in English
- Task 3: minor (deferred, teams-only): editor outside workspace cannot upsert project (INSERT WITH CHECK applies on upsert); fix saveProject to update existing ids before teams
- Task 3: minor (deferred): owner_id vs owner row drift; one-owner partial unique index for teams phase
- Task 3: minor (deferred): Supabase default ALL grants (TRUNCATE etc.) on public tables — hygiene, not exploitable via PostgREST; sweep + alter default privileges later
- Task 3: minor (deferred): projects.owner_id on delete cascade risky once owners differ (plan-mandated); service-role inserts must pass owner_id; backfill bumps updated_at; untested role/command combos
- Task 4: parked — reviewer Important #2 "cleanup discards legacy data (status case variants, oversized photos/metadata)" — Ruling: brief-mandated defaults; the only DB is disposable and already clean, no legacy environment exists; migration already applied so editing it would drift — real but nothing builds on it
- Task 4: minor (deferred): service role also bound by limit (no admin escape hatch); existence check ignores workspace (safe, comment it); tasks.status unconstrained
- Task 4: complete (commits 0c1dbe6..34b7c4f, review clean after 1 fix round, 1 parked)
- Task 9 Step 1: review Approved. minor (deferred): PRD 7.11 omits minutes search; README workspaces row omits owner delete; PRD could name where ensure_personal_workspace is called
- Final fix wave: parked — Minor TypeError→Sem conexão without log; surrogate-pair split in clamps; orphan across account switch (moot after revert) — Ruling: non-blocking, next round
- Task 2: minor (deferred): updateActionInDoc with falsy actionId matches id-less actions; patch containing id can rewrite id
- Task 2: minor (deferred): dedupeActionIds does not re-check makeId() collisions
- Task 2: minor (deferred): EMPTY_DOC and template docs are shared mutable singletons (freeze or factory)
- Task 2: minor (deferred): templates build keys on magic string Ações; template test checks only ids/doc.type
- Task 6a: minor (deferred): GanttView buildTask wrapper only forwards to factory
- Task 6a: minor (deferred): buildNewTask(project) with no options throws (no default for 2nd arg)
- Task 3: minor (deferred): in-memory doc keeps duplicate ids → regenerated every save (action row churn)
- Task 3: minor (deferred): refreshList/openMinute lack stale-response guards
- Task 3: minor (deferred): misleading comment about project switch flush
- Task 3: minor (deferred): listMinutes order meeting_at desc should use nullsFirst:false
- Task 3: minor (deferred): if v1 fails while v2 pending, debounce drain returns without saving v2 until next flush/schedule (status stays error)
- Task 3: minor (deferred): no repository unit test for rpc().single() chain
- Task 4: minor (deferred): syncContent can revert typing if parent feeds older doc; return value ignored
- Task 4: minor (deferred): first click on doc ending in action fires one onChange
- Task 4: minor (deferred): overdue color-only; generic aria labels per action; slash menu lacks aria-activedescendant
- Task 4: minor (deferred): Criar tarefa double-click fires twice (Task 6b must guard)
- Task 4: minor (deferred): decision ids can duplicate; editor vs dedupeActionIds taskId policies differ
- Task 4: minor (deferred): minutes.css literal 4px radius and 0.5 opacity; invisible combining-mark chars in slashItems.js:45; round-trip test narrower than toEqual
- Task 4: minor (deferred): syncContent applies valid content silently to a locked (invalid) editor; jsdom peer flag churn in lockfile
- Task 5: minor (deferred): role=status live region mounted only when status exists
- Task 5: minor (deferred): no tests for debounce/mobile switching/deleting active minute; Suspense fallback null
- Task 5: minor (deferred): no test for Participantes auto-grow; mobile test checks classes only
- Task 6b: minor (deferred): useMinuteActions imports helper from component file (move createTaskFromAction/useWideScreen to plain module)
- Task 6b: minor (deferred): useWideScreen matchMedia per render re-adds listener
- Task 6b: minor (deferred): panelOpen not re-synced on viewport cross 1280px
- Task 6b: minor (deferred): focus consume hides list even if openMinute bailed
- Task 6b: minor (deferred): overview actions refresh lacks stale-response guard
- Task 6b: minor (deferred): arbitrary w-[300px]/w-[320px]/rounded-[5px]/[6px]; no test for panel setActionStatus
- Task 7: minor (deferred): status label test mirrors mapping (weak); no message on failed flush beyond SaveIndicator
- Task 7: minor (deferred): placeholder safeguard rule not exercised (span never renders read-only); markup test filter is regex-based
- Task 1: minor (deferred, client): friendlyDbError shows raw HTML from WAF blocks; header fields lack maxLength; extractPlainText can split surrogate pair; RPC/loadMinute ship search_tsv (add select list)
- Task 1: minor (deferred): positions get gaps on guarded skip; meeting_actions.workspace_id not FK-tied to minute; test gaps (cross-project hijack, stranger with existing id, viewer delete, project delete with linked task); order-dependent tests
- Task 1: minor (deferred): duplicate action id in one save fails with 21000 (client dedupes); invalid status fails 23514
