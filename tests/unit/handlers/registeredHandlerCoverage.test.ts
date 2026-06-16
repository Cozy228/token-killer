import { describe, expect, test } from "vitest";

import { fixtureBackedHandlers } from "../../helpers/fixtureCases.js";
import { handlers } from "../../../src/handlers/index.js";

const exemptHandlers = new Set(["generic"]);

describe("registered handler fixture coverage", () => {
  // One aggregate assertion (was 58 per-handler `test.each` cases): every
  // non-generic registered handler must carry at least one fixtureCases row, so a
  // newly added handler without fixture-backed behavior coverage fails the product
  // suite. This mirrors scripts/check-test-presence.sh, but that script only runs
  // under `pnpm test:ci`, so keeping the check in-suite preserves the fast local
  // signal — collapsing it to one case just drops the redundant per-handler fan-out.
  test("every non-generic handler has at least one fixtureCases row", () => {
    const backed = fixtureBackedHandlers();
    const missing = handlers
      .map((handler) => handler.name)
      .filter((name) => !exemptHandlers.has(name) && !backed.has(name));

    expect(missing, `handlers missing fixture-backed coverage: ${missing.join(", ")}`).toEqual([]);
  });
});
