import sonarjs from "eslint-plugin-sonarjs";

export default [
  sonarjs.configs.recommended,
  {
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: {
        process: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        AbortController: "readonly",
        AbortSignal: "readonly",
        fetch: "readonly"
      }
    },
    rules: {
      "sonarjs/cognitive-complexity": "off" // Style preference, let's keep it advisory
    }
  },
  {
    // The corpus/eval scripts are developer tooling (scripts/ocr-corpus.mjs,
    // scripts/ocr-eval.mjs): readability beats formal complexity limits there,
    // and their long keyword regexes are the point — they encode the vocabulary
    // real documents print.
    files: ["scripts/**"],
    rules: {
      "sonarjs/cognitive-complexity": "off",
      "sonarjs/no-nested-conditional": "off",
      "sonarjs/regex-complexity": "off"
    }
  },
  {
    files: ["public/js/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: {
        window: "readonly",
        document: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        fetch: "readonly",
        FormData: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly"
      }
    },
    rules: {
      "sonarjs/no-unused-vars": "off", // Classic scripts declare functions for HTML onclick
      "sonarjs/cognitive-complexity": "off"
    }
  },
  {
    ignores: ["node_modules/**", "coverage/**", "tests/**"]
  }
];
