import next from "eslint-config-next/core-web-vitals";
import ts from "eslint-config-next/typescript";
const config = [
  { settings: { next: { rootDir: "apps/web" } } },
  ...next,
  ...ts,
  {
    ignores: [
      "**/.next/**",
      "**/dist/**",
      "**/node_modules/**",
      "playwright-report/**",
      "test-results/**",
      "**/next-env.d.ts",
    ],
  },
  {
    settings: { next: { rootDir: "apps/web" } },
    files: ["packages/contracts/**/*.{ts,tsx}", "packages/ui/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "@helios/backend",
            "@helios/backend/*",
            "node:*",
            "pg",
            "pg-boss",
            "drizzle-orm*",
          ],
        },
      ],
    },
  },
];
config.push({
  files: ["packages/ui/**/*.{ts,tsx}"],
  rules: { "@next/next/no-html-link-for-pages": "off" },
});
export default config;
