import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // הפקת PDF: Chromium נטען בזמן ריצה ולא נארז ב-bundle
  serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium"],
  // קבצים שנקראים מהדיסק בזמן ריצה – חייבים להיכלל בפריסה (Vercel / standalone)
  outputFileTracingIncludes: {
    "/api/exports/**": [
      "./node_modules/@fontsource/heebo/files/heebo-hebrew-400-normal.woff2",
      "./node_modules/@fontsource/heebo/files/heebo-hebrew-700-normal.woff2",
      "./node_modules/@fontsource/heebo/files/heebo-latin-400-normal.woff2",
      "./node_modules/@fontsource/heebo/files/heebo-latin-700-normal.woff2",
      "./node_modules/@sparticuz/chromium/bin/**",
    ],
  },
};

export default nextConfig;
