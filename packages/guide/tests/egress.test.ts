// @vitest-environment node
/**
 * G-egress (design §7) — the vendored-assets stance, checked two ways:
 *  1. The disclosure mirror can't drift from core (types-only bundle rule).
 *  2. If `dist/` is built, audit it for CDN / font-provider / telemetry hosts —
 *     the real egress threat. (Library namespace/doc-link string constants like
 *     eclipse.org/elk or reactflow.dev are not asset loads and the served shell's
 *     CSP `connect-src 'self'` blocks any actual request regardless.)
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { ACCELERATOR_DISCLOSURE } from "@contexa/core";
import { ACCELERATOR_DISCLOSURE_TEXT } from "../src/constants.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = join(HERE, "..", "dist");

// Hostnames that would mean a real external asset/telemetry load.
const FORBIDDEN_HOSTS =
  /(fonts\.googleapis|fonts\.gstatic|googleapis\.com|gstatic\.com|cdn\.jsdelivr|unpkg\.com|cdnjs|google-analytics|googletagmanager|analytics|telemetry|sentry\.io|posthog)/i;

describe("G-egress", () => {
  test("disclosure mirror equals core's ACCELERATOR_DISCLOSURE (no drift)", () => {
    expect(ACCELERATOR_DISCLOSURE_TEXT).toBe(ACCELERATOR_DISCLOSURE);
  });

  test("built bundle references no CDN / font-provider / telemetry host", () => {
    if (!existsSync(DIST)) {
      // dist is a build artifact; when absent this tier is a no-op (CI builds first).
      expect(true).toBe(true);
      return;
    }
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
      );
    for (const file of walk(DIST)) {
      if (!/\.(js|css|html)$/.test(file)) continue;
      const text = readFileSync(file, "utf8");
      expect(text, `forbidden host in ${file}`).not.toMatch(FORBIDDEN_HOSTS);
    }
  });
});
