import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

// Files that still contain narrowing type assertions from before the rule
// existed. The rule is an error everywhere else, so new code cannot add one.
// This list must only ever shrink.
const ASSERTION_BASELINE = [
  'games/mahjong-trainer/src/reasons.test.ts',
  'games/mahjong/src/HandEndScreen.test.tsx',
  'games/mahjong/src/Mahjong.tsx',
  'games/mahjong/src/board/FanPatternGuide.test.tsx',
  'games/mahjong/src/board/FanPatternGuide.tsx',
  'games/poker/src/Poker.tsx',
  'games/president/src/President.tsx',
  'games/reversi/src/Reversi.tsx',
  'games/sheng-ji/src/ShengJi.tsx',
  'history/src/api.ts',
  'packages/engines/mahjong-analysis/src/test-helpers.ts',
  'packages/engines/mahjong/src/ai/standard.test.ts',
  'packages/engines/mahjong/src/assertValidGameState.test.ts',
  'packages/engines/mahjong/src/game/claim.test.ts',
  'packages/engines/mahjong/src/game/claim.ts',
  'packages/engines/mahjong/src/game/deal.test.ts',
  'packages/engines/mahjong/src/game/deal.ts',
  'packages/engines/mahjong/src/game/getAvailableActions.test.ts',
  'packages/engines/mahjong/src/game/outcome.ts',
  'packages/engines/mahjong/src/game/turn.ts',
  'packages/engines/mahjong/src/hand/counts.ts',
  'packages/engines/mahjong/src/hand/test-helpers.ts',
  'packages/engines/mahjong/src/hand/winning-patterns/standard.ts',
  'packages/engines/mahjong/src/simulation.ts',
  'packages/engines/mahjong/src/tiles/tile-kind.ts',
  'packages/engines/poker/src/engine.ts',
  'packages/engines/president/src/engine.test.ts',
  'packages/engines/reversi/src/engine.test.ts',
  'packages/engines/sheng-ji/src/engine.test.ts',
  'packages/game-client/src/useGameSocket.ts',
  'packages/game-core/src/games.test.ts',
  'packages/game-core/src/games.ts',
  'packages/game-core/src/gateway.test.ts',
  'packages/game-core/src/gateway.ts',
  'packages/game-core/src/http.ts',
  'packages/game-core/src/options.ts',
  'packages/game-core/src/postgresStore.ts',
  'packages/game-core/src/replay.test.ts',
  'packages/game-core/src/replay.ts',
  'packages/game-core/src/reversi.integration.test.ts',
  'packages/game-core/src/review.test.ts',
  'packages/game-core/src/review.ts',
  'packages/game-core/src/rooms.test.ts',
  'packages/game-core/src/rooms.ts',
  'packages/game-core/src/socket.ts',
  'packages/game-core/src/store.test.ts',
  'packages/game-core/src/store.ts',
  'packages/game-core/src/timers.test.ts',
  'packages/game-core/src/window.test.ts',
];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      'dist/**',
      '.state/**',
      'snapshots/**',
      'games/fps/**',
      'eslint.config.js',
      // Pre-existing: the root tsconfig does not pick this file up, so
      // `npm run typecheck` never sees it either and a type-aware rule cannot
      // parse it. Tracked separately; remove this entry once it is in the
      // project.
      'packages/game-client/src/Leaderboard.tsx',
    ],
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [tseslint.configs.base],
    // The react-hooks rules are registered but off, so their existing disable
    // directives correctly report as unused. Do not flag them.
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    // Registered so the existing react-hooks disable directives resolve. Its
    // rules stay off; enabling them is a separate change.
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      parserOptions: {
        // The root tsconfig is the single project, matching `npm run typecheck`.
        project: ['./tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unsafe-type-assertion': 'error',
    },
  },
  {
    files: ASSERTION_BASELINE,
    rules: {
      '@typescript-eslint/no-unsafe-type-assertion': 'off',
    },
  },
);
