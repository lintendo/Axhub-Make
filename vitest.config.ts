import { defineConfig } from 'vitest/config';

const coverageScope = process.env.AXHUB_MAKE_COVERAGE_SCOPE || 'all';
const coverageInclude = coverageScope === 'server'
  ? ['src/server/**/*.{ts,tsx}']
  : ['src/**/*.{ts,tsx}'];

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/**/*.test.ts',
      'scripts/client-template-production/**/*.test.mjs',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary'],
      reportsDirectory: coverageScope === 'server' ? 'coverage/server' : 'coverage',
      include: coverageInclude,
      exclude: [
        'src/**/*.test.ts',
        'src/**/__tests__/**',
        'src/**/*.d.ts',
      ],
    },
  },
});
