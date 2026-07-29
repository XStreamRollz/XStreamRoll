// Shared ESLint flat config for the XStreamRoll monorepo.
// Uses @typescript-eslint for TypeScript parsing across all packages.
// Plugin: eslint-plugin-import for `import/order` enforcement (#403).

const ignores = [
  "**/node_modules/**",
  "**/dist/**",
  "**/dist-esm/**",
  "**/build/**",
  "**/.next/**",
  "**/coverage/**",
  "**/*.d.ts",
  "**/*.config.js",
  "**/*.config.mjs",
  "**/next-env.d.ts",
  "**/stryker-tmp/**",
]

const tsParser = require("@typescript-eslint/parser")
const tsPlugin = require("@typescript-eslint/eslint-plugin")
const importPlugin = require("eslint-plugin-import")

module.exports = [
  {
    ignores,
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        // Node
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        module: "readonly",
        require: "readonly",
        exports: "readonly",
        global: "readonly",
        // Browser / DOM
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        fetch: "readonly",
        crypto: "readonly",
        Response: "readonly",
        RequestInit: "readonly",
        Request: "readonly",
        // Common test
        describe: "readonly",
        it: "readonly",
        test: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
        jest: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      import: importPlugin,
    },
    settings: {
      "import/resolver": {
        node: {
          extensions: [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"],
        },
      },
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "no-console": "off",
      eqeqeq: ["error", "always", { null: "ignore" }],
      // Issue #403: enforce consistent import ordering across the
      // monorepo. Groups run in order so a missing newline gap is
      // flagged consistently. `newlines-between: "always"` mirrors
      // the gap style used in this codebase.
      //
      // Set to "warn" rather than "error" so a passing lint is the
      // natural CI signal but existing files that haven't been
      // autofixed won't block the pipeline — `npm run lint:fix`
      // applies the fix in-place. Over time we will tighten this
      // to "error" once the codebase is fully ordered.
      "import/order": [
        "warn",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            ["parent", "sibling", "index"],
            "type",
          ],
          "newlines-between": "always",
          alphabetize: {
            order: "asc",
            caseInsensitive: true,
          },
        },
      ],
    },
  },
  {
    files: ["**/*.{js,jsx,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        process: "readonly",
        console: "readonly",
        module: "readonly",
        require: "readonly",
        exports: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        global: "readonly",
      },
    },
    rules: {
      "no-unused-vars": "off",
      "no-undef": "off",
      "no-empty": ["warn", { allowEmptyCatch: true }],
      "no-console": "off",
      "prefer-const": "warn",
      eqeqeq: ["error", "always", { null: "ignore" }],
    },
  },
]
