import { defineConfig } from "tsdown";

// Node >=22.5 loads a .ts tsdown config via native type-stripping (P28 addenda),
// so the ctx packages keep .ts configs while the legacy tk root config stays .mjs
// (its Node 20 floor cannot type-strip a .ts config).
//
// Asset copy (src/**/*.{sql,scm,wasm}) runs as a separate step AFTER tsdown in the
// `build` script, because `clean: true` wipes dist first. See scripts/copy-assets.mjs.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  outDir: "dist",
  clean: true,
  fixedExtension: false, // emit .js (not .mjs), matching the legacy tk build
  // dts is EXPLICITLY off: tsdown auto-enables it from the package.json `types`
  // field, but rolldown-plugin-dts 0.26 cannot load the repo's TypeScript
  // 7.0.1-rc (peer range ^5||^6). Types flow from source because the package
  // `exports` point at src/*.ts in the monorepo. Re-enable at publish time
  // (post-P13) once the dts plugin supports TS7.
  dts: false,
});
