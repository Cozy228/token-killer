import { describe, expect, test } from "vitest";

import { fixtureBackedHandlers } from "../../helpers/fixtureCases.js";
import { handlers } from "../../../src/handlers/index.js";

const exemptHandlers = new Set(["generic"]);

describe("registered handler fixture coverage", () => {
  test.each(
    handlers
      .filter((handler) => !exemptHandlers.has(handler.name))
      .map((handler) => [handler.name, handler] as const),
  )("%s has fixture-backed behavior coverage", (name) => {
    expect(
      fixtureBackedHandlers().has(name),
      `${name} must have at least one tests/fixtures case in fixtureCases`,
    ).toBe(true);
  });
});
