import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

/* ═══════════════════════════════════════════════════════════════
   A PORTA É PARTE DOS DADOS — não mude sem ler isto
   ═══════════════════════════════════════════════════════════════

   Este app é local-first: todo cronograma vive no IndexedDB do
   navegador. E IndexedDB é isolado por ORIGEM — que é
   (esquema, host, PORTA).

   Ou seja, localhost:5173 e localhost:5174 são dois bancos separados
   que não se enxergam. Trocar a porta não perde nada, mas esconde
   tudo: o app abre vazio, como se os dados tivessem sumido.

   Foi o que aconteceu. Sem `strictPort`, a porta era só uma
   PREFERÊNCIA: com 5174 ocupada por um `npm run dev` esquecido, o
   Vite subia na próxima livre em silêncio, e o cronograma "sumia".

   5174 é a origem que guarda o cronograma real deste ambiente.
   `strictPort` faz o Vite FALHAR se ela estiver ocupada, em vez de
   escorregar para outra e trocar de banco. O erro é a informação
   útil: existe um servidor esquecido de pé.

   `preview` usa a mesma porta de propósito. No padrão (4173) ele
   seria outra origem, e conferir o build de produção mostraria um
   app vazio — o mesmo susto por outra porta.
   ═══════════════════════════════════════════════════════════════ */
const PORT = 5174;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, '');

  return {
  plugins: [react(), tailwindcss()],
  define: {
    /* Only the public Supabase values are exposed to the browser.
       SUPABASE_SERVICE_ROLE_KEY is intentionally never injected. */
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(
      env.VITE_SUPABASE_URL || env.SUPABASE_URL || ''
    ),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(
      env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || ''
    ),
  },
  resolve: {
    alias: {
      '@': path.resolve(rootDir, './src'),
    },
  },
  server: {
    port: PORT,
    strictPort: true,
    open: true,
  },
  preview: {
    port: PORT,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
  },
  test: {
    exclude: ['node_modules/**', 'dist/**', 'tests/rls/**', '.worktrees/**', '.superpowers/**'],
  },
  };
});
