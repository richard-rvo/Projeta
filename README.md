# Projeta

<p align="center">
  <img src="public/logo-premium.svg" alt="Logo Projeta" width="96" />
</p>

<p align="center"><strong>Planejamento com clareza.</strong></p>

<p align="center">O Projeta transforma calendário, tarefas e decisões em um cronograma confiável quando o projeto começa a mudar.</p>

<p align="center"><a href="https://projeta.richardvieira.com.br">Acessar o Projeta</a></p>

![Versão](https://img.shields.io/badge/Vers%C3%A3o-6.0-ff6b00)
![Stack](https://img.shields.io/badge/React-Vite-61dafb)
![Dados](https://img.shields.io/badge/Dados-Supabase-3ecf8e)

## O produto

O **Projeta** é uma aplicação web de gestão de projetos para transformar o
planejamento em uma operação diária: definir cronogramas, acompanhar avanço,
organizar tarefas, registrar anomalias e gerar uma visão executiva do trabalho.

O produto combina a precisão de um cronograma profissional com uma interface
rápida, responsiva e adequada a equipes que trabalham no escritório ou em campo.
O nome oficial do produto é **Projeta** e sua identidade usa a marca gráfica
presente em [`public/logo-premium.svg`](public/logo-premium.svg).

### Para quem é

- Gerentes de projetos e profissionais de planejamento e controle.
- Coordenadores de equipes de campo e de escritório.
- Engenheiros, técnicos e inspetores que registram ocorrências.
- Diretores que precisam acompanhar um portfólio de projetos.

## O que o Projeta faz

### Portfólio

- Métricas de quantidade, projetos em andamento, progresso médio, prazos e anomalias.
- Visualização em cards, tabela e timeline.
- Status: Planejado, Em Andamento, Concluído e Pausado.
- Criação, edição e exclusão de projetos.
- Saúde calculada a partir de prazo, progresso e anomalias abertas.

### Cronograma Gantt

- Tarefas hierárquicas com indentação e tarefas-resumo.
- Edição inline de nome, duração, datas, progresso e predecessoras.
- Arraste de tarefas, redimensionamento de duração e ajuste de progresso.
- Marcos, baseline, atraso, folga e indicação de hoje.
- Dependências FS, SS, FF e SF com defasagem.
- Agendamento automático ou manual por tarefa.
- Restrição de início e detecção de ciclos nas dependências.
- Calendários por projeto e por tarefa, com dias úteis, turnos e feriados.
- Duração em minutos úteis, com entrada em dias, horas e minutos.
- Caminho crítico, folga total/livre e cálculos de avanço.
- Filtros, agrupamento, colunas configuráveis, zoom e minimapa.
- Navegação por teclado, desfazer/refazer e menu de contexto.

### Visão geral do projeto

Resume o estado do projeto com métricas, período, próximas entregas, próximos
marcos, anomalias abertas e Curva S.

### Quadro e tarefas

O Quadro apresenta as tarefas por status e permite arrastá-las entre colunas.
Ao mover uma tarefa para Concluída, o progresso é atualizado para 100%.

### Curva S

Compara o progresso planejado e realizado ao longo do tempo, ponderado pela
duração das tarefas. Permite escolher o período, visualizar indicadores e
exportar os pontos em CSV.

### Anomalias

Central global e tela por projeto para registrar ocorrências de campo em quatro
passos, com experiência adequada ao celular:

- Identificação, severidade, tipo, responsável e tarefa relacionada.
- Descrição, ordem de serviço, equipamento, localização, disciplina, causa
  raiz e ação corretiva.
- Status aberta, em análise, resolvida ou cancelada.
- Até cinco fotos capturadas pela câmera ou selecionadas do dispositivo.
- Compressão das imagens antes do salvamento.

### Relatórios

Gera uma pré-visualização A4 para impressão do navegador: relatório de status
executivo, com KPIs, Curva S, cronograma e anomalias, ou registro de anomalias
com detalhes e fotos. O PDF é obtido por `window.print()`.

### Workspace, autenticação e dados

- Cadastro e login por e-mail e senha via Supabase Auth.
- Workspace criado automaticamente no primeiro acesso.
- Projetos, tarefas e anomalias persistidos no Supabase Postgres.
- RLS separando os dados por workspace e restringindo acesso aos membros.
- Nome e fuso horário configuráveis no workspace.
- Backup JSON exportável pelo aplicativo.
- Tema claro/escuro e fixação do menu lateral como preferências da sessão.

As fotos são comprimidas no navegador e persistidas junto ao registro da
anomalia. O projeto ainda não usa Supabase Storage para fotos.

## Identidade e interface

- Nome: **Projeta**.
- Assinatura: **Planejamento com clareza**.
- Domínio: [`projeta.richardvieira.com.br`](https://projeta.richardvieira.com.br).
- Logo: [`public/logo-premium.svg`](public/logo-premium.svg).
- Interface responsiva, com foco em desktop e experiência adaptada para campo.
- Trilho global para Portfólio, Anomalias, Relatórios e Configurações.
- Navegação contextual por projeto para Visão Geral, Gantt, Quadro, Curva S e Anomalias.
- Design system baseado em tokens, Tailwind CSS e componentes Radix/shadcn.
- Ícones Lucide e foco visível para navegação por teclado.

## Arquitetura técnica

- **Frontend:** React 18.
- **Build:** Vite 5.
- **Estilos:** Tailwind CSS v4, tokens CSS e CSS semântico para a grade/timeline.
- **Componentes:** Radix UI e componentes locais no padrão shadcn/ui.
- **Ícones:** Lucide React.
- **Dados:** Supabase Postgres, Auth e RLS.
- **Testes:** Vitest para calendário, duração, dependências, agendamento,
  estado de tarefa e Curva S.
- **Publicação:** Vercel como SPA, com saída `dist` e fallback em `vercel.json`.

## Como executar localmente

### Pré-requisitos

- Node.js e npm.
- Projeto Supabase configurado com a migração em
  `supabase/migrations/20260821000000_workspace_schema.sql`.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Acesse `http://localhost:5174`. A porta usa `strictPort` para evitar que o
desenvolvimento troque silenciosamente a origem local.

### Variáveis de ambiente

```text
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anon-publica
VITE_SITE_URL=https://projeta.richardvieira.com.br
```

Somente valores públicos podem ser expostos ao frontend. Nunca use
`SUPABASE_SERVICE_ROLE_KEY` em uma variável `VITE_` ou no código do navegador.

## Publicação na Vercel

O repositório já contém a configuração para uma SPA Vite:

- **Install Command:** `npm install`
- **Build Command:** `npm run build`
- **Output Directory:** `dist`

Configure `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` e `VITE_SITE_URL` em
**Project Settings → Environment Variables** nos ambientes desejados.

Para `projeta.richardvieira.com.br`:

1. Adicione o subdomínio em **Vercel → Project → Settings → Domains**.
2. Crie no provedor DNS o CNAME exibido pela Vercel para o host `projeta`.
3. Aguarde a validação do domínio e do certificado SSL.
4. No Supabase, defina a Site URL como `https://projeta.richardvieira.com.br`
   e adicione `https://projeta.richardvieira.com.br/**` aos Redirect URLs.

Consulte [`vercel.json`](vercel.json) e [`supabase/README.md`](supabase/README.md).

## Estrutura principal

```text
Projeta/
├── public/logo-premium.svg       # Logo oficial
├── src/
│   ├── components/               # Shell, dialogs, UI e formulários
│   ├── context/AppContext.jsx    # Estado, autenticação e persistência
│   ├── pages/                    # Portfólio, Gantt e relatórios
│   ├── utils/                    # Calendário, CPM, duração e dados
│   ├── views/gantt/              # Grade, timeline, filtros e minimapa
│   └── styles/                   # Tokens, base, impressão e Gantt
├── supabase/migrations/          # Schema e políticas RLS
├── index.html                    # Metadados e entrada da SPA
├── vercel.json                   # Build e fallback da Vercel
└── package.json                  # Scripts e dependências
```

## Scripts

```bash
npm run dev       # desenvolvimento em localhost:5174
npm run build     # build de produção em dist/
npm run preview   # pré-visualização em localhost:5174
npm test          # suíte Vitest
```

## Limites atuais e próximos passos

- Não existe PWA/service worker para uso offline instalado.
- Convites de membros estão previstos no schema, mas não têm fluxo completo na interface.
- Fotos ainda não usam Supabase Storage.
- Relatórios dependem da impressão do navegador.
- Importação em lote, recursos/sobrealocação e valor agregado ainda são evoluções.
