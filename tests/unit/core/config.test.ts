import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ConfigError, configPath, readConfig, writeConfigTemplate } from "../../../src/core/config.js";
import { runConfig } from "../../../src/core/configCli.js";

const previousHome = process.env.TOKEN_GUARD_HOME;

afterEach(() => {
  vi.restoreAllMocks();
  if (previousHome === undefined) delete process.env.TOKEN_GUARD_HOME;
  else process.env.TOKEN_GUARD_HOME = previousHome;
});

async function withHome<T>(fn: (home: string) => Promise<T>): Promise<T> {
  const home = await mkdtemp(path.join(tmpdir(), "tg-config-"));
  process.env.TOKEN_GUARD_HOME = home;
  try {
    return await fn(home);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

describe("readConfig", () => {
  test("missing file reads as defaults (all consent false)", async () => {
    await withHome(async () => {
      expect(readConfig()).toEqual({ telemetryExport: false, telemetry: false });
    });
  });

  test("parses JSONC with comments and the two independent consent flags", async () => {
    await withHome(async () => {
      await writeFile(
        configPath(),
        '{\n  // a comment\n  "telemetryExport": true,\n  "telemetry": false\n}\n',
      );
      const config = readConfig();
      expect(config.telemetryExport).toBe(true);
      expect(config.telemetry).toBe(false);
    });
  });

  test("unknown key is out-of-shape ⇒ throws ConfigError", async () => {
    await withHome(async () => {
      await writeFile(configPath(), '{ "nope": true }');
      expect(() => readConfig()).toThrow(ConfigError);
    });
  });

  test("wrong type is out-of-shape ⇒ throws ConfigError", async () => {
    await withHome(async () => {
      await writeFile(configPath(), '{ "telemetry": "yes" }');
      expect(() => readConfig()).toThrow(ConfigError);
    });
  });

  test("a parse error throws ConfigError", async () => {
    await withHome(async () => {
      await writeFile(configPath(), "{ not json");
      expect(() => readConfig()).toThrow(ConfigError);
    });
  });
});

describe("tg config init", () => {
  test("creates the closed-set template with both consents false", async () => {
    await withHome(async () => {
      vi.spyOn(process.stdout, "write").mockReturnValue(true);
      expect(runConfig(["init"])).toBe(0);
      const text = await readFile(configPath(), "utf8");
      expect(text).toContain('"telemetryExport": false');
      expect(text).toContain('"telemetry": false');
      // round-trips through the reader cleanly
      expect(readConfig()).toEqual({
        inputType: "vscode",
        defaultSince: "7d",
        telemetryExport: false,
        telemetry: false,
      });
    });
  });

  test("does not overwrite an existing config ⇒ exit 1", async () => {
    await withHome(async () => {
      writeConfigTemplate();
      vi.spyOn(process.stderr, "write").mockReturnValue(true);
      expect(runConfig(["init"])).toBe(1);
    });
  });
});
