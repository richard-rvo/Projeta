# 📊 Gantt Dinâmico - React

Sistema web executivo, dinâmico e responsivo para gestão visual avançada de múltiplos projetos e atividades. Desenvolvido com padrão de design state-of-the-art e inspirado em ferramentas líderes da indústria como **MS Project**, **Linear** e **Asana**.

![Versão](https://img.shields.io/badge/Vers%C3%A3o-6.0-ff4757)
![Tecnologia](https://img.shields.io/badge/Tech-React%20%7C%20Vite%20%7C%20Supabase-1c7ed6)
![Design System](https://img.shields.io/badge/UI%2FUX-Glassmorphism%20%2F%20Dark%20Mode-2f9e44)

---

## 🚀 Principais Funcionalidades

### 1. 📅 Gráfico Gantt (Estilo MS Project)
- **Planilha Integrada**: Painel esquerdo em formato de tabela com colunas de `#`, Nome, Duração, Início, Término, Progresso (`%`) e Predecessoras (`Pred.`).
- **Edição Inline Rápida**: Clique duplo em qualquer célula da planilha para editar os valores instantaneamente.
- **Linha do Tempo Dinâmica**: Gráfico na direita com scroll sincronizado e auto-foco na data de hoje ao abrir.
- **Drag & Drop**:
  - Arraste tarefas pela planilha para **reordená-las**.
  - Arraste a barra na linha do tempo para **alterar a data**.
  - Arraste a borda direita da barra para **redimensionar a duração**.

### 2. 🔗 Sistema de Vínculos e Predecessoras
- **Roteamento Inteligente**: Setas de dependência desenhadas com algoritmo ortogonal, cantos suavizados e cálculo inteligente para não sobrepor barras.
- **Prevenção de Erros**: O algoritmo filtra dependências circulares e calcula automaticamente rotas para trás (backward) de forma elegante.

### 3. 📈 Motor Avançado de Curva S
- **Progresso Acumulado**: Geração real de Curva S clássica de gerenciamento de projetos.
- **Planejado vs Realizado**: Gráfico de linha dupla que compara o progresso matemático esperado no tempo (Azul) contra o progresso realizado (Verde).
- **Indicadores de Desvio**: Painel com cartões que mostram o "Planejado até Hoje", "Realizado Atual" e a margem de **Desvio** (ex: `+13% Adiantado`).

### 4. 🗄️ Persistência compartilhada (Supabase)
- Projetos, tarefas e anomalias são salvos no workspace Supabase.
- Autenticação, membros e permissões são aplicados no banco por RLS.

### 5. ✨ Design Glassmorphism e Temas
- Interface responsiva utilizando painéis de vidro translúcido (`backdrop-filter`).
- Botão flutuante para **Alternância de Tema (Light / Dark Mode)**.

---

## 🛠️ Tecnologias Utilizadas

- **React 18+**: Framework UI para componentes reativos.
- **Vite**: Bundler ultra-rápido para desenvolvimento.
- **CSS Nativo**: Variáveis CSS e Design System customizado (sem frameworks para máximo controle).
- **Lucide React**: Ícones minimalistas de alta precisão.
- **Supabase**: Auth, Postgres, Storage e RLS para o workspace.

---

## 💻 Como Executar Localmente

### Pré-requisitos
- Ter o [Node.js](https://nodejs.org/) instalado.

### Instalação e Execução
1. Abra o terminal na pasta do projeto:
```bash
cd "/Users/richardvieira/Developer/Gantt Dinamico"
```
2. Instale as dependências:
```bash
npm install
```
3. Inicie o servidor de desenvolvimento:
```bash
npm run dev
```
4. Acesse no navegador: `http://localhost:5174`

> ⚠️ **A porta padrão é 5174.** O app usa Supabase como fonte oficial de dados;
> a porta não define o banco de projetos.
>
> Por isso `vite.config.js` usa `strictPort: true`: se a 5174 estiver ocupada, o
> Vite falha avisando em vez de subir noutra porta e trocar de banco. Se der esse
> erro, é um `npm run dev` esquecido — derrube com `lsof -ti:5174 | xargs kill`.

## Publicação na Vercel

O projeto já está configurado para publicação como uma SPA Vite. Na Vercel,
importe este repositório e use os valores padrão abaixo:

- **Build Command:** `npm run build`
- **Output Directory:** `dist`
- **Install Command:** `npm install`

Configure também estas variáveis em **Project Settings → Environment Variables**
para os ambientes Production, Preview e Development:

```text
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anon-publica
```

Use somente a chave anon pública no frontend. Nunca configure
`SUPABASE_SERVICE_ROLE_KEY` ou outra credencial administrativa em uma variável
`VITE_`.

---

## 📁 Estrutura do Projeto

```
Gantt Dinamico/
├── src/
│   ├── components/    # Componentes UI (Sidebar, Modals, Toasts)
│   ├── context/       # AppContext para estado global (React Context)
│   ├── pages/         # Telas (PageProjects, PageGantt, PageSCurve)
│   ├── utils/         # Helpers (cálculo de datas e integração Supabase)
│   ├── index.css      # Design System Global
│   └── App.jsx        # Roteamento e Layout Base
├── index.html         # Entry point do Vite
├── package.json       # Dependências
└── vite.config.js     # Configuração do Bundler
```
