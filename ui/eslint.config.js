// ESLint for the app: the windows' code as browser modules, the main process and preloads as Node
// (CommonJS), the shared modules for both, tests and scripts as Node modules.
const js = require('@eslint/js');
const globals = require('globals');

const rules = {
  'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
  'no-empty': ['error', { allowEmptyCatch: true }],
};

module.exports = [
  { ignores: ['node_modules/', 'dist/', 'assets/', 'renderer/emoji-data.js'] },
  js.configs.recommended,
  { files: ['renderer/**/*.js'], languageOptions: { sourceType: 'module', globals: { ...globals.browser } }, rules },
  // the windows loaded as plain scripts, not modules
  { files: ['renderer/osd.js', 'renderer/emoji.js', 'renderer/btpop.js'], languageOptions: { sourceType: 'script', globals: { ...globals.browser, EMOJI: 'readonly' } }, rules },
  { files: ['shared/**/*.mjs'], languageOptions: { sourceType: 'module', globals: { ...globals.browser, ...globals.node } }, rules },
  { files: ['*.js', 'main/**/*.js', 'build/**/*.js'], languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } }, rules },
  { files: ['test/**/*.mjs', 'scripts/**/*.mjs'], languageOptions: { sourceType: 'module', globals: { ...globals.node } }, rules },
];
