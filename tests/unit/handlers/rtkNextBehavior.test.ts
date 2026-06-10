import { describe, expect, test } from "vitest";

import { extractTime } from "../../../src/handlers/js/next.js";
import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK next behavior", () => {
  // RTK: js/next_cmd.rs::test_filter_next_build — the exact fixture from the RTK
  // unit test. Asserts the build summary header, the route count line, bundle
  // extraction, and that verbose "Creating an optimized" chatter is stripped.
  test("summarizes build routes and bundles while stripping optimization chatter", async () => {
    const result = await filterRtkOutput(
      ["next", "build"],
      [
        "",
        "   ▲ Next.js 15.2.0",
        "",
        "   Creating an optimized production build ...",
        "✓ Compiled successfully",
        "✓ Linting and checking validity of types",
        "✓ Collecting page data",
        "○ /                            1.2 kB        132 kB",
        "● /dashboard                   2.5 kB        156 kB",
        "○ /api/auth                    0.5 kB         89 kB",
        "",
        "Route (app)                    Size     First Load JS",
        "┌ ○ /                          1.2 kB        132 kB",
        "├ ● /dashboard                 2.5 kB        156 kB",
        "└ ○ /api/auth                  0.5 kB         89 kB",
        "",
        "○  (Static)  prerendered as static content",
        "●  (SSG)     prerendered as static HTML",
        "λ  (Server)  server-side renders at runtime",
        "",
        "✓ Built in 34.2s",
        "",
      ].join("\n"),
    );

    // RTK test_filter_next_build assertions, verbatim.
    expect(result.output).toContain("Next.js Build");
    expect(result.output).toContain("routes");
    expect(result.output).not.toContain("Creating an optimized");

    // RTK-faithful exact render: header + separator, route summary
    // (3 static / 2 dynamic legend+route lines + 1 λ = 6 total), bundles sorted
    // by total descending with >10% growth markers, and the time/status line.
    const expected = [
      "Next.js Build",
      "═══════════════════════════════════════",
      "6 routes (3 static, 2 dynamic)",
      "",
      "Bundles:",
      "  /dashboard                        156 kB [warn] (+6140%)",
      "  /                                 132 kB [warn] (+10900%)",
      "  /api/auth                          89 kB [warn] (+17700%)",
      "",
      "Time: 34.2s | Errors: 0 | Warnings: 0",
    ].join("\n");

    expectRtkParity(result, {
      critical: [
        "Next.js Build",
        "6 routes (3 static, 2 dynamic)",
        "/dashboard",
        "Time: 34.2s | Errors: 0 | Warnings: 0",
      ],
      forbidden: [
        /Creating an optimized/,
        /Compiled successfully/,
        /Collecting page data/,
        /First Load JS/,
      ],
      exact: expected,
    });
  });

  // RTK: js/next_cmd.rs::test_extract_time — the build time is pulled from a
  // "<number><s|ms>" pattern. Exercise the same line through the real filter so
  // the "Time:" segment proves extract_time parity end to end.
  test("extracts build time from a compiled/built line", async () => {
    const result = await filterRtkOutput(
      ["next", "build"],
      [
        "   ▲ Next.js 15.2.0",
        "   Creating an optimized production build ...",
        "✓ Compiled successfully",
        "○ /                            1.2 kB        132 kB",
        "● /dashboard                   2.5 kB        156 kB",
        "○ /settings                    0.8 kB         95 kB",
        "○ /api/health                  0.3 kB         70 kB",
        "Compiled in 1250ms",
      ].join("\n"),
    );

    expect(result.output).toContain("Time: 1250ms |");

    expectRtkParity(result, {
      critical: ["Next.js Build", "Time: 1250ms |"],
      forbidden: [/Creating an optimized/, /Compiled successfully/],
    });
  });

  // RTK: js/next_cmd.rs::test_extract_time — unit coverage of the exact three
  // cases asserted in the Rust test (seconds, milliseconds, no match).
  test("extractTime mirrors RTK extract_time cases", () => {
    expect(extractTime("Built in 34.2s")).toBe("34.2s");
    expect(extractTime("Compiled in 1250ms")).toBe("1250ms");
    expect(extractTime("No time here")).toBeUndefined();
  });
});
