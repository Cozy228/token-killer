import { readFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

import { runTelemetry } from "../../../src/telemetry/cli.js";
import { configPath, readConfig, writeConfigTemplate } from "../../../src/core/config.js";

const previousHome = process.env.TOKEN_KILLER_HOME;

afterEach(() => {
  vi.restoreAllMocks();
  if (previousHome === undefined) delete process.env.TOKEN_KILLER_HOME;
  else process.env.TOKEN_KILLER_HOME = previousHome;
});

async function withHome<T>(fn: (home: string) => Promise<T>): Promise<T> {
  const home = await mkdtemp(path.join(tmpdir(), "tk-tcli-"));
  process.env.TOKEN_KILLER_HOME = home;
  try {
    return await fn(home);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

function captureStdout(): { text: () => string } {
  let buffer = "";
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
    buffer += typeof chunk === "string" ? chunk : chunk.toString();
    return true;
  });
  return { text: () => buffer };
}

describe("tk telemetry enable/disable", () => {
  test("enable sets telemetry true while preserving telemetryExport", async () => {
    await withHome(async () => {
      writeConfigTemplate({ telemetry: false, telemetryExport: true });
      captureStdout();
      expect(await runTelemetry(["enable"])).toBe(0);
      const config = readConfig();
      expect(config.telemetry).toBe(true);
      expect(config.telemetryExport).toBe(true); // preserved
    });
  });

  test("disable sets telemetry false", async () => {
    await withHome(async () => {
      writeConfigTemplate({ telemetry: true, telemetryExport: false });
      captureStdout();
      expect(await runTelemetry(["disable"])).toBe(0);
      expect(readConfig().telemetry).toBe(false);
    });
  });

  test("enable creates the config if absent", async () => {
    await withHome(async () => {
      captureStdout();
      expect(await runTelemetry(["enable"])).toBe(0);
      const text = await readFile(configPath(), "utf8");
      expect(text).toContain('"telemetry": true');
    });
  });
});

describe("tk telemetry status / preview — never send", () => {
  test("status reports both consents and the device_hash", async () => {
    await withHome(async () => {
      writeConfigTemplate({ telemetry: true, telemetryExport: false });
      const cap = captureStdout();
      expect(await runTelemetry(["status"])).toBe(0);
      expect(cap.text()).toContain("telemetry (network upload): enabled");
      expect(cap.text()).toContain("telemetryExport (local file): disabled");
      expect(cap.text()).toMatch(/device_hash: [a-f0-9]{64}/);
    });
  });

  test("preview prints a v2 payload JSON and sends nothing", async () => {
    await withHome(async () => {
      const cap = captureStdout();
      expect(await runTelemetry(["preview"])).toBe(0);
      const payload = JSON.parse(cap.text());
      expect(payload.schema).toBe("2");
      expect(payload).toHaveProperty("device_hash");
      expect(payload.inspect).toBeUndefined(); // gain/preview path: no inspect aggregates
    });
  });

  test("purge is no longer a user-facing subcommand (exits 1)", async () => {
    await withHome(async () => {
      vi.spyOn(process.stderr, "write").mockReturnValue(true);
      expect(await runTelemetry(["purge"])).toBe(1);
    });
  });
});

describe("tk telemetry — config errors", () => {
  test("a malformed config exits 1 on status", async () => {
    await withHome(async () => {
      await writeFile(configPath(), '{ "nope": true }');
      vi.spyOn(process.stderr, "write").mockReturnValue(true);
      expect(await runTelemetry(["status"])).toBe(1);
    });
  });

  test("a malformed config exits 1 on preview too (no payload leak)", async () => {
    await withHome(async () => {
      await writeFile(configPath(), '{ "telemetry": "yes" }');
      const out = vi.spyOn(process.stdout, "write").mockReturnValue(true);
      vi.spyOn(process.stderr, "write").mockReturnValue(true);
      expect(await runTelemetry(["preview"])).toBe(1);
      // must not have printed a payload
      expect(out).not.toHaveBeenCalled();
    });
  });

  test("unknown subcommand exits 1", async () => {
    await withHome(async () => {
      vi.spyOn(process.stderr, "write").mockReturnValue(true);
      expect(await runTelemetry(["bogus"])).toBe(1);
    });
  });
});
