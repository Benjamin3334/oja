import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

// eslint-config-next 15 ships eslintrc-style config objects, not flat-config
// arrays. FlatCompat adapts them for ESLint 9's flat config, which is what the
// Next 15 scaffold does too. (The file create-next-app generated here targeted
// Next 16, whose eslint-config-next exports flat arrays directly.)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [".next/**", "out/**", "build/**", "next-env.d.ts"],
  },
];

export default eslintConfig;
