# Product Requirements Document

## Projeta — sistema de gestão de projetos

**Versão:** 4.1
**Atualizado:** agosto de 2026
**Produto:** Projeta
**Domínio:** https://projeta.richardvieira.com.br
**Logo:** [`public/logo-premium.svg`](public/logo-premium.svg)

## 1. Definição do produto

O **Projeta** é uma aplicação web para planejar, executar e comunicar projetos.
Ele conecta cronograma, tarefas, calendário de trabalho, anomalias e
indicadores executivos dentro de um workspace compartilhado.

Sua proposta é oferecer a precisão de um cronograma profissional sem exigir que
a equipe abandone a velocidade da operação diária. O produto é orientado a
projetos com dependências, turnos, feriados, mudanças de prazo e necessidade de
acompanhamento executivo.

O Projeta é uma SPA React hospedada na Vercel. A autenticação e os dados são
gerenciados pelo Supabase; portanto, o acesso autenticado depende de conexão
com o backend configurado.

## 2. Público-alvo

- Gerentes de projeto e planejadores.
- Engenheiros de planejamento e controle.
- Coordenadores de equipes de campo e de escritório.
- Técnicos e inspetores que registram anomalias pelo celular.
- Diretores e gestores que acompanham portfólios.

## 3. Objetivos do produto

1. Criar uma fonte única para o cronograma e a operação do projeto.
2. Representar dependências e calendários usando minutos úteis, não apenas datas corridas.
3. Tornar o acompanhamento diário rápido no Gantt, quadro e tabela.
4. Permitir o registro estruturado de anomalias em campo.
5. Dar aos gestores uma leitura executiva de prazo, avanço e risco.
6. Persistir os dados com isolamento por workspace e políticas RLS.
7. Permitir exportar backups JSON e relatórios imprimíveis.

## 4. Identidade do produto

- **Nome:** Projeta.
- **Assinatura:** Planejamento com clareza.
- **Marca gráfica:** `public/logo-premium.svg`.
- **Domínio oficial:** `projeta.richardvieira.com.br`.
- **Tom:** preciso, calmo, operacional e confiável.
- **Interface:** clara, responsiva, densa quando necessário e sem excesso de
  decoração que atrapalhe o planejamento.

## 5. Modelo de acesso

### Usuário

O usuário cria uma conta ou acessa por e-mail e senha usando o Supabase Auth.
Ao criar a conta, o sistema envia a confirmação para a URL configurada e cria
um perfil básico por trigger do banco.

### Workspace

No primeiro acesso autenticado, o sistema cria um workspace para o usuário e o
torna proprietário. O workspace possui nome e fuso horário.

### Isolamento

Projetos, tarefas e anomalias carregam `workspace_id`. As tabelas possuem RLS
e as políticas limitam leitura e escrita a membros autenticados do workspace;
operações administrativas de workspace ficam restritas ao proprietário.

Convites e membros estão previstos no schema (`workspace_members` e
`workspace_invites`), mas o fluxo completo de convite ainda não está exposto
na interface atual.

## 6. Navegação e shell

### Trilho global

O `AppRail` apresenta Portfólio, Anomalias, Relatórios e Configurações, além da
alternância de tema claro/escuro e da fixação do trilho expandido. Ele inicia
compacto, expande ao passar o mouse e pode ser fixado.

### Barra de contexto

O `TopBar` apresenta o contexto atual, seleção de projeto, abas do projeto,
busca/atalhos, estado de salvamento, exportação de backup e sessão.

As visões de projeto são: Visão Geral, Gantt, Quadro, Curva S e Anomalias.
Não há uma página de Tarefas separada: a grade do Gantt é a fonte operacional
para edição e planejamento das tarefas.

## 7. Requisitos funcionais

### 7.1 Portfólio

O usuário deve conseguir visualizar, criar, editar e excluir projetos. A tela
oferece cards, tabela e timeline, além de métricas de total, andamento,
progresso médio, proximidade de prazo, atraso e anomalias abertas.

Cada projeto exibe nome, descrição, status, progresso, período, saúde e
quantidade de anomalias abertas. Os status são Planejado, Em Andamento,
Concluído e Pausado.

### 7.2 Visão geral do projeto

Resume o projeto selecionado com estado do cronograma, progresso planejado e
realizado, Curva S resumida, próximas entregas, próximos marcos, anomalias,
período e status.

### 7.3 Tarefas e Gantt

Uma tarefa possui, no mínimo, nome, projeto, ordem, datas, duração derivada,
progresso, nível hierárquico, modo de agendamento, calendário e dependências.

O Gantt deve suportar:

- Hierarquia e tarefas-resumo.
- Edição inline de células.
- Inclusão, duplicação e exclusão de tarefas.
- Arraste da barra, redimensionamento e ajuste de progresso.
- Datas de início e término com hora, baseline e marcos.
- Filtros por texto, status, atraso e criticidade.
- Agrupamento e colunas configuráveis.
- Zoom contínuo, ajuste ao projeto e minimapa.
- Seleção individual e múltipla por checkbox, `⌘/Ctrl + clique`, `Shift +
  clique` e teclado, incluindo seleção de todas as tarefas visíveis na grade.
- Faixa contextual de edição em lote ao selecionar uma ou mais tarefas.
- Menu "Opções da tarefa" com submenus de calendário, modo de agendamento,
  progresso, detalhes e limpeza de seleção.
- Aplicação de calendário, modo ou progresso para várias tarefas em uma única
  operação de histórico; a mudança de calendário preserva a duração em
  minutos úteis e replaneja sucessoras automáticas quando necessário.
- Menu de contexto, copiar/colar e atalhos de teclado.
- Desfazer e refazer das alterações da sessão.

#### Faixa de comandos do Gantt

A faixa superior segue um modelo de comandos contextual, inspirado no fluxo do
MS Project sem replicar seu ribbon legado. Ela possui as abas Tarefa, Projeto,
Exibir e Formato. Os comandos são horizontais e compactos; ações de seleção
aparecem somente quando há tarefas selecionadas.

- **Tarefa:** criação, hierarquia, vínculos e linha de base.
- **Projeto:** informações, biblioteca de calendários e linha de base global.
- **Exibir:** escala, ajuste ao projeto, filtros, densidade e dados visíveis.
- **Formato:** rótulos, caminho crítico e folga das barras.

### 7.4 Motor de cronograma

O motor calcula o cronograma em minutos úteis:

- Dependências FS, SS, FF e SF com lag em dias úteis.
- Agendamento automático baseado em predecessoras.
- Agendamento manual que preserva a posição fixada e sinaliza conflitos.
- Restrição de início não anterior a uma data.
- Detecção de dependência circular.
- Forward pass e backward pass.
- Início/término mais cedo e mais tarde.
- Folga total e folga livre.
- Indicação de tarefas críticas e atrasadas.
- Rollup de progresso das tarefas-resumo.

O motor usa o calendário da tarefa quando definido e, caso contrário, o
calendário padrão do projeto.

### 7.5 Calendários

Cada projeto possui uma biblioteca de calendários. Um calendário contém nome,
dias úteis, um ou mais turnos de trabalho, intervalos de cada turno e feriados.

O painel de calendário é uma biblioteca de planejamento: mostra os
calendários do projeto em uma lista lateral, destaca o padrão e permite editar
o calendário aberto com resumo de jornada, dias úteis, turnos e feriados.

O usuário pode criar calendários a partir de presets, escolher o padrão, editar
turnos e feriados e definir o formato de exibição da duração. Uma tarefa sem
`calendar_id` herda o padrão do projeto; uma tarefa pode receber um calendário
individual pelo inspetor, pela coluna ou pela edição em lote.

As durações são sempre armazenadas e calculadas em minutos úteis. A preferência
de exibição não altera datas nem duração armazenada: ela apenas muda o rótulo.
Ao usar "Sempre em horas", um número digitado sem sufixo na duração representa
horas úteis; nos demais modos, representa dias úteis. A entrada explícita
aceita `3d`, `4h` e `90m` em todos os modos.

### 7.6 Quadro

O quadro exibe tarefas agrupadas por status. O usuário pode mover cartões entre
colunas; ao mover para Concluída, o progresso é atualizado para 100%.

### 7.7 Curva S

O produto exibe a evolução acumulada planejada versus realizada, ponderada pela
duração das tarefas. A tela permite selecionar o período, visualizar
indicadores e exportar os pontos para CSV.

O cálculo é centralizado em `src/utils/scurve.js` e reutilizado na visão geral
e nos relatórios.

### 7.8 Anomalias

O usuário registra e edita uma anomalia em quatro passos:

1. Identificação: título, severidade, tipo, responsável e tarefa.
2. Detalhes: descrição, OS, equipamento, localização, disciplina, causa raiz,
   ação corretiva e status.
3. Fotos: até cinco imagens, comprimidas antes do salvamento.
4. Revisão e salvamento.

As anomalias podem estar abertas, em análise, resolvidas ou canceladas. A
central global e a visão do projeto compartilham o formulário e a estrutura.

### 7.9 Relatórios e backup

Relatórios são preparados para papel A4 e impressão do navegador: status
executivo ou registro de anomalias. O backup JSON inclui projetos, tarefas e
anomalias do workspace, com data de exportação. A restauração automática ainda
não faz parte da interface.

### 7.10 Configurações

O usuário pode alternar tema, ver o estado do salvamento, exportar backup,
editar nome e status do projeto, configurar calendário e consultar informações
sobre o Projeta.

## 8. Dados e persistência

### Entidades

- `profiles`: perfil vinculado a `auth.users`.
- `workspaces`: unidade de isolamento, proprietário e fuso horário.
- `workspace_members`: membros e papéis.
- `workspace_invites`: convites preparados para evolução.
- `projects`: projeto, status, calendários e configurações.
- `tasks`: tarefas, datas, progresso, dependências e planejamento.
- `anomalies`: ocorrências, severidade, fotos e detalhes de campo.

### Regras de dados

- O banco é Supabase Postgres.
- Datas de tarefa são timestamps sem fuso para preservar o horário planejado.
- `depends_on` é JSON com id, tipo e lag.
- `schedule_mode` é `auto` ou `manual`.
- `calendar_id` seleciona o calendário da tarefa.
- Calendários e metadados são armazenados em JSONB.
- O navegador usa somente `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
- Chaves de service role nunca podem ser expostas no bundle.

## 9. Requisitos não funcionais

### Performance

- Virtualização de linhas e marcações da grade/timeline.
- Gradientes para fundos repetitivos da timeline, evitando um elemento DOM por dia.
- Alterações por arraste com o mínimo de re-renderizações.
- Compressão de imagens de anomalias no cliente.

### Responsividade

- Navegação e módulos principais funcionam em desktop e mobile.
- Formulário de anomalias confortável para uso em campo.
- Gantt utilizável em telas menores com rolagem e controles adequados.

### Acessibilidade

- Foco visível em controles interativos.
- Rótulo acessível para botões que exibem apenas ícones.
- Overlays com foco, Escape e papéis ARIA adequados.
- Contraste compatível com o tema selecionado.
- Operação por teclado nas interações principais do Gantt.
- Seleção em lote perceptível por checkbox, destaque de linha e contagem de
  tarefas selecionadas.
- Menus e submenus de ações em lote devem expor rótulos, estado desabilitado e
  foco por teclado.

### Segurança

- RLS habilitado nas tabelas de domínio.
- Isolamento sempre baseado em `workspace_id`.
- Nenhum segredo administrativo no frontend.
- Autenticação e sessão delegadas ao Supabase Auth.

## 10. Stack e estrutura

| Camada | Tecnologia |
|---|---|
| UI | React 18 |
| Build | Vite 5 |
| Estilos | Tailwind CSS v4, tokens CSS e CSS semântico |
| Componentes | Radix UI e componentes locais no padrão shadcn/ui |
| Ícones | Lucide React |
| Auth e banco | Supabase Auth, Postgres e RLS |
| Testes | Vitest |
| Deploy | Vercel |

```text
public/logo-premium.svg       Logo oficial Projeta
src/components/               Shell, formulários, dialogs e UI
src/context/AppContext.jsx    Estado global, auth e persistência
src/pages/                    Telas globais e de projeto
src/utils/                    Calendário, CPM, duração e dados
src/views/gantt/              Grade, timeline, filtros e minimapa
src/styles/                   Tokens, base, impressão e Gantt
supabase/migrations/          Schema e políticas RLS
vercel.json                   Build e fallback da SPA
```

## 11. Critérios de publicação

1. `npm run build` termina sem erro.
2. A Vercel usa `npm run build` e publica `dist`.
3. `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` e `VITE_SITE_URL` estão configuradas.
4. `projeta.richardvieira.com.br` está validado na Vercel.
5. O Supabase possui Site URL e Redirect URLs do domínio.
6. No domínio final são testados cadastro, confirmação de e-mail, login,
   logout, criação de projeto, salvamento de tarefa e carregamento posterior.

## 12. Fora do escopo atual e roadmap

- Convites de membros com fluxo completo de envio e aceite.
- Upload de fotos para Supabase Storage.
- Restauração de backup pela interface.
- Importação em lote por CSV/Excel.
- Nivelamento de recursos e sobrealocação.
- Múltiplas linhas de base.
- PWA e operação offline instalada.
- Indicadores de valor agregado e custo.
- Notificações e colaboração em tempo real.
