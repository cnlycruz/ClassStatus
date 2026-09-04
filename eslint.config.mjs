import { FlatCompat } from "@eslint/eslintrc";
import { globalIgnores } from "eslint/config";

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
  resolvePluginsRelativeTo: import.meta.dirname,
});

export default [
  globalIgnores([
    ".next/**",
    "node_modules/**",
    "coverage/**",
    "dist/**",
    "build/**",
    "test-results/**",
    ".agents/**",
    ".codex/**",
    "next-env.d.ts",
  ]),
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];
