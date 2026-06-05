import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK smart behavior", () => {
  test("preserves local LLM summary signal without raw prompt boilerplate", async () => {
    const result = await filterRtkOutput(
      ["smart", "src/main.rs"],
      ["System prompt: summarize this file", "Summary: parser routes commands to handlers"].join("\n"),
    );

    expect(result.output).toContain("parser routes commands");
    expect(result.output).not.toMatch(/System prompt/);

    expectRtkParity(result, {
      critical: [
        "parser routes commands",
      ],
      forbidden: [
        /System prompt/,
      ],
      // The summary payload is the full text after "Summary:"; the filter keeps it
      // verbatim (only the "System prompt:" framing is stripped). This matches the
      // goal's contract: "Output must exact-equal the summary text."
      exact: "parser routes commands to handlers",
    });
  });
});
