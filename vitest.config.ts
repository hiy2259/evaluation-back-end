import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: false },
    },
    isolate: true,
    fileParallelism: false,
  },
});
