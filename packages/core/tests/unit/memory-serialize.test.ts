/**
 * Slice 3 — committed-line grammar (C1/C2) + E4 secret guard, pure-function unit
 * tests. No IO, no clock: serialization must round-trip 1:1 with the event shape
 * and survive spaces / newlines / unicode / `=` in any value (percent-encoding),
 * so a line is never torn by the E2 union merge.
 */
import { describe, expect, test } from "vitest";
import {
  lineTag,
  parseDecision,
  parseMemory,
  serializeDecision,
  serializeMemory,
  type SerializedDecision,
  type SerializedMemory,
} from "../../src/memory/serialize.ts";
import {
  scanForSecret,
  scanMemoryForSecret,
  secretRemediationNote,
} from "../../src/memory/secretGuard.ts";

describe("committed-line serialization grammar (C1/C2)", () => {
  test("memory entry round-trips 1:1, single physical line", () => {
    const m: SerializedMemory = {
      eventId: "01EVENTAAAAAAAAAAAAAAAAAAA",
      at: 1_700_000_000_123,
      memoryId: "mem:01MEMORYAAAAAAAAAAAAAAAA",
      actor: "agent",
      carrier: "memory",
      method: "explicit-key",
      authority: "confirmed",
      status: "active",
      gist: "retry queue drops metadata = bad; persist the key (see §4)",
      origin: "remember",
      detailPointer: "01MEMORYAAAAAAAAAAAAAAAA",
      anchors: ["sym:src/retry.ts#redeliver", "file:src/retry.ts"],
      anchoredAt: "abc123def456",
      sessionRef: "sess 42",
      reason: "because\nnewline and space",
      validFrom: 1000,
      validTo: 2000,
    };
    const line = serializeMemory(m);
    expect(line.split("\n")).toHaveLength(1); // exactly one physical line
    expect(line.startsWith("- mem ")).toBe(true);
    expect(lineTag(line)).toBe("mem");
    const parsed = parseMemory(line);
    expect(parsed).toEqual(m);
  });

  test("decision entry round-trips 1:1 with refs", () => {
    const d: SerializedDecision = {
      eventId: "01DECAAAAAAAAAAAAAAAAAAAAA",
      at: 1_700_000_000_999,
      memoryId: "mem:01MEMORYAAAAAAAAAAAAAAAA",
      verb: "supersede",
      actor: "cli",
      carrier: "cli",
      method: "explicit-key",
      authority: "confirmed",
      reason: "replaced",
      locus: "01EVENTX",
      refs: { supersededBy: "mem:01NEW", conflictA: 3, conflictB: 4 },
    };
    const line = serializeDecision(d);
    expect(line.split("\n")).toHaveLength(1);
    expect(lineTag(line)).toBe("dec");
    expect(parseDecision(line)).toEqual(d);
  });

  test("unicode / spaces / `=` in a gist survive the round-trip", () => {
    const m: SerializedMemory = {
      eventId: "01E",
      at: 5,
      memoryId: "mem:01X",
      actor: "agent",
      carrier: "memory",
      method: "explicit-key",
      authority: "inferred",
      status: "needs-review",
      gist: "café — a=b & c==d 日本語 spaces here",
      origin: "host-import:claude-code",
      anchors: [],
    };
    const parsed = parseMemory(serializeMemory(m));
    expect(parsed?.gist).toBe(m.gist);
  });

  test("a non-entry line is not misclassified", () => {
    expect(lineTag("# a markdown heading")).toBeUndefined();
    expect(parseMemory("- not an entry")).toBeUndefined();
    expect(parseDecision("- mem id=1 at=1 mid=x")).toBeUndefined(); // wrong tag
  });
});

describe("E4 secret-shaped guard (deterministic, reusable)", () => {
  test("credential shapes are flagged with a stable class", () => {
    expect(scanForSecret("token is sk-ABCDEFGH1234567890xyz").cls).toBe("openai-key");
    expect(scanForSecret("AKIAIOSFODNN7EXAMPLE").cls).toBe("aws-access-key");
    expect(scanForSecret("ghp_0123456789abcdefghijklmnopqrstuvwx").cls).toBe("github-token");
    expect(scanForSecret("Authorization: Bearer abcdef0123456789ABCDEF").cls).toBe("bearer-token");
    expect(scanForSecret("-----BEGIN RSA PRIVATE KEY-----").cls).toBe("private-key");
    expect(scanForSecret('password = "hunter2xyz"').cls).toBe("credential-assignment");
    expect(
      scanForSecret(
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpM",
      ).cls,
    ).toBe("jwt");
  });

  test("ordinary prose is NOT a secret (no false-positive on keyword mentions)", () => {
    expect(scanForSecret("remember the password rotation policy for the team").secret).toBe(false);
    expect(scanForSecret("the retry queue drops metadata on redelivery").secret).toBe(false);
    expect(scanForSecret("").secret).toBe(false);
  });

  test("a secret may hide in the detail body", () => {
    expect(scanMemoryForSecret("a clean gist", "leaked sk-ABCDEFGH1234567890xyz here").secret).toBe(
      true,
    );
  });

  test("remediation guidance is success-shaped and names the class", () => {
    const note = secretRemediationNote("openai-key");
    expect(note).toContain("openai-key");
    expect(note.toLowerCase()).toContain("overlay");
    expect(note).not.toMatch(/error|failed/i);
  });
});
