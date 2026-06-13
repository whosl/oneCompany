import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["**/dist/**", "**/.next/**", "**/node_modules/**"],
  },
  {
    // Allow intentionally-unused args/vars prefixed with "_".
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    // `.mjs` files are Node ESM scripts. Declare the Node globals they actually
    // use so `no-undef` does not flag them under the flat config. Note: CommonJS
    // globals (require/module/exports/__dirname/__filename) are intentionally
    // NOT declared — they don't exist in ESM, and declaring them would mask
    // real ReferenceErrors. ESM code uses `import.meta.url` + `fileURLToPath`
    // instead of __dirname.
    files: ["**/*.mjs"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
        URL: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        queueMicrotask: "readonly",
      },
    },
  },
);
