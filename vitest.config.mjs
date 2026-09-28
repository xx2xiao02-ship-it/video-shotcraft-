import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    include: ['assets/lib/helpers/__tests__/**/*.test.ts'],
  },
});
