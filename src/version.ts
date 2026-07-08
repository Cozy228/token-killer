// `package.json`'s `version` is the single source of truth. tsdown's `define` replaces
// `__CTX_VERSION__` at build time with JSON.stringify(pkg.version) (see tsdown.config.mjs),
// so a real build bakes in a compile-time literal and the version chunk reads no files.
//
// Under tsx/vitest there is no `define`, so the identifier is undefined; ONLY then do we
// read package.json from disk (its layout is stable relative to this file). A real build
// never takes that branch — it is dead code there and dropped, keeping the hot path free
// of fs I/O. Mirrors the build-arg pattern in src/telemetry/endpoint.ts.
import { readFileSync } from "node:fs";

declare const __CTX_VERSION__: string | undefined;

export const VERSION: string =
  typeof __CTX_VERSION__ !== "undefined"
    ? __CTX_VERSION__
    : JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
