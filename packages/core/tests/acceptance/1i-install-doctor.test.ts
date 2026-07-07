/**
 * Slice 1i — install/doctor. M1-ACCEPTANCE A10-install / A10-node, flipped green.
 *
 * 1i reuses slice 1h's push surface for placement (placePushBlock / buildPushBlock
 * / extractManagedBlock) and adds only the MCP registration, the doctor checks,
 * and byte-exact removal (removePush = `ctx doctor --remove-push`).
 *
 * G-7 is structural here (this repo's own history: a dev `doctor --fix` once
 * corrupted the real hook config). Every write lands under a temp `projectRoot`
 * inside a `mkdtemp` sandbox, and the store opens under a temp `home`; NOTHING
 * in this file names, reads, or writes the real `~/.claude`/`~/.copilot`/`~/.ctx`.
 * The install/doctor core API only accepts explicit `projectRoot`/`home`, so a
 * real-HOME write is not merely avoided — it is not expressible.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  CTX_MCP_SERVER_NAME,
  DEFAULT_PUSH_TARGETS,
  extractManagedBlock,
  installMcpRegistration,
  installProject,
  isCtxMcpEntry,
  MCP_CONFIG_FILE,
  placePushBlock,
  PUSH_MAX_BYTES,
  readMcpServer,
  removePush,
  renderPushBlock,
  runDoctor,
} from "../../src/index.ts";
import { cleanupTempDir, makeTempDir } from "../helpers/sandbox.ts";

describe("acceptance: 1i install/doctor", () => {
  let root: string;
  let projectRoot: string;
  let home: string;

  beforeEach(() => {
    root = makeTempDir("ctx-1i-");
    projectRoot = join(root, "project");
    mkdirSync(projectRoot, { recursive: true });
    home = join(root, "ctx-home");
  });
  afterEach(() => {
    cleanupTempDir(root);
  });

  test("A10-install", () => {
    // Pre-existing user content in both placement files — install must be additive
    // and `--remove-push` must restore these EXACT bytes.
    const agentsOriginal = "# AGENTS\n\nProject-specific agent notes.\n";
    const claudeOriginal = "# CLAUDE\n\nHouse rules for this repo.\n";
    writeFileSync(join(projectRoot, "AGENTS.md"), agentsOriginal);
    writeFileSync(join(projectRoot, "CLAUDE.md"), claudeOriginal);

    // ---- ctx install: MCP registration + push placement (all managed writes) ----
    const result = installProject({ projectRoot }); // no store → header-only block
    expect(result.mcp.action).toBe("created");
    expect(result.placements.map((p) => p.changed)).toEqual([true, true]);

    // (a) MCP registration → project `.mcp.json`, command `ctx mcp`.
    const mcpRaw = readFileSync(join(projectRoot, MCP_CONFIG_FILE), "utf8");
    const entry = readMcpServer(mcpRaw, CTX_MCP_SERVER_NAME);
    expect(isCtxMcpEntry(entry)).toBe(true);
    expect(entry).toMatchObject({ command: "ctx", args: ["mcp"] });

    // (b) push placement → AGENTS.md floor + CLAUDE.md (1h two-file floor), the
    //     managed block appended additively, preserving the user's content.
    for (const [name, original] of [
      ["AGENTS.md", agentsOriginal],
      ["CLAUDE.md", claudeOriginal],
    ] as const) {
      const content = readFileSync(join(projectRoot, name), "utf8");
      expect(content.startsWith(original)).toBe(true); // user content untouched
      const block = extractManagedBlock(content);
      expect(block, `${name} carries a managed block`).toBeDefined();
      expect(Buffer.byteLength(block!, "utf8")).toBeLessThanOrEqual(PUSH_MAX_BYTES);
      expect(block).toContain("context"); // the §7 fixed header mentions the tool
    }

    // ---- ctx doctor: verifies + reports each check (all pass post-install) ----
    const report = runDoctor({ projectRoot, home, env: {} });
    const byName = Object.fromEntries(report.checks.map((c) => [c.name, c]));
    expect(Object.keys(byName).sort()).toEqual(
      ["egress-guard", "git-depth", "mcp", "memory", "node", "push", "sqlite", "store"].sort(),
    );
    for (const c of report.checks) {
      expect(c.ok, `${c.name} should pass post-install: ${c.detail}`).toBe(true);
      expect(c.detail.length).toBeGreaterThan(0);
    }
    expect(report.ok).toBe(true);

    // ---- doctor --remove-push: restore both files byte-exact minus the block ----
    const removed = removePush(projectRoot);
    expect(removed.map((w) => w.action)).toEqual(["updated", "updated"]);
    expect(readFileSync(join(projectRoot, "AGENTS.md"), "utf8")).toBe(agentsOriginal);
    expect(readFileSync(join(projectRoot, "CLAUDE.md"), "utf8")).toBe(claudeOriginal);

    // The `.mcp.json` registration is out of `--remove-push` scope: still present.
    expect(existsSync(join(projectRoot, MCP_CONFIG_FILE))).toBe(true);

    // After removal, doctor's push check fails with an actionable fix (never throws).
    const after = runDoctor({ projectRoot, home, env: {} });
    const push = after.checks.find((c) => c.name === "push")!;
    expect(push.ok).toBe(false);
    expect(push.fix).toMatch(/ctx install/);
  });

  test("A10-install: fresh AGENTS.md floor is created then fully removed", () => {
    // No pre-existing files: install CREATES the AGENTS.md floor + CLAUDE.md.
    const result = installProject({ projectRoot });
    expect(result.placements.every((p) => p.created)).toBe(true);
    for (const name of DEFAULT_PUSH_TARGETS) {
      expect(existsSync(join(projectRoot, name))).toBe(true);
    }
    // --remove-push restores "as if never installed": ctx-created files are deleted.
    removePush(projectRoot);
    for (const name of DEFAULT_PUSH_TARGETS) {
      expect(existsSync(join(projectRoot, name)), `${name} deleted on removal`).toBe(false);
    }
  });

  test("A10-install: place → remove is byte-exact reversible (1h placement)", () => {
    // Over representative base shapes, remove(place(base)) === base for the
    // single-trailing-newline shapes (real AGENTS.md/CLAUDE.md) — the §11
    // rollback guarantee for `doctor --remove-push`.
    const block = renderPushBlock([]).text;
    const file = join(projectRoot, "AGENTS.md");
    for (const original of ["# seed\n", "# Title\n", "a\nb\n"]) {
      writeFileSync(file, original);
      placePushBlock(projectRoot, block, { targets: ["AGENTS.md"] });
      expect(extractManagedBlock(readFileSync(file, "utf8"))).toBeDefined();
      removePush(projectRoot, ["AGENTS.md"]);
      expect(readFileSync(file, "utf8"), `reversible for ${JSON.stringify(original)}`).toBe(
        original,
      );
    }
  });

  test("A10-install: additive JSON merge never clobbers other MCP servers", () => {
    writeFileSync(
      join(projectRoot, MCP_CONFIG_FILE),
      JSON.stringify({ mcpServers: { other: { command: "other-srv" } }, someKey: 1 }, null, 2),
    );
    installMcpRegistration({ projectRoot });
    const raw = readFileSync(join(projectRoot, MCP_CONFIG_FILE), "utf8");
    const parsed = JSON.parse(raw) as { mcpServers: Record<string, unknown>; someKey: number };
    expect(parsed.mcpServers.other).toEqual({ command: "other-srv" }); // preserved
    expect(parsed.someKey).toBe(1); // unrelated top-level key preserved
    expect(isCtxMcpEntry(readMcpServer(raw, CTX_MCP_SERVER_NAME))).toBe(true);
    // Re-register is byte-idempotent.
    const before = raw;
    const again = installMcpRegistration({ projectRoot });
    expect(again.action).toBe("unchanged");
    expect(readFileSync(join(projectRoot, MCP_CONFIG_FILE), "utf8")).toBe(before);
  });

  test("A10-node", () => {
    // doctor asserts Node ≥22.16 and SQLite ≥3.43 (both bundled with the runtime
    // that runs this suite — the CI floor). We assert the CHECKS pass and report
    // the observed versions, not a hard-coded number.
    const report = runDoctor({ projectRoot, home, env: {} });
    const node = report.checks.find((c) => c.name === "node")!;
    const sqlite = report.checks.find((c) => c.name === "sqlite")!;
    expect(node.ok, node.detail).toBe(true);
    expect(node.detail).toMatch(/≥22\.16/);
    expect(sqlite.ok, sqlite.detail).toBe(true);
    expect(sqlite.detail).toMatch(/≥3\.43/);
  });

  test("A10-node: egress-guard check explains the `ctx mcp` refusal (M14)", () => {
    // No key → armed, mcp starts.
    const clean = runDoctor({ projectRoot, home, env: {} }).checks.find(
      (c) => c.name === "egress-guard",
    )!;
    expect(clean.ok).toBe(true);
    expect(clean.detail).toMatch(/refuse to start|would refuse/i);

    // Key present → doctor flags it and explains the refusal + the fix (unset it).
    const keyed = runDoctor({
      projectRoot,
      home,
      env: { ANTHROPIC_API_KEY: "sk-test" },
    }).checks.find((c) => c.name === "egress-guard")!;
    expect(keyed.ok).toBe(false);
    expect(keyed.detail).toMatch(/REFUSE to start/);
    expect(keyed.fix).toMatch(/Unset ANTHROPIC_API_KEY/);
  });
});
