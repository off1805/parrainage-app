import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Les fichiers e2e partagent une seule base : ils ne peuvent pas tourner
    // en parallèle (chaque fichier vide les tables au début de ses tests).
    fileParallelism: false,
    setupFiles: ['./test/setup-e2e.ts'],
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
