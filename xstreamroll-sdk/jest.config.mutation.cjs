// Minimal Jest config dedicated to the Stryker mutation runner.
// Reuses the same test files as `npm test` but without the surface
// area that would slow Stryker down (coverage reports, coverage
// threshold). Kept separate so the regular `npm test` workflow is
// untouched (#389).

module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.ts"],
  transformIgnorePatterns: ["/node_modules/", "/dist/", "/dist-esm/"],
  testTimeout: 30000,
}
