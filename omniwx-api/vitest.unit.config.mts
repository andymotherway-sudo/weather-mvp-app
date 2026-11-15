import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('..', import.meta.url)),
  test: {
    include: ['omniwx-api/test/**/*.unit.spec.ts'],
    environment: 'node',
  },
});
