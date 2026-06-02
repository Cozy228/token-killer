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
  tgPath: string;
  packageScript?: string;
};

const migratedScripts: ScriptParity[] = [
  {
    rtkScript: "rtk/scripts/test-all.sh",
    tgPath: "tests/smoke/smoke.sh",
    packageScript: "test:smoke",
  },
  {
    rtkScript: "rtk/scripts/check-test-presence.sh",
    tgPath: "scripts/check-test-presence.sh",
    packageScript: "test:check-presence",
  },
  {
    rtkScript: "rtk/scripts/validate-docs.sh",
    tgPath: "scripts/validate-docs.sh",
    packageScript: "test:validate-docs",
  },
  {
    rtkScript: "rtk/scripts/check-installation.sh",
    tgPath: "scripts/check-installation.sh",
    packageScript: "check:installation",
  },
  {
    rtkScript: "rtk/scripts/test-install.sh",
    tgPath: "scripts/test-install.sh",
    packageScript: "test:install",
  },
  {
    rtkScript: "rtk/scripts/benchmark.sh",
    tgPath: "scripts/benchmark.sh",
  },
  {
    rtkScript: "rtk/scripts/update-readme-metrics.sh",
    tgPath: "scripts/update-readme-metrics.sh",
  },
];

async function exists(relativePath: string) {
  await access(path.join(repoRoot, relativePath));
}

const pendingScriptPorts = [
  {
    name: "benchmark TypeScript run entrypoint",
    rtkPath: "rtk/scripts/benchmark/run.ts",
    tgPath: "scripts/benchmark/run.ts",
  },
  {
    name: "benchmark TypeScript rebuild entrypoint",
    rtkPath: "rtk/scripts/benchmark/rebuild.ts",
    tgPath: "scripts/benchmark/rebuild.ts",
  },
  {
    name: "benchmark TypeScript cleanup entrypoint",
    rtkPath: "rtk/scripts/benchmark/cleanup.ts",
    tgPath: "scripts/benchmark/cleanup.ts",
  },
  {
    name: "benchmark sessions runner",
    rtkPath: "rtk/scripts/benchmark-sessions/lib/runner.py",
    tgPath: "scripts/benchmark-sessions/lib/runner.py",
  },
  {
    name: "ruby smoke script",
    rtkPath: "rtk/scripts/test-ruby.sh",
    tgPath: "scripts/test-ruby.sh",
  },
] as const;

describe("RTK script parity", () => {
  test.each(migratedScripts)(
    "$rtkScript has a tg script counterpart",
    async ({ rtkScript, tgPath }) => {
      await expect(exists(rtkScript)).resolves.toBeUndefined();
      await expect(exists(tgPath)).resolves.toBeUndefined();
    },
  );

  test.each(migratedScripts.filter((script) => script.packageScript))(
    "$tgPath is exposed through package.json $packageScript",
    async ({ packageScript, tgPath }) => {
      const packageJson = JSON.parse(
        await readFile(path.join(repoRoot, "package.json"), "utf8"),
      ) as { scripts: Record<string, string> };

      expect(packageJson.scripts[packageScript!]).toContain(tgPath);
    },
  );

  test("test:ci includes RTK-style script guards", async () => {
    const packageJson = JSON.parse(
      await readFile(path.join(repoRoot, "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };

    expect(packageJson.scripts["test:ci"]).toContain("vitest run");
    expect(packageJson.scripts["test:ci"]).toContain("scripts/check-test-presence.sh");
    expect(packageJson.scripts["test:ci"]).toContain("scripts/validate-docs.sh");
    expect(packageJson.scripts["test:ci"]).toContain("tests/smoke/smoke.sh");
  });

  test.each(pendingScriptPorts)("$name is ported to tg", async ({ rtkPath, tgPath }) => {
    await expect(exists(rtkPath)).resolves.toBeUndefined();
    await expect(exists(tgPath)).resolves.toBeUndefined();
  });
});
