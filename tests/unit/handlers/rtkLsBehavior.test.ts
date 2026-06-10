import { describe, expect, test } from "vitest";

import {
  expectRtkParity,
  filterRtkFixture,
  filterRtkOutput,
} from "../../helpers/rtkCommandHarness.js";
import { buildLsArgs } from "../../../src/handlers/system/ls.js";

// RTK: ls.rs::run command construction — the real CLI path must force `ls -la`
// (long+all) so the filter has columns to parse. The migration harness only
// exercises filter(); these assert the execute() command-rewrite parity directly.
describe("RTK ls command construction (buildLsArgs)", () => {
  test("forces -la and defaults to the current directory", () => {
    expect(buildLsArgs([])).toEqual(["-la", "."]);
  });
  test("keeps non-l/a/h short-flag extras and preserves paths", () => {
    // -lartS -> -la is forced; r/t/S kept as the extra; path preserved.
    expect(buildLsArgs(["-lartS", "src"])).toEqual(["-la", "-rtS", "src"]);
  });
  test("drops --all (filter re-applies noise rules) but keeps other -- flags", () => {
    expect(buildLsArgs(["--all", "--color=never", "docs"])).toEqual([
      "-la",
      "--color=never",
      "docs",
    ]);
  });
});

// RTK: system/ls.rs — `compact_ls` parses `ls -la` long format into a compact
// listing: dirs first (name + "/"), then files (name + human size), NOISE_DIRS
// filtered unless -a, optional octal perms with -l. The Rust summary line is
// emitted only in interactive TTY mode (ls.rs::run is_terminal()); piped output
// (how tk consumes it) carries only the entries.

describe("RTK ls behavior", () => {
  // RTK: ls.rs::test_compact_basic + test_human_size — dirs gain a trailing
  // slash, files gain a human-readable size, headers/. /.. are dropped.
  test("compacts ls -la long format with dirs-first and human sizes", async () => {
    const input = [
      "total 48",
      "drwxr-xr-x  2 user  staff    64 Jan  1 12:00 .",
      "drwxr-xr-x  2 user  staff    64 Jan  1 12:00 ..",
      "drwxr-xr-x  2 user  staff    64 Jan  1 12:00 src",
      "-rw-r--r--  1 user  staff  1234 Jan  1 12:00 Cargo.toml",
      "-rw-r--r--  1 user  staff  5678 Jan  1 12:00 README.md",
      "",
    ].join("\n");

    const result = await filterRtkOutput(["ls"], input);

    expect(result.output).toContain("src/");
    expect(result.output).toContain("1.2K"); // 1234 bytes
    expect(result.output).toContain("5.5K"); // 5678 bytes

    expectRtkParity(result, {
      critical: ["src/", "Cargo.toml  1.2K", "README.md  5.5K"],
      forbidden: [/drwx/, /staff/, /total/, /\b12:00\b/],
      exact: ["src/", "Cargo.toml  1.2K", "README.md  5.5K"].join("\n"),
    });
  });

  // RTK: ls.rs::test_compact_filters_noise — without -a, NOISE_DIRS are hidden
  // behind a disclosure line (H17 fix: not silent removal).
  test("hides NOISE_DIRS with a disclosure line when -a is not requested", async () => {
    const input = [
      "total 8",
      "drwxr-xr-x  2 user  staff  64 Jan  1 12:00 node_modules",
      "drwxr-xr-x  2 user  staff  64 Jan  1 12:00 .git",
      "drwxr-xr-x  2 user  staff  64 Jan  1 12:00 target",
      "drwxr-xr-x  2 user  staff  64 Jan  1 12:00 src",
      "-rw-r--r--  1 user  staff  100 Jan  1 12:00 main.rs",
      "",
    ].join("\n");

    const result = await filterRtkOutput(["ls"], input);

    // H17: entries are still visible; disclosure line names the hidden dirs.
    expectRtkParity(result, {
      critical: ["src/", "main.rs  100B", "(+3 tool dirs hidden:", "use -a)"],
      // The dir names appear only in the disclosure summary, never as dir/ entries.
      forbidden: [/^node_modules\/$/, /^\.git\/$/, /^target\/$/],
    });
    // Hidden dirs are named in the disclosure line.
    expect(result.output).toMatch(/node_modules/);
    expect(result.output).toMatch(/\.git/);
    expect(result.output).toMatch(/target/);
  });

  // RTK: ls.rs::test_compact_show_all — with -a (here -la), NOISE_DIRS are kept.
  test("keeps NOISE_DIRS when -a is present (ls -la)", async () => {
    const input = [
      "total 8",
      "drwxr-xr-x  2 user  staff  64 Jan  1 12:00 .git",
      "drwxr-xr-x  2 user  staff  64 Jan  1 12:00 src",
      "",
    ].join("\n");

    const result = await filterRtkOutput(["ls", "-la"], input);

    expect(result.output).toContain(".git/");
    expect(result.output).toContain("src/");
  });

  // RTK: ls.rs::test_compact_long_format_includes_octal + test_perms_to_octal_* —
  // with -l, each entry is prefixed with its octal permissions.
  test("prefixes octal permissions with -l", async () => {
    const input = [
      "total 48",
      "drwxr-xr-x  2 user  staff    64 Jan  1 12:00 src",
      "-rw-r--r--  1 user  staff  1234 Jan  1 12:00 Cargo.toml",
      "-rwxr-xr-x  1 user  staff   500 Jan  1 12:00 build.sh",
      "",
    ].join("\n");

    const result = await filterRtkOutput(["ls", "-l"], input);

    expectRtkParity(result, {
      critical: ["755  src/", "644  Cargo.toml  1.2K", "755  build.sh  500B"],
      exact: ["755  src/", "644  Cargo.toml  1.2K", "755  build.sh  500B"].join("\n"),
    });
  });

  // RTK: ls.rs::test_compact_short_format_omits_octal — without -l, no octal
  // prefix even though `ls -la` is parsed under the hood.
  test("omits octal permissions without -l", async () => {
    const input = ["total 48", "-rw-r--r--  1 user  staff  1234 Jan  1 12:00 Cargo.toml", ""].join(
      "\n",
    );

    const result = await filterRtkOutput(["ls"], input);

    expect(result.output).toContain("Cargo.toml");
    expect(result.output).not.toContain("644");
  });

  // RTK: ls.rs::compact_ls over a realistic project listing — compaction must
  // shrink the long format substantially while keeping every visible entry.
  test("compacts a realistic ls -la listing with savings", async () => {
    const result = await filterRtkFixture(["ls", "-la"], "tests/fixtures/system/ls_la_long.txt");

    expectRtkParity(result, {
      // -la implies -a (noise kept) and -l (octal shown).
      critical: [
        "755  .git/",
        "755  node_modules/",
        "755  src/",
        "644  README.md  5.5K",
        "755  build.sh  500B",
        "644  package.json  20.0K",
      ],
      forbidden: [/drwx/, /staff/, /Jan  1/, /^total/m],
      minSavingsRatio: 0.4,
    });
  });
});

// Regression tests for audit findings.
describe("ls audit regressions", () => {
  // C2-ls: nonzero exit must never emit "(empty)" — must keep the error text.
  test("C2-ls: ls on a missing path keeps the error text, never (empty)", async () => {
    const stderr = "ls: cannot access '/no/such/path': No such file or directory\n";
    const result = await filterRtkOutput(["ls", "/no/such/path"], "", 2, stderr);

    expect(result.output).toContain("No such file or directory");
    expect(result.output).not.toContain("(empty)");
  });

  // H17: hidden NOISE_DIRS must be disclosed in a counted line, never silently dropped.
  test("H17: hidden tool dirs are disclosed in a counted line", async () => {
    const input = [
      "total 8",
      "drwxr-xr-x  2 user  staff  64 Jan  1 12:00 dist",
      "drwxr-xr-x  2 user  staff  64 Jan  1 12:00 coverage",
      "drwxr-xr-x  2 user  staff  64 Jan  1 12:00 build",
      "drwxr-xr-x  2 user  staff  64 Jan  1 12:00 src",
      "-rw-r--r--  1 user  staff  100 Jan  1 12:00 README.md",
      "",
    ].join("\n");

    const result = await filterRtkOutput(["ls"], input);

    // Build dirs are NOT shown as dir/ entries.
    expect(result.output).not.toMatch(/^dist\/$/m);
    expect(result.output).not.toMatch(/^coverage\/$/m);
    expect(result.output).not.toMatch(/^build\/$/m);
    // Disclosure line names them and gives the count.
    expect(result.output).toMatch(/\(\+3 tool dirs hidden:/);
    expect(result.output).toContain("use -a");
    // Real entries still visible.
    expect(result.output).toContain("src/");
    expect(result.output).toContain("README.md");
  });
});
