import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['backend/tests/**/*.test.js', 'frontend/tests/**/*.test.js'],
    environment: 'node',
  },
});
