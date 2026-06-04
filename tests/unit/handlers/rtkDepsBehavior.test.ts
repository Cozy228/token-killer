import { describe, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK deps behavior", () => {
  test("summarizes dependency manifests by ecosystem instead of dumping raw JSON", async () => {
    const result = await filterRtkOutput(
      ["deps"],
      JSON.stringify({
        dependencies: {
          react: "19.0.0",
          zod: "3.24.0",
        },
        devDependencies: {
          vitest: "4.1.8",
        },
        scripts: {
          test: "vitest",
        },
      }, null, 2),
    );

    expectRtkParity(result, {
      critical: [
        "Node.js (package.json):",
        "Dependencies (2):",
        "react (19.0.0)",
        "Dev (1):",
        "vitest (4.1.8)",
      ],
      forbidden: [
        /"scripts"/,
        /"dependencies"/,
      ],
      maxOutputChars: 220,
    });
  });
});
