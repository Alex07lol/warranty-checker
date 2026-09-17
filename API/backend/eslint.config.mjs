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
