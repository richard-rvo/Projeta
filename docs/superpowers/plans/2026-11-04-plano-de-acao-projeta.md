# Plano de ação — Projeta 5.0

> Plano mestre de melhoria do Projeta para lançá-lo como SaaS de gestão de
> projetos para engenheiros e como case de homologação (whitelist) em empresa.
> Escrito em 04/11/2026 a partir da leitura completa do código (commit `90a8bb3`).

## Como ler este documento

1. **Resumo em uma tela**: o que muda e em que ordem.
2. **Diagnóstico**: cada problema encontrado, com gravidade e onde está.
3. **Fases**: o que cada fase entrega e como saber que terminou.
4. **Decisões que tomei**: escolhas que você pode reverter antes de começarmos.

As fases 1 e 5 já têm plano de implementação passo a passo:

- [Fase 1 — Segurança e base SaaS](2026-11-04-fase-1-seguranca-e-base-saas.md)
- [Fase 5 — Atas de reunião](2026-11-04-fase-5-atas-de-reuniao.md)

As outras fases recebem o plano detalhado quando começarem, porque dependem do
que a Fase 1 e a Fase 2 entregarem.

---

## 1. Resumo em uma tela

| # | Fase | Por que vem nesta posição | Tamanho |
|---|------|---------------------------|---------|
| 1 | **Segurança e base SaaS**: corrigir RLS, dono por projeto, pronto para times | Toda tabela nova (atas, atualizações de status) precisa nascer no modelo de permissão novo | M |
| 2 | **Fundação do app**: URLs, salvamento atômico, fotos no Storage, carregamento por projeto | O OPR precisa de link compartilhável e de fotos fora do banco | M |
| 3 | **Retrofit de design**: ordem visual, componentes únicos, mesma identidade | Feito antes do OPR para o relatório já nascer com os componentes novos | G |
| 4 | **OPR e análise do gestor**: data de corte, histórico, Curva S com 3 linhas, relatório de uma página | Depende de 1 (tabelas), 2 (fotos e URLs) e 3 (componentes) | G |
| 5 | **Atas de reunião** estilo Notion simplificado | Só depende da Fase 1, então pode correr em paralelo com 2, 3 e 4 | M |
| 6 | **Pacote de homologação**: LGPD, SSO, trilha de auditoria, documentação de segurança | Fecha o case para a TI da empresa avaliar | M |

Tamanho: P = dias, M = 1 a 2 semanas, G = 2 a 3 semanas, para uma pessoa com
apoio de IA.

```
Fase 1 ──► Fase 2 ──► Fase 3 ──► Fase 4 ──► Fase 6
   │
   └────► Fase 5 (paralela)
```

---

## 2. Diagnóstico

Gravidade: **Crítica** = permite acessar dado de outra pessoa · **Alta** =
bloqueia homologação ou causa perda de dado · **Média** = custo, desempenho ou
confiabilidade · **Baixa** = higiene.

### 2.1 Segurança e RLS

| ID | Problema | Gravidade | Onde | Fase |
|----|----------|-----------|------|------|
| S1 | O dono de um workspace pode inserir **qualquer usuário** como membro, sem convite. O app abre "o workspace mais antigo visível" e o cliente pode gravar `created_at` no passado. Quem souber o UUID de outra pessoa faz essa pessoa abrir o workspace dele sem perceber, e tudo o que ela criar passa a ser visto por ele. | Crítica (difícil de explorar hoje; trivial quando houver times) | [schema.sql:258](../../../supabase/migrations/20260821000000_workspace_schema.sql#L258), [supabaseRepository.js:154](../../../src/utils/supabaseRepository.js#L154) | 1 |
| S2 | O dono pode trocar `owner_id` do workspace para qualquer usuário. A checagem da policy lê a linha antiga, então passa. Com `on delete restrict`, isso ainda impede a vítima de excluir a própria conta. | Alta | [schema.sql:245](../../../supabase/migrations/20260821000000_workspace_schema.sql#L245) | 1 |
| S3 | `anomalies.task_id` tem FK simples para `tasks(id)`: uma anomalia pode apontar para tarefa de outro cliente. Quando o outro cliente apaga a tarefa, o banco altera a anomalia do primeiro. | Média | [schema.sql:95](../../../supabase/migrations/20260821000000_workspace_schema.sql#L95) | 1 |
| S4 | Sem limites: fotos em base64 no JSONB sem teto de tamanho, textos sem limite, workspaces ilimitados por conta. Qualquer cadastro gratuito consegue inflar o banco e o custo. | Média (Alta para SaaS) | [schema.sql:102](../../../supabase/migrations/20260821000000_workspace_schema.sql#L102) | 1 e 2 |
| S5 | `status` e `severity` aceitam qualquer texto; não há `check` no banco. | Baixa | schema | 1 |
| S6 | Senha mínima de 6 caracteres, sem "esqueci minha senha", sem MFA e sem SSO. | Alta (homologação) | [AuthPage.jsx:16](../../../src/pages/AuthPage.jsx#L16) | 1 e 6 |
| S7 | `vercel.json` sem cabeçalhos de segurança: sem CSP, HSTS ou proteção contra clickjacking (`frame-ancestors`). | Alta (homologação) | [vercel.json](../../../vercel.json) | 1 |
| S8 | `xlsx@0.18.5` tem vulnerabilidade alta (prototype pollution e ReDoS). O risco real é baixo, porque o app só exporta, mas o scanner da TI vai barrar. | Alta (homologação) | [GanttView.jsx:6](../../../src/views/gantt/GanttView.jsx#L6) | 1 |
| S9 | Fonte carregada do Google Fonts: terceiro recebendo o IP de cada acesso (ponto de atenção LGPD) e domínio a mais na CSP. | Baixa | [index.html](../../../index.html) | 1 |
| S10 | O banco já recebeu correções manuais pelo SQL Editor (`fix_workspace_rls_permissions.sql`) e `supabase/.temp` está versionado. As migrações deixaram de ser a fonte única da verdade. | Média | [supabase/](../../../supabase/) | 1 |
| S11 | Não existe teste automatizado de RLS. Toda a segurança depende de leitura manual das policies. | Alta | — | 1 |
| S12 | As policies chamam `is_workspace_member(workspace_id)` **por linha**: o `select` em volta não vira cache porque a função recebe uma coluna. Fica lento com milhares de tarefas. | Média | [schema.sql:268-281](../../../supabase/migrations/20260821000000_workspace_schema.sql#L268-L281) | 1 |

Verificado e **sem problema**: nenhum segredo no histórico do git, a chave
`service_role` não entra no bundle ([vite.config.js](../../../vite.config.js)),
nenhum `dangerouslySetInnerHTML` e RLS forçado em todas as tabelas.

### 2.2 Arquitetura e confiabilidade

| ID | Problema | Gravidade | Onde | Fase |
|----|----------|-----------|------|------|
| A1 | Um salvamento em lote dispara N requisições paralelas sem transação. Se uma falha, o banco fica pela metade e a tela não sabe. Reprogramar 200 tarefas significa 200 requisições. | Alta | [AppContext.jsx:484](../../../src/context/AppContext.jsx#L484) | 2 |
| A2 | Sem controle de concorrência: com duas abas ou dois dispositivos, a última gravação vence em silêncio. | Alta (com times, Crítica) | AppContext | 2 |
| A3 | Sem URLs: não dá para mandar link de projeto ou relatório, o botão voltar não funciona e F5 volta ao portfólio. | Alta (SaaS) | [App.jsx](../../../src/App.jsx) | 2 |
| A4 | O login carrega o workspace inteiro, incluindo todas as fotos em base64. | Média | [supabaseRepository.js:186](../../../src/utils/supabaseRepository.js#L186) | 2 |
| A5 | Bundle único de 1,1 MB e `GanttView.jsx` com 1.897 linhas. | Média | build | 2 |
| A6 | Os campos de `metadata` sobrescrevem campos principais ao ler (`...row.metadata` vem depois de `id`). Um `metadata.id` troca o id do registro. | Média | [supabaseRepository.js:27](../../../src/utils/supabaseRepository.js#L27) | 1 |
| A7 | Um único Context com todo o estado: qualquer mudança re-renderiza o app inteiro. | Média | AppContext | 2 |

### 2.3 Design e organização visual

Medido no código atual:

| ID | Problema | Fase |
|----|----------|------|
| D1 | **Nove raios de borda diferentes** escritos à mão (1, 2, 3, 4, 5, 6, 8, 10 e 18 px), enquanto os tokens definem 9/12/16 e o `DESIGN.md` diz 6/10/14: três verdades. | 3 |
| D2 | **Quatro implementações de KPI** (`Metric` em Visão Geral e em Curva S, `Kpi` em Relatórios, `Stat` em Configurações), **três de cartão** (`Card`, `Panel`, cartão do Quadro) e **duas de seção**. Cada tela tem sua própria anatomia. | 3 |
| D3 | 24 cores hexadecimais e 23 tamanhos de fonte em px fora dos tokens, quebrando a regra 1 do próprio `DESIGN.md`. | 3 |
| D4 | `DESIGN.md` descreve a marca como magenta `#B90973`, mas a identidade real é **grafite `#1A1A1A` + laranja `#FF6A00`**, a do logo. | 1 (documentação) |
| D5 | Telas vazias sem próximo passo claro e nenhum onboarding: o primeiro login cai num portfólio vazio. | 3 |

### 2.4 Relatório (OPR) comparado ao modelo da imagem

| ID | O modelo tem | O Projeta hoje | Fase |
|----|--------------|----------------|------|
| R1 | Curva S com **Planejado, Realizado e Replanejado** e um ponto real por atualização | Só Planejado e Realizado, e o Realizado é **reconstruído em linha reta**: o app não guarda histórico de medições | 4 |
| R2 | "Atualização em 27/10 às 16:30" (data de corte) | Usa sempre "hoje" | 4 |
| R3 | Início real e Término real | Não existem campos de data real nas tarefas | 4 |
| R4 | Gantt resumido por fase, com % e parte restante clara | Tabela com todas as tarefas | 4 |
| R5 | Registros fotográficos escolhidos para o relatório | Fotos só dentro das anomalias | 2 e 4 |
| R6 | Segurança, Desvios, Plano de ação, Lições aprendidas | Não existem | 4 |
| R7 | Cabeçalho com logo do cliente, gauge do % realizado, rodapé com slogan | Logo do Projeta e cabeçalho genérico | 4 |

---

## 3. Fases

### Fase 1 — Segurança e base SaaS

**Plano detalhado:** [2026-11-04-fase-1-seguranca-e-base-saas.md](2026-11-04-fase-1-seguranca-e-base-saas.md)

**Objetivo:** cada usuário é dono dos seus projetos, ninguém mais enxerga ou
altera nada, e o modelo de dados já está pronto para times sem migração futura.

**Modelo de acesso (pronto para times):**

```
auth.users ──1:1──► workspace pessoal (conta / tenant, 1 por usuário)
                       │
                       └──► projects (owner_id = quem criou)
                               │
                               └──► project_members (project_id, user_id, role)
                                      role: owner | editor | viewer
                                      hoje: só a linha do dono
                                      com times: novas linhas, mesma RLS
```

- **Toda** tabela de projeto (tarefas, anomalias, atas, atualizações de status,
  mídia) é protegida pela mesma pergunta: "qual o papel deste usuário neste
  projeto?". Ler pede `viewer`, editar pede `editor` e apagar o projeto pede `owner`.
- Os times entram depois só com convite e aceite, adicionando linhas em
  `project_members` por uma função segura. A RLS não muda.
- Ninguém grava `workspace_members` ou `project_members` pelo cliente. Só
  triggers e funções do banco.

**Entregas:**
- [ ] Testes automatizados de RLS com dois usuários reais (A tenta ler, editar e apagar o que é de B), rodando contra um projeto Supabase de staging
- [ ] Correção de S1, S2, S3, S5 e S12, com `created_at`, `owner_id` e `workspace_id` protegidos por trigger
- [ ] Workspace pessoal criado por função do banco (`ensure_personal_workspace`), não pelo cliente
- [ ] `project_members` e policies por papel em projetos, tarefas e anomalias
- [ ] Limites: tamanho de texto, tamanho de fotos, quantidade de projetos por plano (`workspaces.plan`)
- [ ] "Esqueci minha senha", senha mínima de 10 caracteres e checklist das configurações de Auth no painel do Supabase
- [ ] Cabeçalhos de segurança no `vercel.json` e fonte servida pelo próprio app
- [ ] `xlsx` trocado pela versão corrigida, carregado só na exportação
- [ ] Migrações como fonte única: `.temp` fora do git e scripts manuais aposentados

**Pronto quando:** `npm run test:rls` passa com a matriz completa de papéis,
`npm audit --omit=dev` não mostra nada alto, os Security Advisors do Supabase
ficam zerados e `curl -I` no preview mostra os cabeçalhos.

---

### Fase 2 — Fundação do app

**Objetivo:** o app aguenta uso real em SaaS, com links, salvamento confiável e
carregamento rápido.

**Entregas e decisões:**
- **URLs com React Router.** Rotas em português:
  - `/projetos`
  - `/p/:id/visao-geral`, `/p/:id/gantt`, `/p/:id/quadro`, `/p/:id/curva-s`
  - `/p/:id/anomalias`, `/p/:id/atas`, `/p/:id/atas/:ataId`
  - `/p/:id/relatorios/:updateId`
  - `/anomalias`, `/configuracoes`

  O `vercel.json` já faz o fallback da SPA.
- **Salvamento atômico.** Uma função no banco, `save_tasks(project_id,
  expected_revision, upserts, deletes)`, roda numa transação e incrementa
  `projects.revision`. Se outra aba gravou antes, ela recusa e o app mostra
  "Este projeto foi alterado em outra janela" com a opção de recarregar.
  Isso resolve A1 e A2.
- **Realtime.** As outras abas abertas no mesmo projeto recebem a mudança e se
  atualizam.
- **Fotos no Supabase Storage.**
  - Bucket privado `project-media`, caminho `{workspace_id}/{project_id}/{uuid}.jpg`.
  - Policy do Storage com o mesmo papel de projeto da Fase 1.
  - Tabela `project_media` (legenda, data, origem: anomalia, ata ou registro
    livre), usada pela anomalia, pelo OPR e pelas atas.
  - Script que migra as fotos base64 existentes.
- **Carregamento por projeto.** O login carrega só a lista de projetos com os
  indicadores; tarefas e anomalias vêm ao abrir o projeto.
- **Estado dividido** em `AuthContext`, `ProjectDataContext` e `UiContext`, com
  `value` memoizado.
- **Code-splitting** por rota. Gantt e exportação Excel em chunks próprios.
  Meta: bundle inicial abaixo de 400 kB.
- **Monitoramento de erros** com Sentry (opcional, recomendado para SaaS).

**Pronto quando:** dá para colar `/p/<id>/gantt` em outra aba e abrir direto;
um salvamento interrompido no meio não deixa tarefa pela metade; duas abas
editando o mesmo projeto avisam o conflito; o login com 50 fotos no workspace
não baixa nenhuma.

---

### Fase 3 — Retrofit de design ("ordem de design")

Feito com a skill `/frontend-design`, sempre **mockup no navegador → sua
aprovação → implementação**, uma tela por vez.

**Identidade mantida:** grafite `#1A1A1A`, laranja `#FF6A00` como acento raro,
neutros quentes (os `oklch` de matiz 75 a 95 atuais), princípios "Precision
Calm" (cor é informação, o Gantt manda, teclado primeiro).

**Conceito visual: "prancheta de engenharia".** O Projeta passa a parecer uma
folha técnica bem desenhada:
- linhas finas;
- números como protagonistas;
- um "carimbo" (bloco de título, como em desenho técnico) no topo das páginas
  de projeto e dos relatórios;
- o laranja usado como marca-texto de campo: só onde exige ação ou é a medida
  principal.

**Regras de ordem (viram teste automático):**
1. **Anatomia única de página**: `PageHeader` (título, contexto, ações à
   direita), depois faixa de KPIs, depois grade de 12 colunas, depois seções.
   Toda página segue essa ordem.
2. **Espaçamento** só na escala 4 / 8 / 12 / 16 / 24 / 32 px.
3. **Raios**: quatro tokens, mantendo o visual atual: `xs` 6 px (chips e
   elementos dentro de linhas densas), `control` 9, `card` 12 e `sheet` 16. Os
   nove valores soltos são mapeados para o mais próximo.
4. **Tipografia**: escala fixa existente (11 / 12 / 13 / 15 / 19 / 28).
   **Confirmado pelo dono do produto em 04/11/2026**: **Archivo** (grotesca
   técnica com eixo de largura) só em títulos e números de KPI, mantendo Inter
   no corpo e na grade do Gantt por legibilidade. Ambas servidas pelo próprio
   app. Mockups de referência em `docs/design/mockups/`.
5. **Componentes únicos**, em `src/components/layout/` e `src/components/data/`:
   `PageHeader`, `KpiStrip`/`KpiTile`, `Panel`, `SectionHeader`, `EmptyState`,
   `DataTable`, `StatusPill`, `ProgressBar`, `Gauge`. As quatro versões de KPI e
   as três de cartão são apagadas.
6. **Zero cor literal** fora de `tokens.css`. O relatório impresso ganha tokens
   `--paper-*`.
7. **Guarda automática**: teste `design-rules.test.js` que varre `src/` e falha
   ao encontrar `[#hex]`, `rounded-[Npx]`, `text-[Npx]` ou espaçamento fora da
   escala. Há lista de exceções só para o miolo do Gantt.

**Ordem das telas:**
1. Shell (AppRail e TopBar)
2. Portfólio
3. Visão Geral
4. Curva S
5. Anomalias
6. Configurações
7. Landing e Login
8. Gantt (só alinhamento a tokens, sem mexer na interação)

**UX a resolver junto:**
- tela vazia sempre com o próximo passo;
- primeiro login com um projeto de exemplo opcional;
- estado de salvamento sempre no mesmo lugar;
- breadcrumb de projeto;
- formulário de anomalias revisado para o celular.

**Pronto quando:** o teste de regras passa; cada tela aprovada em mockup; o
`DESIGN.md` reescrito descreve exatamente o que está no código.

---

### Fase 4 — OPR e análise do gestor

**Objetivo:** gerar, em um clique, o One Page Report no padrão da imagem e dar
ao gestor as leituras que ele usa na reunião de status.

**Modelo de dados novo** (todas as tabelas com a RLS de projeto da Fase 1):

| Tabela / campo | Para quê |
|----------------|----------|
| `tasks.actual_start`, `tasks.actual_finish` | Início e término reais. Preenchidos sozinhos quando o % sai de 0 ou chega a 100, e editáveis |
| `status_updates` | Uma **atualização de status** por data de corte: data/hora, % planejado, % replanejado, % realizado, término previsto, SPI e os textos de Segurança, Desvios, Plano de ação e Lições aprendidas. Rascunho → **publicada** (imutável) |
| `status_update_tasks` | Retrato de cada tarefa naquela data (%, datas, baseline). É o que permite redesenhar a curva e o Gantt do passado exatamente como estavam |
| `status_update_media` | Fotos escolhidas para aquele OPR (da `project_media`) |
| `workspaces.branding` | Logo do cliente, nome da empresa e slogan do rodapé |

**As três curvas:**
- **Planejado**: linha de base, como hoje.
- **Replanejado**: o % que o cronograma *atual* previa para cada data. Mostra o
  plano corrigido.
- **Realizado**: os pontos reais de cada atualização publicada, ligados entre
  si. Antes da primeira atualização, a reconstrução atual, em linha tracejada,
  para deixar claro que é estimativa.

**Fluxo "Fechar atualização"** (o coração da fase):
1. O gestor escolhe a data e hora de corte.
2. O app lista as tarefas que deveriam ter avançado até ali e pede o % de cada uma.
3. O gestor preenche os quatro textos e escolhe até três fotos.
4. Ele publica. O retrato fica gravado e o OPR fica pronto em `/p/:id/relatorios/:updateId`.

**Layout do OPR** (A4 retrato, uma página, mesma estrutura da imagem com a
identidade do Projeta):
1. **Faixa de título** em `--brand-gradient`: nome do projeto, área e
   mês/ano; logo do cliente à direita; gauge do % realizado.
2. **Linha do tempo**: Início · Término · % Planejado · Desvio · % Realizado ·
   Início real · Término real (ou previsto) · "Atualização em dd/mm às hh:mm".
3. **Gantt por fases**: tarefas de nível 0, barra planejada, parte concluída
   cheia, restante clara e %.
4. **Curva S** com as três linhas e o rótulo de % em cada data de corte.
5. **Registros fotográficos** (até 3) | **Segurança** · **Desvios** ·
   **Plano de ação** · **Lições aprendidas**.
6. **Rodapé** com o logo e o slogan do cliente (ex.: "Acredite no ZERO").

O **Plano de ação** puxa automaticamente as ações abertas das atas (Fase 5),
além do texto livre.

**Leituras novas para o gestor:**
- **SPI** (realizado ÷ planejado) e **término previsto** por tendência.
- **Top 5 desvios**: tarefas que mais puxam o projeto para trás, ponderadas
  pela duração.
- **Desvio por fase**.
- **Marcos**: data planejada × prevista, com quantos dias de diferença.
- **Programação das próximas 2 semanas** (lookahead).
- **Caminho crítico**: quantas tarefas críticas estão atrasadas e a folga
  restante.
- **Histórico de OPRs** do projeto, com a evolução do SPI.
- **Portfólio**: colunas SPI, desvio, término previsto e data do último OPR.

**Pronto quando:** um projeto com três atualizações publicadas gera o OPR com
os três pontos reais na curva, idêntico na tela e no PDF; reabrir um OPR antigo
mostra exatamente o que foi publicado, mesmo depois de o cronograma mudar.

---

### Fase 5 — Atas de reunião

**Plano detalhado:** [2026-11-04-fase-5-atas-de-reuniao.md](2026-11-04-fase-5-atas-de-reuniao.md)

**Objetivo:** registrar reuniões do projeto num editor simples, no estilo do
Notion, onde as **ações viram dados** (responsável, prazo, status, vínculo com
tarefa), não só texto. As decisões ficam destacadas no documento e na impressão.

**O que o usuário faz:**
- Aba **Atas** dentro do projeto: lista por data, busca e botão "Nova ata".
- Nova ata a partir de modelo: Reunião de status, Kickoff, Diária de campo ou
  em branco.
- Cabeçalho da ata: título, data/hora, local, participantes (texto livre por
  enquanto, sem times).
- Corpo em blocos, com o menu `/`:
  - texto, títulos e listas;
  - checklist, citação e divisor;
  - **Ação**: descrição, responsável, prazo e status;
  - **Decisão**: bloco destacado.
- Salvamento automático.
- Painel lateral com todas as ações da ata. Cada ação pode **virar tarefa no
  Gantt** com um clique.
- Imprimir ou gerar PDF em A4.

**Decisões:** editor **TipTap** (núcleo MIT, base ProseMirror); conteúdo
gravado como JSON; ações extraídas para a tabela `meeting_actions` no mesmo
salvamento, para o OPR e a Visão Geral consultarem.

**Pronto quando:** criar uma ata de status com três ações, fechar e reabrir
mostra tudo igual; as três ações aparecem no painel de ações do projeto; outro
usuário não vê nada (teste de RLS).

---

### Fase 6 — Pacote de homologação

**Objetivo:** entregar à TI da empresa o que ela costuma pedir para aprovar um
software. Ajustamos à lista real quando você tiver o questionário deles.

- **Documento de segurança e arquitetura**:
  - dados no Supabase em São Paulo (`sa-east-1`), criptografia em trânsito
    (TLS) e em repouso;
  - isolamento por RLS com testes;
  - backups e recuperação (PITR no plano Pro);
  - cabeçalhos, dependências auditadas.
- **LGPD**:
  - política de privacidade e termos de uso;
  - exportar todos os meus dados;
  - **excluir minha conta** (Edge Function com service role, nunca no navegador);
  - registro dos operadores (Supabase, Vercel).
- **SSO SAML** (Microsoft Entra ID), disponível no plano Pro do Supabase, e
  **MFA TOTP** opcional.
- **Trilha de auditoria**: tabela `audit_events` preenchida por trigger (quem
  alterou o quê e quando), visível ao dono do projeto.
- **Varreduras**:
  - OWASP ZAP baseline no domínio;
  - `npm audit` sem nada alto;
  - Security e Performance Advisors do Supabase zerados.
- **Questionário de fornecedor** pré-respondido e página de status.

**Pronto quando:** o pacote (PDF) responde ao questionário da TI sem pendência
aberta do nosso lado.

---

## 4. Decisões que tomei (revise antes de começarmos)

1. **"Whitelist" = homologação** em lista de software aprovado de empresa. Por
   isso existe a Fase 6. Se a ideia era *white-label* (revender com a marca do
   cliente), a Fase 4 já cobre a marca no relatório e acrescentamos tema por
   workspace.
2. **Workspace pessoal continua existindo** como "conta", unidade de cobrança e
   futura organização. O acesso, porém, é decidido **por projeto**, para que os
   times possam compartilhar projetos específicos.
3. **Testes de RLS em Node contra um projeto Supabase de staging**, e não com
   pgTAP local, porque esta máquina não tem Docker. Testar pela API também é
   exatamente o caminho de um atacante.
4. **Sinal do desvio** (confirmado pelo dono do produto em 04/11/2026):
   Realizado − Planejado. Negativo é atraso e aparece em vermelho como
   "−3 p.p.". O modelo da imagem usa a convenção inversa ("+3%"), que não será
   adotada.
5. **SheetJS 0.20.3 pela CDN oficial** em vez de trocar de biblioteca: corrige
   as vulnerabilidades sem reescrever a exportação.
6. **Raios mantêm o visual atual** (9/12/16 + 6 para miúdos), e o `DESIGN.md` é
   corrigido para bater com o código, não o contrário.
7. **TipTap** para as atas em vez de BlockNote: núcleo MIT e controle total do
   visual. O BlockNote já parece Notion, mas impõe o próprio visual e tem
   partes com licença GPL.
8. **Cobrança (Stripe) fora deste plano**: só a coluna `workspaces.plan` e os
   limites ficam prontos para ela.

## 5. Próximo passo

Começar pela **Fase 1**. Antes da primeira tarefa, você precisa criar um
projeto Supabase de **staging** (gratuito) e me passar URL, anon key e
service role key num `.env.test.local`, que fica fora do git. Os testes de RLS
nunca rodam contra a produção.
