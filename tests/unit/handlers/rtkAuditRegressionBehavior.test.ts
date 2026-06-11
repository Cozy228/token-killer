import { describe, expect, test } from "vitest";

import { routeCommand, routeSpecific } from "../../../src/router.js";
import type { ParsedCommand, RawResult, TkOptions } from "../../../src/types.js";
import { filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

// Regression tests for findings in adversarial-audit-2026-06-10.
// One focused test per finding. The tested handlers are all under src/handlers/js/.

// Helper: run a handler directly without the `assertNotUnfilteredPassthrough`
// guard that fires when the correct behavior IS passthrough.
const OPTIONS: TkOptions = {
  raw: false,
  stats: false,
  maxLines: 120000,
  maxChars: 12000000,
  saveRaw: false,
  cwd: "/tmp",
};

function rawResult(argv: string[], stdout: string, exitCode = 0, stderr = ""): RawResult {
  return { command: argv.join(" "), stdout, stderr, exitCode, durationMs: 1 };
}

function parsed(argv: string[]): ParsedCommand {
  return {
    program: argv[0] ?? "",
    args: argv.slice(1),
    original: argv,
    displayCommand: argv.join(" "),
  };
}

async function runHandler(argv: string[], stdout: string, exitCode = 0, stderr = "") {
  const cmd = parsed(argv);
  const handler = routeCommand(cmd);
  return handler.filter(rawResult(argv, stdout, exitCode, stderr), cmd, OPTIONS);
}

// ---------------------------------------------------------------------------
// C2-eslint: nonzero exit → raw; ANSI before parse; unrecognised format → raw
// ---------------------------------------------------------------------------
describe("C2-eslint", () => {
  test("config crash (exit 2) with unrecognised output returns raw, not '0 problems'", async () => {
    const crashOutput = [
      "Oops! Something went wrong! :((",
      "",
      "ESLint: 8.57.0",
      "",
      "Error: Failed to load config 'nonexistent' to extend from.",
    ].join("\n");

    // Must return raw, never "ESLint: 0 problems in 0 files"
    const result = await runHandler(["eslint", "."], crashOutput, 2);
    expect(result.output).toContain("Failed to load config");
    expect(result.output).not.toContain("0 problems in 0 files");
  });

  test("exit 0 with non-empty unrecognised format (-f junit) returns raw", async () => {
    const junitOutput = [
      '<?xml version="1.0" encoding="utf-8"?>',
      "<testsuites>",
      '  <testsuite name="eslint" tests="0" />',
      "</testsuites>",
    ].join("\n");

    const result = await runHandler(["eslint", "."], junitOutput, 0);
    // JUnit XML cannot be parsed by the issue parser → return raw
    expect(result.output).toContain("<?xml");
    expect(result.output).not.toContain("0 problems in 0 files");
  });

  test("exit 1 with parseable JSON issues formats them normally (not raw)", async () => {
    const jsonOutput = JSON.stringify([
      {
        filePath: "/repo/src/utils.ts",
        messages: [
          { ruleId: "no-unused-vars", severity: 1, line: 5, column: 1, message: "x is unused" },
        ],
      },
    ]);

    const result = await filterRtkOutput(["eslint", "src"], jsonOutput, 1);
    expect(result.output).toContain("ESLint:");
    expect(result.output).toContain("no-unused-vars");
    expect(result.output).not.toContain("[{");
  });

  test("M17: echo eslint does NOT route to eslint handler", async () => {
    // `echo eslint` has program="echo" which is not a known runner for eslint.
    const cmd = parsed(["echo", "eslint"]);
    const handler = routeSpecific(cmd);
    expect(handler?.name).not.toBe("eslint");
  });

  test("M17: pnpm exec eslint DOES route to eslint handler", async () => {
    const cmd = parsed(["pnpm", "exec", "eslint", "."]);
    const handler = routeSpecific(cmd);
    expect(handler?.name).toBe("eslint");
  });
});

// ---------------------------------------------------------------------------
// C2-prettier: prettier-v3 [warn] lines + nonzero exit
// ---------------------------------------------------------------------------
describe("C2-prettier", () => {
  test("prettier-v3 [warn] lines on exit 1 → N files need formatting, not 'All files'", async () => {
    const v3Output = [
      "[warn] src/components/Button.tsx",
      "[warn] src/lib/utils.ts",
      "[warn] Code style issues found in the above file(s). Forgot to run Prettier?",
    ].join("\n");

    const result = await filterRtkOutput(["prettier", "--check", "src"], v3Output, 1);
    expect(result.output).toContain("2 files need formatting");
    expect(result.output).not.toContain("All files formatted correctly");
    expect(result.output).toContain("Button.tsx");
    expect(result.output).toContain("utils.ts");
  });

  test("nonzero exit with matched-all-message output returns raw, not 'All files formatted'", async () => {
    // Even if the output says "All matched files use Prettier", nonzero exit → not clean.
    const output = "All matched files use Prettier code style!";
    const result = await runHandler(["prettier", "--check", "src"], output, 1);
    expect(result.output).not.toContain("All files formatted correctly");
  });
});

// ---------------------------------------------------------------------------
// C2-prisma: nonzero exit → raw (keeps schema.prisma:12 error locations)
// ---------------------------------------------------------------------------
describe("C2-prisma", () => {
  test("failing prisma generate keeps the error output, not 'Prisma Client generated'", async () => {
    const failureOutput = [
      "Environment variables loaded from .env",
      "Prisma schema loaded from prisma/schema.prisma",
      "",
      "Error: Schema parsing",
      "--> schema.prisma:12",
      "     |",
      "  11 |   id   Int",
      "  12 |   name String INVALID_KEYWORD",
      "     |",
      "error: Error validating field `name` in model `User`: Unknown attribute.",
    ].join("\n");

    const result = await runHandler(["prisma", "generate"], failureOutput, 1);
    expect(result.output).toContain("schema.prisma:12");
    expect(result.output).toContain("INVALID_KEYWORD");
    expect(result.output).not.toContain("Prisma Client generated");
  });

  test("failing prisma db push keeps the error, not 'Schema pushed to database'", async () => {
    const failureOutput = [
      "Prisma schema loaded from prisma/schema.prisma",
      "",
      "error: Error: P1001: Can't reach database server at `localhost`:`5432`",
    ].join("\n");

    const result = await runHandler(["prisma", "db", "push"], failureOutput, 1);
    expect(result.output).toContain("P1001");
    expect(result.output).not.toContain("Schema pushed to database");
  });
});

// ---------------------------------------------------------------------------
// H13-tsc: file-less diagnostics + count reconciliation + full messages
// ---------------------------------------------------------------------------
describe("H13-tsc", () => {
  test("TS6053 file-not-found alongside file errors: fileless bucket shown", async () => {
    const output = [
      "error TS6053: File 'nonexistent.ts' not found.",
      "src/api.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.",
      "Found 2 errors.",
    ].join("\n");

    const result = await filterRtkOutput(["tsc", "--noEmit"], output, 1);
    expect(result.output).toContain("TS6053");
    expect(result.output).toContain("nonexistent.ts");
    // File errors also present
    expect(result.output).toContain("src/api.ts");
    expect(result.output).toContain("TS2322");
  });

  test("message longer than 120 chars is preserved in full (no truncation)", async () => {
    const longMessage =
      "Type 'VeryLongTypeName_AAAAAAAAAABBBBBBBBBBCCCCCCCCCCDDDDDDDDDDEEEEEEEEEE_end' " +
      "is not assignable to type 'AnotherVeryLongTypeName_012345678901234567890123456789'.";
    const output = `src/api.ts(1,1): error TS2322: ${longMessage}`;

    const result = await filterRtkOutput(["tsc", "--noEmit"], output, 1);
    // Full message must survive, not be clipped at 120 chars with "..."
    expect(result.output).toContain(longMessage);
    expect(result.output).not.toContain("...");
  });

  test("M17: mytscript.sh does NOT route to tsc handler", async () => {
    const cmd = parsed(["mytscript.sh", "--noEmit"]);
    const handler = routeSpecific(cmd);
    expect(handler?.name).not.toBe("tsc");
  });

  test("M17: npx tsc produces tsc-style output (matchesTsc covers npx-wrapper)", async () => {
    // routeSpecific/routeCommand walks handlers in registration order; `npx` has
    // its own handler that intercepts `npx <cmd>` first. The meaningful M17
    // regression for tsc is that the matcher no longer fires on `mytscript.sh`.
    // For the positive case we verify that the tsc matcher function returns true
    // for `npx tsc` by checking the produced output shape: tsc-formatted, not raw.
    const tscOutput = [
      "src/api.ts(5,3): error TS2322: Type 'string' is not assignable to type 'number'.",
      "Found 1 error.",
    ].join("\n");
    const result = await runHandler(["npx", "tsc", "--noEmit"], tscOutput, 1);
    // tsc formatting produces "TypeScript: N errors in N files" header.
    expect(result.output).toContain("TypeScript:");
    expect(result.output).not.toContain("Found 1 error.");
  });
});

// ---------------------------------------------------------------------------
// H14-npm: UNMET DEPENDENCY / extraneous / ERESOLVE
// ---------------------------------------------------------------------------
describe("H14-npm", () => {
  test("npm ls exit-1 with UNMET DEPENDENCY keeps the annotation in problems section", async () => {
    // Use runHandler directly: the packageList handler passes through unchanged when
    // there are no parseable package names (only UNMET lines), so filterRtkOutput's
    // `assertNotUnfilteredPassthrough` would fire even though the output is correct.
    // The regression we're testing is that PROBLEM_RE now matches "UNMET DEPENDENCY".
    const lsOutput = [
      "myapp@1.0.0 /path/to/app",
      "├── UNMET DEPENDENCY react@^18.0.0",
      "├── lodash@4.17.21",
      "└── express@4.18.0",
    ].join("\n");

    const result = await runHandler(["npm", "ls"], lsOutput, 1);
    // UNMET DEPENDENCY must appear (in problems)
    expect(result.output).toContain("UNMET DEPENDENCY");
  });

  test("npm ls with extraneous package keeps the annotation", async () => {
    // Use runHandler directly for the same reason as above.
    const lsOutput = [
      "myapp@1.0.0",
      "├── lodash@4.17.21",
      "├── express@4.18.0",
      "└── UNMET DEPENDENCY chalk@^5.0.0",
      "npm ERR! extraneous: lodash@4.17.21",
    ].join("\n");

    const result = await runHandler(["npm", "ls"], lsOutput, 1);
    // extraneous must survive in problems
    expect(result.output.toLowerCase()).toContain("extraneous");
  });

  test("npm install ERESOLVE warnings are kept (not stripped like generic WARN)", async () => {
    const installOutput = [
      "npm WARN ERESOLVE overriding peer dependency",
      "npm WARN conflicting peer dependency: react@17.0.2",
      "npm WARN deprecated glob@7.2.3: deprecated",
      "added 1357 packages in 42s",
    ].join("\n");

    const result = await filterRtkOutput(["npm", "install", "express"], installOutput, 0);
    // ERESOLVE/conflicting peer warnings must survive
    expect(result.output).toContain("ERESOLVE");
    expect(result.output).toContain("conflicting peer");
    // Generic deprecated warning is stripped
    expect(result.output).not.toContain("glob@7.2.3");
    // Normal output survives
    expect(result.output).toContain("1357 packages");
  });
});

// ---------------------------------------------------------------------------
// M14: jest failure detail across blank line + vitest skipped + counts-only
// ---------------------------------------------------------------------------
describe("M14", () => {
  test("jest failure detail: Expected/Received across a blank line is kept", async () => {
    const jestOutput = [
      "",
      "FAIL src/sum.test.ts",
      "  ● sum › adds 1 + 2 to equal 4",
      "",
      "    expect(received).toBe(expected)",
      "",
      "    Expected: 4",
      "    Received: 3",
      "",
      "Tests: 2 failed, 3 passed, 5 total",
    ].join("\n");

    const result = await filterRtkOutput(["jest", "--ci"], jestOutput, 1);
    expect(result.output).toContain("PASS (3) FAIL (2)");
    // The detail lines across the blank must survive
    expect(result.output).toContain("Expected: 4");
    expect(result.output).toContain("Received: 3");
  });

  test("vitest skipped count is captured in the summary", async () => {
    const vitestOutput = [
      "",
      "✓ src/app.test.ts (3)",
      "",
      "  Tests  1 failed | 5 passed | 2 skipped",
      "  Duration 1.2s",
    ].join("\n");

    const result = await filterRtkOutput(["vitest", "run"], vitestOutput, 1);
    expect(result.output).toContain("skipped (2)");
  });

  test("counts-only (failed > 0 but no FAIL blocks found) says 'details unavailable'", async () => {
    // Vitest summary with failures but no FAIL block visible
    const vitestCompact = [
      " ❯ src/api.test.ts (1 test | 1 failed)",
      "",
      "  Tests  3 failed | 12 passed",
      "  Duration  0.5s",
    ].join("\n");

    const result = await filterRtkOutput(["vitest", "run"], vitestCompact, 1);
    expect(result.output).toContain("FAIL (3)");
    expect(result.output).toContain("details unavailable");
  });
});

// ---------------------------------------------------------------------------
// M17: pnpm install testlib does NOT route to js-test
// ---------------------------------------------------------------------------
describe("M17-routing", () => {
  test("pnpm install testlib does not route to js-test handler", async () => {
    const cmd = parsed(["pnpm", "install", "testlib"]);
    const handler = routeCommand(cmd);
    expect(handler.name).not.toBe("js-test");
  });

  test("pnpm run test still routes to js-test", async () => {
    const cmd = parsed(["pnpm", "run", "test"]);
    const handler = routeCommand(cmd);
    expect(handler.name).toBe("js-test");
  });

  test("pnpm test still routes to js-test", async () => {
    const cmd = parsed(["pnpm", "test"]);
    const handler = routeCommand(cmd);
    expect(handler.name).toBe("js-test");
  });
});

// ---------------------------------------------------------------------------
// M18: next lint output is preserved (not flattened to build summary)
// ---------------------------------------------------------------------------
describe("M18-next", () => {
  test("next lint routes to next handler but output passes through unchanged", async () => {
    const lintOutput = [
      "",
      "info  - Checking validity of types",
      "./src/app/page.tsx",
      "11:3  Warning: img elements must have an alt prop  @next/next/no-img-element",
      "",
      "✓ No ESLint warnings or errors",
    ].join("\n");

    // Use runHandler directly since this is a legitimate passthrough
    const result = await runHandler(["next", "lint"], lintOutput, 0);
    // Must NOT be flattened to "Next.js Build" summary
    expect(result.output).not.toContain("Next.js Build");
    // Must preserve lint diagnostic lines
    expect(result.output).toContain("No ESLint warnings or errors");
    expect(result.output).toContain("alt prop");
  });

  test("next dev output passes through (server launch messages preserved)", async () => {
    const devOutput = [
      "  ▲ Next.js 15.2.0",
      "  - Local:        http://localhost:3000",
      "  - Network:      http://192.168.1.5:3000",
      " ✓ Starting...",
      " ✓ Ready in 1234ms",
    ].join("\n");

    const result = await runHandler(["next", "dev"], devOutput, 0);
    expect(result.output).not.toContain("Next.js Build");
    expect(result.output).toContain("localhost:3000");
    expect(result.output).toContain("Ready in");
  });

  test("next build still formats on exit 0", async () => {
    // Ensure the M18 gate doesn't break the normal build case.
    // The `next` handler does not carry `traits.structural`, so on tiny inputs the
    // quality gate (inflation check) reverts to raw when formatted > raw. Use a
    // realistic multi-route build output large enough that the formatted summary is
    // smaller, ensuring the quality gate passes and "Next.js Build" survives.
    const buildOutput = [
      "   ▲ Next.js 15.2.0",
      "",
      "   Creating an optimized production build ...",
      " ✓ Compiled successfully",
      "",
      "Route (app)                                               Size     First Load JS",
      "┌ ○ /                                                   1.50 kB        87.0 kB",
      "├ ○ /about                                              2.10 kB        88.6 kB",
      "├ ○ /blog                                               3.00 kB        89.5 kB",
      "├ ○ /blog/[slug]                                        2.80 kB        89.3 kB",
      "├ ○ /contact                                            1.90 kB        88.4 kB",
      "├ ● /dashboard (prerender)                              4.50 kB        91.0 kB",
      "├ ● /dashboard/analytics                                5.10 kB        91.6 kB",
      "├ ○ /faq                                                1.20 kB        87.7 kB",
      "└ ○ /pricing                                            2.30 kB        88.8 kB",
      "",
      "+ First Load JS shared by all                           75.5 kB",
      "  ├ chunks/framework-3f92a5e...js                       40.7 kB",
      "  ├ chunks/main-def456.js                               12.8 kB",
      "  └ other shared chunks (total)                         22.0 kB",
      "",
      "○  (Static)   prerendered as static content",
      "●  (SSG)      prerendered as static HTML (uses getStaticProps)",
      "",
      " ✓ Generated static pages (9/9)",
      " ✓ Finalizing page optimization",
      " ✓ Collecting build traces",
      "",
      "Compiled in 34.2s",
    ].join("\n");

    const result = await filterRtkOutput(["next", "build"], buildOutput, 0);
    expect(result.output).toContain("Next.js Build");
    expect(result.output).toContain("routes");
    expect(result.output).not.toContain("Creating an optimized production build");
  });
});

// ---------------------------------------------------------------------------
// M19: playwright non-.spec. test identity + failure message capture
// ---------------------------------------------------------------------------
describe("M19-playwright", () => {
  test("non-.spec. failing test name is captured (auth.test.ts)", async () => {
    const humanOutput = [
      "Running 2 tests using 1 worker",
      "",
      "  × 1 [chromium] › e2e/auth.test.ts › login › should fail with wrong password",
      "",
      "  1 failed",
      "  1 passed (5.2s)",
    ].join("\n");

    const result = await filterRtkOutput(["playwright", "test"], humanOutput, 1);
    expect(result.output).toContain("PASS (1) FAIL (1)");
    expect(result.output).toContain("should fail with wrong password");
  });

  test("failure message is captured alongside the test name", async () => {
    const humanOutput = [
      "Running 1 test using 1 worker",
      "",
      "  × 1 [chromium] › login.spec.ts › should work",
      "    Error: expect(received).toBe(expected)",
      "    Expected: true",
      "    Received: false",
      "",
      "  1 failed",
      "  0 passed (1.1s)",
    ].join("\n");

    const result = await filterRtkOutput(["playwright", "test"], humanOutput, 1);
    expect(result.output).toContain("should work");
    expect(result.output).toMatch(/Expected.*true|toBe/);
  });
});

// ---------------------------------------------------------------------------
// M20: next build over-budget bundle list ships a declared omission
// ---------------------------------------------------------------------------
describe("M20-next-ladder", () => {
  test("next build with many bundles ships declared omission, not reverted raw", async () => {
    // Build a large bundle list (> 2000 token budget) to trigger the over-budget path.
    const bundleLines: string[] = [];
    for (let i = 0; i < 50; i += 1) {
      bundleLines.push(
        `○ /page-${i}                         ${i + 10}.${i} kB        ${i + 100}.0 kB`,
      );
    }
    const bigBuild = [
      "▲ Next.js 15.2.0",
      "Creating an optimized production build ...",
      ...bundleLines,
      "✓ Built in 45.2s",
    ].join("\n");

    const result = await filterRtkOutput(["next", "build"], bigBuild, 0);
    // Must contain "Next.js Build" header (not raw passthrough)
    expect(result.output).toContain("Next.js Build");
    // Must NOT contain the banned +N more marker
    expect(result.output).not.toMatch(/\.\.\.\s*\+\d+\s+more/);
    // Status line always present
    expect(result.output).toContain("Time:");
  });
});
