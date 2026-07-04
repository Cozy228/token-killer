/**
 * Shared serve-invariant assertion helpers (M1-ACCEPTANCE §"Global invariants"
 * G-1..G-7). Slice 1a's design note: the serving slice turns the G-invariants
 * into SHARED ASSERTION HELPERS applied on EVERY serve response. `1g-serve.test`
 * and `global-invariants.test` both call these; earlier slices adopt them as
 * their surfaces come online.
 *
 * The helpers assert on the internal typed struct (`ServeResponse.diag`) — the
 * omission/budget properties target the struct, never the rendered string (P28).
 */
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { expect } from "vitest";
import { assertNoEgress } from "../../src/serve/egress.ts";
import { serveContext } from "../../src/serve/serve.ts";
import { MAX_RESPONSE_CHARS, type ServeResponse } from "../../src/serve/types.ts";
import { SECTION_ORDER } from "../../src/select/types.ts";
import type { Store } from "../../src/store/store.ts";

/** G-1: budget never exceeded — response ≤24K chars AND (context) used ≤ total. */
export function assertG1Budget(resp: ServeResponse): void {
  expect(resp.text.length, "G-1: response exceeds the 24K-char ceiling").toBeLessThanOrEqual(
    MAX_RESPONSE_CHARS,
  );
  if (resp.diag.envelope) {
    const { usedTokens, totalBudgetTokens } = resp.diag.envelope;
    expect(usedTokens, "G-1: selection used tokens exceed the total budget").toBeLessThanOrEqual(
      totalBudgetTokens,
    );
  }
}

/** G-2: envelope omission counts reconcile at the typed-struct level. */
export function assertG2Reconcile(resp: ServeResponse): void {
  if (resp.diag.sections) {
    let omittedTotal = 0;
    for (const s of resp.diag.sections) {
      expect(s.considered, `G-2: section ${s.name} considered != items + omitted`).toBe(
        s.items.length + s.omitted.length,
      );
      omittedTotal += s.omitted.length;
    }
    if (resp.diag.envelope) {
      expect(resp.diag.envelope.omittedTotal, "G-2: envelope omittedTotal mismatch").toBe(
        omittedTotal,
      );
    }
  }
  if (resp.diag.search) {
    const s = resp.diag.search;
    expect(s.considered, "G-2: search considered != items + omitted").toBe(
      s.items.length + s.omitted.length,
    );
  }
}

/** G-3: recoverable conditions are success-shaped (never `isError`). */
export function assertG3Recoverable(resp: ServeResponse): void {
  if (resp.diag.recoverable) {
    expect(resp.isError, "G-3: a recoverable condition was returned as isError").toBe(false);
  }
}

/** G-4: section order is a stable subsequence of SECTION_ORDER; no empty
 *  section is rendered (empty sections omitted entirely, never templated). */
export function assertG4Order(resp: ServeResponse): void {
  const order = resp.diag.sectionOrder;
  let cursor = -1;
  for (const name of order) {
    const idx = SECTION_ORDER.indexOf(name);
    expect(idx, `G-4: unknown/out-of-order section ${name}`).toBeGreaterThan(cursor);
    cursor = idx;
  }
  if (resp.diag.sections) {
    // Every rendered section had items; empty ones must NOT appear in the order.
    for (const name of order) {
      const s = resp.diag.sections.find((x) => x.name === name);
      if (s) expect(s.items.length, `G-4: empty section ${name} was rendered`).toBeGreaterThan(0);
    }
  }
}

/** G-5: every rendered handle round-trips (`ctx recall <handle>` resolves). */
export function assertG5Handles(resp: ServeResponse, store: Store): void {
  for (const handle of resp.diag.renderedHandles) {
    const resolved = store.resolveHandle(handle);
    expect(resolved, `G-5: rendered handle [${handle}] does not resolve`).toBeDefined();
    expect(
      store.getEntity(resolved!.entityId),
      `G-5: handle [${handle}] entity missing`,
    ).toBeDefined();
  }
}

/**
 * Apply every per-response invariant (G-1..G-5) to a serve response. Call this
 * on EVERY serve response across the scenario tests (the 1a design note).
 */
export function assertServeInvariants(resp: ServeResponse, store: Store): void {
  assertG1Budget(resp);
  assertG2Reconcile(resp);
  assertG3Recoverable(resp);
  assertG4Order(resp);
  assertG5Handles(resp, store);
}

/**
 * G-6: the egress guard is ACTIVE in the serve path. Proven two ways: the guard
 * itself refuses a present model key, and `serveContext` propagates that refusal
 * (never silently serves with a key in scope).
 */
export async function assertG6EgressActive(store: Store): Promise<void> {
  expect(() => assertNoEgress({ ANTHROPIC_API_KEY: "sk-should-refuse" })).toThrow(/refusing/);
  expect(() => assertNoEgress({ OPENAI_API_KEY: "sk-should-refuse" })).toThrow(/refusing/);
  // A clean env does NOT throw.
  expect(() => assertNoEgress({})).not.toThrow();
  // The serve entry point consults the guard against its injected env.
  await expect(
    serveContext({ store, env: { ANTHROPIC_API_KEY: "sk-should-refuse" } }, { task: "anything" }),
  ).rejects.toThrow(/refusing/);
}

/** G-7: the store's data home is a temp sandbox — never a real host config
 *  path (~/.claude, ~/.copilot, ~/.ctx). */
export function assertG7Sandbox(store: Store): void {
  const real = realpathSync(store.dbPath);
  const tmpReal = realpathSync(tmpdir());
  expect(real.startsWith(tmpReal), `G-7: store.dbPath ${real} is not under the temp sandbox`).toBe(
    true,
  );
  expect(real).not.toContain("/.claude/");
  expect(real).not.toContain("/.copilot/");
}
