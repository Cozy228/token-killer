import { defineConfig } from "tsdown";

// Node >=22.5 loads a .ts tsdown config via native type-stripping (P28 addenda).
// The `@ctx/core` workspace dep is bundled (its exports point at source TS until
// P13 naming + publish shape land).
export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  outDir: "dist",
  clean: true,
  fixedExtension: false, // emit dist/cli.js, matching the `bin` path
});
