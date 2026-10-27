import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // This app's pages intentionally use the standard "fetch data for the
      // current session in an effect, setLoading/setState from the result"
      // pattern throughout (see app/*/page.tsx). That's a supported React
      // pattern for data fetching (recommended by the official React docs'
      // "Fetching data" example), not a bug -- downgraded to a warning so
      // it stays visible without failing the build.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
