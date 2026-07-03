import { describe, test } from "vitest";

// Slice 1i — install/doctor. Flipped green by the 1i implementer.
// A10-install runs against a sandbox HOME (G-7): never touch the real host config.
describe("acceptance: 1i install/doctor", () => {
  test.todo("A10-install"); // sandbox HOME only
  test.todo("A10-node");
});
