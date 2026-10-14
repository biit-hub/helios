import type { NextConfig } from "next";
const config: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: process.cwd() + "/../..",
  transpilePackages: ["@helios/backend", "@helios/contracts", "@helios/ui"],
  poweredByHeader: false,
  serverExternalPackages: ["argon2", "better-auth"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};
export default config;
