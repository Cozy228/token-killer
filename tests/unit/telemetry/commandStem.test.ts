import { describe, expect, test } from "vitest";

import { commandStem } from "../../../src/telemetry/commandStem.js";

describe("commandStem", () => {
  test("keeps program and subcommand, drops paths and flags", () => {
    expect(commandStem("git status")).toBe("git status");
    expect(commandStem("tk git diff src/handlers/index.ts")).toBe("git diff");
    expect(commandStem("vitest run tests/unit/foo.test.ts")).toBe("vitest run");
    expect(commandStem("ruff check src/ --fix")).toBe("ruff check");
    expect(commandStem("grep -r TODO src/")).toBe("grep");
  });

  test("drops secrets and URLs from stems", () => {
    expect(commandStem("deploy --secret=SUPERSECRETTOKEN /private/keys/id_rsa")).toBe("deploy");
    expect(commandStem("curl -s https://api.example.com/v1/secret")).toBe("curl");
    expect(commandStem("docker compose ps my-service")).toBe("docker compose ps");
  });

  test("issue #10: programs whose position-2 is user content never emit a second token", () => {
    // The second token of these programs is a search pattern, db name, host, or a pasted
    // credential — never a subcommand. A closed vocabulary (no entry for these) is the
    // only thing keeping user content off the wire. Regression guards for the leak.
    expect(commandStem("rg supersecretpattern src")).toBe("rg");
    expect(commandStem("grep password")).toBe("grep");
    expect(commandStem("psql customers_prod")).toBe("psql");
    expect(commandStem("aws AKIAIOSFODNN7EXAMPLE")).toBe("aws");
    expect(commandStem("curl internal-host")).toBe("curl");
  });

  test("issue #10: known subcommands still pass through the closed vocabulary", () => {
    expect(commandStem("git diff")).toBe("git diff");
    expect(commandStem("npm run")).toBe("npm run");
    expect(commandStem("docker compose up")).toBe("docker compose up");
    expect(commandStem("vitest run")).toBe("vitest run");
  });

  test("issue #10: an unknown-but-benign subcommand degrades to program-only", () => {
    expect(commandStem("git frobnicate")).toBe("git");
  });

  test("H1: leading KEY=value env-assignment tokens never become the stem", () => {
    // The assignment is environment setup, not the program — and can carry a secret;
    // it was previously returned verbatim as the "redacted" stem.
    expect(commandStem("DATABASE_URL=postgres://user:pass@host npm run migrate")).toBe("npm run");
    expect(commandStem("FOO=1 BAR=2 git status")).toBe("git status");
    // After stripping assignments a path/URL program slot is generalized, never raw.
    expect(commandStem("API_KEY=sk-secret-12345 ./deploy.sh")).toBe("other");
    expect(commandStem("DATABASE_URL=postgres://user:pass@host npm run migrate")).not.toContain(
      "pass",
    );
  });
});
