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
});
