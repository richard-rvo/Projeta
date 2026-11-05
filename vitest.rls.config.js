import { defineConfig, loadEnv } from 'vite';

export default defineConfig({
  test: {
    include: ['tests/rls/**/*.test.js'],
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 60000,
    fileParallelism: false,
    env: loadEnv('test', process.cwd(), 'RLS_'),
  },
});
