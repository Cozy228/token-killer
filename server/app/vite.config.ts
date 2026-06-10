import { defineConfig } from "vite";

// SSR/Node build: bundle the app (hono, zod) into a single ESM file
// `dist/index.js` that exports `handler`. `pg` and the AWS SDK are kept external
// and installed into the Lambda image's node_modules (pg has dynamic requires
// that are happier unbundled; the AWS SDK is large and runtime-provided-ish).
export default defineConfig({
  build: {
    ssr: "src/index.ts",
    outDir: "dist",
    target: "node20",
    minify: false,
    emptyOutDir: true,
    // Single-file output: app deps (hono/zod) bundle in; pg + AWS SDK stay
    // external and are installed into the Lambda image.
    rollupOptions: {
      external: ["pg", /^@aws-sdk\//],
      output: {
        format: "es",
        entryFileNames: "index.js",
        codeSplitting: false,
      },
    },
  },
  ssr: {
    noExternal: true,
  },
});
