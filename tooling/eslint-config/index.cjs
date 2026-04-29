// Shared ESLint config for the Packbreaker monorepo.
// Per-package boundaries are enforced via overrides below — a forbidden import
// fails CI, not code review (tech-architecture.md § 3).

/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  env: {
    es2022: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  ignorePatterns: [
    'node_modules',
    'dist',
    '.vite',
    '*.tsbuildinfo',
    '*.cjs',
    '*.config.js',
    '*.config.ts',
  ],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
    // Pre-ES6 hoisting rule. Strict-mode ESM TypeScript with let/const block
    // scoping makes this redundant — and the prototype's detectRecipes
    // (App.tsx, deferred to M1.3 split) legitimately declares a `function*`
    // generator inside a for-of loop.
    'no-inner-declarations': 'off',
  },
  overrides: [
    // ───────────────────────────────────────────────────────────────
    // packages/sim — strict determinism & isolation per § 4.1
    // ───────────────────────────────────────────────────────────────
    {
      files: ['packages/sim/**/*.ts'],
      env: { browser: false, node: false },
      rules: {
        'no-restricted-globals': [
          'error',
          { name: 'window', message: 'Sim must not access DOM (tech-architecture.md § 4.1).' },
          { name: 'document', message: 'Sim must not access DOM.' },
          { name: 'localStorage', message: 'Sim must be deterministic — no persistence.' },
          { name: 'sessionStorage', message: 'Sim must be deterministic — no persistence.' },
        ],
        'no-restricted-syntax': [
          'error',
          {
            selector: "MemberExpression[object.name='Math'][property.name='random']",
            message: 'Sim must use the seeded mulberry32 RNG, not Math.random.',
          },
          {
            selector: "MemberExpression[object.name='Date'][property.name='now']",
            message: 'Sim must be deterministic — Date.now() is forbidden. Use ticks.',
          },
          {
            selector: "NewExpression[callee.name='Date']",
            message: 'Sim must be deterministic — `new Date()` is forbidden. Use ticks.',
          },
          {
            selector: "MemberExpression[property.name='passiveStats']",
            message:
              'Sim must not read Item.passiveStats — it is run-controller-only (content-schemas.ts § 0).',
          },
        ],
        'no-restricted-imports': [
          'error',
          {
            paths: [
              {
                name: '@packbreaker/shared',
                message:
                  'Sim must not import @packbreaker/shared — shared types are content/sim-agnostic.',
              },
              { name: 'react', message: 'Sim must not import React.' },
              { name: 'react-dom', message: 'Sim must not import React.' },
              { name: 'phaser', message: 'Sim must not import Phaser.' },
              { name: 'fs', message: 'Sim must not import Node built-ins.' },
              { name: 'path', message: 'Sim must not import Node built-ins.' },
              { name: 'os', message: 'Sim must not import Node built-ins.' },
              { name: 'crypto', message: 'Sim must not import Node built-ins — use seeded RNG.' },
            ],
            patterns: [
              {
                group: ['@packbreaker/shared', '@packbreaker/shared/*'],
                message: 'Sim must not import @packbreaker/shared.',
              },
              {
                group: ['@packbreaker/ui-kit', '@packbreaker/ui-kit/*'],
                message: 'Sim must not import the React UI kit.',
              },
              { group: ['node:*'], message: 'Sim must not import Node built-ins.' },
            ],
          },
        ],
      },
    },

    // ───────────────────────────────────────────────────────────────
    // packages/sim/src/run — the run controller IS the legitimate
    // boundary that reads Item.passiveStats (content-schemas.ts § 0:
    // "run-controller-only"). Inherits all other sim restrictions
    // (no Math.random / Date.now / DOM / Node built-ins / shared imports)
    // by virtue of the broader packages/sim/** override above; this
    // narrower override only relaxes the passiveStats restriction by
    // re-listing the no-restricted-syntax entries minus that one.
    // ───────────────────────────────────────────────────────────────
    {
      files: ['packages/sim/src/run/**/*.ts'],
      rules: {
        'no-restricted-syntax': [
          'error',
          {
            selector: "MemberExpression[object.name='Math'][property.name='random']",
            message: 'Sim must use the seeded mulberry32 RNG, not Math.random.',
          },
          {
            selector: "MemberExpression[object.name='Date'][property.name='now']",
            message: 'Sim must be deterministic — Date.now() is forbidden. Use ticks.',
          },
          {
            selector: "NewExpression[callee.name='Date']",
            message: 'Sim must be deterministic — `new Date()` is forbidden. Use ticks.',
          },
          // passiveStats restriction intentionally omitted — run controller
          // composes Combatant.startingHp from Item.passiveStats.maxHpBonus
          // before invoking simulateCombat (M1.2.4).
        ],
      },
    },

    // ───────────────────────────────────────────────────────────────
    // packages/content — pure data + types, no outside imports
    // ───────────────────────────────────────────────────────────────
    {
      files: ['packages/content/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['@packbreaker/*'],
                message: 'Content imports nothing outside its own package — pure data + types.',
              },
              {
                group: ['react', 'react-dom', 'phaser', 'node:*', 'fs', 'path', 'os'],
                message: 'Content imports nothing outside its own package.',
              },
            ],
          },
        ],
      },
    },

    // ───────────────────────────────────────────────────────────────
    // packages/shared — type-only; sim/ui-kit/runtime forbidden.
    //   DEVIATION (M1.1): shared imports primitive ID + schema types from
    //   @packbreaker/content so TelemetryEvent / GhostBuild / LocalSaveV1
    //   port verbatim from content-schemas.ts §§ 12–15. See decision-log.md
    //   M1.1 entry. Direction is shared ← content only.
    // ───────────────────────────────────────────────────────────────
    {
      files: ['packages/shared/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            paths: [
              { name: 'react', message: 'Shared is type-only — no runtime deps.' },
              { name: 'react-dom', message: 'Shared is type-only — no runtime deps.' },
              { name: 'phaser', message: 'Shared is type-only — no runtime deps.' },
            ],
            patterns: [
              {
                group: ['@packbreaker/sim', '@packbreaker/sim/*'],
                message: 'Shared must not depend on sim.',
              },
              {
                group: ['@packbreaker/ui-kit', '@packbreaker/ui-kit/*'],
                message: 'Shared must not depend on ui-kit.',
              },
              { group: ['node:*', 'fs', 'path', 'os'], message: 'Shared must not import Node built-ins.' },
            ],
          },
        ],
      },
    },

    // ───────────────────────────────────────────────────────────────
    // apps/server — no client UI imports
    // ───────────────────────────────────────────────────────────────
    {
      files: ['apps/server/**/*.ts'],
      env: { node: true },
      rules: {
        'no-restricted-imports': [
          'error',
          {
            paths: [
              { name: 'react', message: 'Server must not import React.' },
              { name: 'react-dom', message: 'Server must not import React.' },
              { name: 'phaser', message: 'Server must not import Phaser.' },
              { name: '@packbreaker/ui-kit', message: 'Server must not import the UI kit.' },
            ],
            patterns: [
              {
                group: ['../../client/*', '@packbreaker/client', '@packbreaker/client/*'],
                message: 'Server must not import the client app.',
              },
              {
                group: ['@packbreaker/ui-kit', '@packbreaker/ui-kit/*'],
                message: 'Server must not import the UI kit.',
              },
            ],
          },
        ],
      },
    },
  ],
};
