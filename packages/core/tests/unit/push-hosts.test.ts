import { describe, expect, test } from "vitest";
import {
  applyManagedBlock,
  extractManagedBlock,
  placePushBlock,
  writeManagedBlock,
} from "../../src/push/hosts.ts";
import { cleanupTempDir, makeTempDir } from "../helpers/sandbox.ts";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BLOCK = "<!-- ctx:managed:begin -->\nheader line\n<!-- ctx:managed:end -->";
const BLOCK2 = "<!-- ctx:managed:begin -->\nnew content\n<!-- ctx:managed:end -->";

// §10 unit — sentinel-block replacement byte-exactness + no-op guard.
describe("push hosts: managed-block placement", () => {
  test("append to empty input → block + trailing newline", () => {
    const { content, changed } = applyManagedBlock("", BLOCK);
    expect(changed).toBe(true);
    expect(content).toBe(`${BLOCK}\n`);
  });

  test("replace preserves surrounding bytes exactly", () => {
    const pre = "# Title\n\nintro paragraph.\n\n";
    const post = "\n\n## Tail\n\nmore text.\n";
    const existing = pre + BLOCK + post;
    const { content, changed } = applyManagedBlock(existing, BLOCK2);
    expect(changed).toBe(true);
    expect(content).toBe(pre + BLOCK2 + post);
    expect(content.startsWith(pre)).toBe(true);
    expect(content.endsWith(post)).toBe(true);
  });

  test("identical block → no-op guard (changed:false, byte-identical)", () => {
    const existing = `# X\n\n${BLOCK}\n\ntail\n`;
    const { content, changed } = applyManagedBlock(existing, BLOCK);
    expect(changed).toBe(false);
    expect(content).toBe(existing);
  });

  test("tolerates hand-edited marker whitespace when replacing", () => {
    const loose = "<!--  ctx:managed:begin  -->\nold\n<!--ctx:managed:end-->";
    const existing = `pre\n${loose}\npost`;
    const { content, changed } = applyManagedBlock(existing, BLOCK2);
    expect(changed).toBe(true);
    expect(content).toBe(`pre\n${BLOCK2}\npost`);
    expect(extractManagedBlock(existing)).toBe(loose);
  });

  test("append after content without a block uses minimal separation", () => {
    // A blank line always separates existing content from the block.
    expect(applyManagedBlock("line\n", BLOCK).content).toBe(`line\n\n${BLOCK}\n`);
    expect(applyManagedBlock("line", BLOCK).content).toBe(`line\n\n${BLOCK}\n`);
    expect(applyManagedBlock("line\n\n", BLOCK).content).toBe(`line\n\n${BLOCK}\n`);
  });
});

describe("push hosts: filesystem placement", () => {
  test("writeManagedBlock refuses paths outside the project root", () => {
    const root = makeTempDir("ctx-hosts-");
    try {
      expect(() =>
        writeManagedBlock(join(root, "..", "escape.md"), BLOCK, { projectRoot: root }),
      ).toThrow(/outside the project root/);
    } finally {
      cleanupTempDir(root);
    }
  });

  test("placePushBlock writes both two-file-floor targets, then no-ops", () => {
    const root = makeTempDir("ctx-hosts-");
    try {
      const first = placePushBlock(root, BLOCK);
      expect(
        first.map((r) => r.path.endsWith("AGENTS.md") || r.path.endsWith("CLAUDE.md")),
      ).toEqual([true, true]);
      expect(first.every((r) => r.created && r.changed)).toBe(true);
      expect(existsSync(join(root, "AGENTS.md"))).toBe(true);
      expect(existsSync(join(root, "CLAUDE.md"))).toBe(true);

      const second = placePushBlock(root, BLOCK);
      expect(second.every((r) => !r.changed && !r.created)).toBe(true);
    } finally {
      cleanupTempDir(root);
    }
  });

  test("dryRun computes results without touching disk", () => {
    const root = makeTempDir("ctx-hosts-");
    try {
      writeFileSync(join(root, "AGENTS.md"), "existing\n");
      const res = placePushBlock(root, BLOCK, { targets: ["AGENTS.md"], dryRun: true });
      expect(res[0]?.changed).toBe(true);
      expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toBe("existing\n"); // untouched
    } finally {
      cleanupTempDir(root);
    }
  });
});
