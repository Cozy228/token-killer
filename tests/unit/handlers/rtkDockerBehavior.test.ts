import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK docker behavior", () => {
  test("compose ps keeps service status and strips long image registry prefixes", async () => {
    const result = await filterRtkOutput(
      ["docker", "compose", "ps"],
      [
        "web\tghcr.io/example/very/long/web:latest\tUp 2 hours\t0.0.0.0:8080->80/tcp",
        "api\tghcr.io/example/very/long/api:latest\tUp 2 hours\t0.0.0.0:3000->3000/tcp",
        "db\tpostgres:16\tExited (0)\t",
      ].join("\n"),
    );

    expect(result.output).toContain("web");
    expect(result.output).toContain("api");
    expect(result.output).toContain("db");
    expect(result.output).toContain("Up 2 hours");
    expect(result.output).not.toMatch(/ghcr\.io\/example\/very\/long/);

    expectRtkParity(result, {
      critical: [
        "web",
        "api",
        "db",
        "Up 2 hours",
      ],
      forbidden: [
        /ghcr\.io\/example\/very\/long/,
      ],
      exact: [
        "[compose] 3 services:",
        "  web (web:latest) Up 2 hours [8080]",
        "  api (api:latest) Up 2 hours [3000]",
        "  db (postgres:16) Exited (0)",
      ].join("\n"),
    });
  });
});
