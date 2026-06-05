import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

type ScriptParity = {
  rtkScript: string;
  tkPath: string;
  packageScript?: string;
};

const migratedScripts: ScriptParity[] = [
  {
    rtkScript: "rtk/scripts/test-all.sh",
    tkPath: "tests/smoke/smoke.sh",
    packageScript: "test:smoke",
  },
  {
    rtkScript: "rtk/scripts/check-test-presence.sh",
    tkPath: "scripts/check-test-presence.sh",
    packageScript: "test:check-presence",
  },
  {
    rtkScript: "rtk/scripts/validate-docs.sh",
    tkPath: "scripts/validate-docs.sh",
    packageScript: "test:validate-docs",
  },
  {
    rtkScript: "rtk/scripts/check-installation.sh",
    tkPath: "scripts/check-installation.sh",
    packageScript: "check:installation",
  },
  {
    rtkScript: "rtk/scripts/test-install.sh",
    tkPath: "scripts/test-install.sh",
    packageScript: "test:install",
  },
  {
    rtkScript: "rtk/scripts/benchmark.sh",
    tkPath: "scripts/benchmark.sh",
  },
  {
    rtkScript: "rtk/scripts/update-readme-metrics.sh",
    tkPath: "scripts/update-readme-metrics.sh",
  },
];

async function exists(relativePath: string) {
  await access(path.join(repoRoot, relativePath));
}

const pendingScriptPorts = [
  {
    name: "benchmark TypeScript run entrypoint",
    rtkPath: "rtk/scripts/benchmark/run.ts",
    tkPath: "scripts/benchmark/run.ts",
  },
  {
    name: "benchmark TypeScript rebuild entrypoint",
    rtkPath: "rtk/scripts/benchmark/rebuild.ts",
    tkPath: "scripts/benchmark/rebuild.ts",
  },
  {
    name: "benchmark TypeScript cleanup entrypoint",
    rtkPath: "rtk/scripts/benchmark/cleanup.ts",
    tkPath: "scripts/benchmark/cleanup.ts",
  },
  {
    name: "benchmark sessions runner",
    rtkPath: "rtk/scripts/benchmark-sessions/lib/runner.py",
    tkPath: "scripts/benchmark-sessions/lib/runner.py",
  },
  // The Ruby smoke script (rtk/scripts/test-ruby.sh) is intentionally NOT ported:
  // Ruby is an out-of-scope ecosystem (see docs/align-rtk-divergences.md →
  // "Out-of-scope ecosystems"). Do not re-add it in a future parity pass.
] as const;

describe("RTK script parity", () => {
  test.each(migratedScripts)(
    "$rtkScript has a tk script counterpart",
    async ({ rtkScript, tkPath }) => {
      await expect(exists(rtkScript)).resolves.toBeUndefined();
      await expect(exists(tkPath)).resolves.toBeUndefined();
    },
  );

  test.each(migratedScripts.filter((script) => script.packageScript))(
    "$tkPath is exposed through package.json $packageScript",
    async ({ packageScript, tkPath }) => {
      const packageJson = JSON.parse(
        await readFile(path.join(repoRoot, "package.json"), "utf8"),
      ) as { scripts: Record<string, string> };

      expect(packageJson.scripts[packageScript!]).toContain(tkPath);
    },
  );

  test("test:ci includes product, install, migration, and RTK-style script guards", async () => {
    const packageJson = JSON.parse(
      await readFile(path.join(repoRoot, "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };

    expect(packageJson.scripts["test:ci"]).toContain("pnpm test:product");
    expect(packageJson.scripts["test:ci"]).toContain("pnpm test:install");
    expect(packageJson.scripts["test:ci"]).toContain("pnpm test:migration");
    expect(packageJson.scripts["test:ci"]).toContain("scripts/check-test-presence.sh");
    expect(packageJson.scripts["test:ci"]).toContain("scripts/validate-docs.sh");
    expect(packageJson.scripts["test:ci"]).toContain("tests/smoke/smoke.sh");
  });

  test.each(pendingScriptPorts)("$name is ported to tk", async ({ rtkPath, tkPath }) => {
    await expect(exists(rtkPath)).resolves.toBeUndefined();
    await expect(exists(tkPath)).resolves.toBeUndefined();
  });
});
