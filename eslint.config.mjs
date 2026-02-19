import nextVitals from "eslint-config-next/core-web-vitals"
import nextTypescript from "eslint-config-next/typescript"

const baseConfig = [
  ...nextVitals,
  ...nextTypescript,
]

const config = [
  ...baseConfig,
  {
    ignores: [
      "scripts/**/*.cjs",
      "components/ui/**",
      "hooks/use-toast.ts",
      "tailwind.config.ts",
      "types/**/*.d.ts",
      ".next/**",
      "node_modules/**",
    ],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "prefer-const": "warn",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
    },
  },
]

export default config
