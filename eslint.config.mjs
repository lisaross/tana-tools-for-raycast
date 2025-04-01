export default [
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      jsx: true,
    },
    rules: {
      // Allow unused variables that start with underscore
      "@typescript-eslint/no-unused-vars": ["error", {
        "varsIgnorePattern": "^_",
        "argsIgnorePattern": "^_",
        "ignoreRestSiblings": true
      }]
    }
  }
]; 