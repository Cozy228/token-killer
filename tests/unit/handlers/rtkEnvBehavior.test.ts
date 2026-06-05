import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkFixture, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK env behavior", () => {
  // RTK: env_cmd.rs::run — group interesting variables under category headers,
  // mask secrets that land in a shown category, drop noise + uncategorized
  // secrets entirely, and apply the long-value preview (> 100 chars) to EVERY
  // var (including PATH) before the PATH-specific "(N entries)" split.
  test("groups relevant vars, masks shown secrets, previews long values, drops noise", async () => {
    const result = await filterRtkFixture(["env"], "tests/fixtures/system/env_full.txt");

    // PATH grouping. The raw PATH value is > 100 chars, so RTK first replaces it
    // with a 50-char preview ("... (N chars)") and only then splits on ":".
    // The 50-char preview /usr/local/bin:/usr/bin:/bin:/opt/tools/bin:/tmp/b
    // contains 5 colon-delimited segments -> "(5 entries)".
    // RTK: env_cmd.rs::run (display_value long-preview branch + PATH split).
    expect(result.output).toContain("PATH Variables:");
    expect(result.output).toContain("PATH (5 entries):");
    expect(result.output).toContain("    /usr/local/bin");
    expect(result.output).toContain("... (190 chars)");

    // Category headers. RTK: env_cmd.rs::run println! headers.
    expect(result.output).toContain("Language/Runtime:");
    expect(result.output).toContain("Cloud/Services:");
    expect(result.output).toContain("Tools:");
    expect(result.output).toContain("Other:");

    // Non-sensitive vars are kept verbatim under their category.
    expect(result.output).toContain("NODE_VERSION=22.11.0");
    expect(result.output).toContain("AWS_REGION=us-east-1");
    expect(result.output).toContain("EDITOR=vim");
    expect(result.output).toContain("HOME=/Users/dev");

    // Sensitive vars that DO land in a shown category are masked, not hidden.
    // RTK: env_cmd.rs::mask_value (2-char prefix + "****" + 2-char suffix).
    // AWS_SECRET_ACCESS_KEY -> cloud + sensitive; value ends in "...45".
    expect(result.output).toContain("AWS_SECRET_ACCESS_KEY=wJ****45");
    // AWS_ACCESS_KEY_ID -> cloud + sensitive.
    expect(result.output).toContain("AWS_ACCESS_KEY_ID=AK****LE");
    // GITHUB_TOKEN matches the "GIT" tool pattern + "token" sensitive pattern.
    expect(result.output).toContain("GITHUB_TOKEN=gh****op");
    // GIT_AUTHOR_NAME -> tool ("GIT") + sensitive ("auth" inside "AUTHOR").
    expect(result.output).toContain("GIT_AUTHOR_NAME=Ex****ev");

    // Raw secret material must never appear in the masked output.
    expect(result.output).not.toMatch(/fixture_api_secret_supersecretvalue/);
    expect(result.output).not.toMatch(/wJalrXUtnFEMIbKbanana/);
    expect(result.output).not.toMatch(/ghp_abcdef/);

    // Uncategorized secrets are dropped entirely (no category to show them in).
    // RTK: env_cmd.rs::run — API_KEY / SECRET_DEPLOY_PASSWORD match no category.
    expect(result.output).not.toContain("API_KEY");
    expect(result.output).not.toContain("SECRET_DEPLOY_PASSWORD");
    expect(result.output).not.toMatch(/hunter2/);

    // Pure noise is dropped.
    expect(result.output).not.toContain("RANDOM_NOISE_VAR");
    expect(result.output).not.toContain("__CF_USER_TEXT_ENCODING");
    expect(result.output).not.toContain("LDFLAGS");

    // Summary line. RTK: env_cmd.rs::run "Total: {} vars (showing {} relevant)".
    // 25 parsed vars; shown = path(1)+lang(4)+cloud(3)+tool(5)+other(4) = 17.
    expect(result.output).toContain("Total: 25 vars (showing 17 relevant)");

    expectRtkParity(result, {
      critical: [
        "PATH (5 entries):",
        "... (190 chars)",
        "Language/Runtime:",
        "Cloud/Services:",
        "Tools:",
        "Other:",
        "AWS_SECRET_ACCESS_KEY=wJ****45",
        "GITHUB_TOKEN=gh****op",
        "Total: 25 vars (showing 17 relevant)",
      ],
      forbidden: [
        /fixture_api_secret_supersecretvalue/,
        /wJalrXUtnFEMIbKbanana/,
        /ghp_abcdef/,
        /hunter2/,
      ],
      // RTK env condenses a noisy dump; the structured view must beat raw size.
      minSavingsRatio: 0.2,
    });
  });

  // RTK: env_cmd.rs::test_mask_value_short / test_mask_value_exactly_four —
  // values of length <= 4 are fully masked to "****".
  test("masks short sensitive values to **** (mask_value short branch)", async () => {
    const stdout = [
      "PATH=/usr/local/bin:/usr/bin:/bin:/opt/a/bin:/opt/b/bin:/opt/c/bin:/opt/d/bin:/opt/e/bin",
      "DEPLOY_TOKEN=abcd", // exactly 4 chars -> "****"
      "VAULT_PASSWORD=xy", // 2 chars -> "****"
      "NODE_VERSION=22.11.0",
      "HOME=/Users/dev",
      "RANDOM_NOISE=irrelevant-noise-value-to-pad-the-input-and-force-compression-here",
      "MORE_NOISE=another-irrelevant-value-that-is-dropped-by-the-env-filter-entirely",
    ].join("\n");

    const result = await filterRtkOutput(["env"], stdout);

    // VAULT_PASSWORD is a cloud var (VAULT) + sensitive (password); 2 chars -> ****.
    expect(result.output).toContain("VAULT_PASSWORD=****");
    expect(result.output).not.toContain("=xy");
    // DEPLOY_TOKEN matches no category, so it is dropped (still must not leak raw).
    expect(result.output).not.toContain("=abcd");
    expect(result.output).not.toContain("RANDOM_NOISE");

    expectRtkParity(result, {
      critical: ["VAULT_PASSWORD=****", "NODE_VERSION=22.11.0"],
      forbidden: [/=xy/, /=abcd/],
    });
  });

  // RTK: env_cmd.rs::test_mask_value_long / test_mask_value_five_chars —
  // longer values keep a 2-char prefix and 2-char suffix around the mask.
  test("masks long sensitive values keeping 2-char prefix/suffix", async () => {
    const stdout = [
      "PATH=/usr/local/bin:/usr/bin:/bin:/opt/a/bin:/opt/b/bin:/opt/c/bin",
      "AWS_SECRET_ACCESS_KEY=supersecrettoken",
      "DOCKER_AUTH_TOKEN=abcde", // 5 chars -> "ab****de"
      "NODE_ENV=production",
      "HOME=/Users/dev",
      "FILLER_NOISE=padding-value-to-keep-the-raw-input-above-the-inflation-gate-size",
    ].join("\n");

    const result = await filterRtkOutput(["env"], stdout);

    // 16-char value "supersecrettoken" -> "su****en".
    expect(result.output).toContain("AWS_SECRET_ACCESS_KEY=su****en");
    // 5-char value "abcde" -> "ab****de" (DOCKER_* is a cloud var + auth/token).
    expect(result.output).toContain("DOCKER_AUTH_TOKEN=ab****de");
    expect(result.output).not.toMatch(/supersecrettoken/);
    expect(result.output).not.toContain("=abcde");

    expectRtkParity(result, {
      critical: ["AWS_SECRET_ACCESS_KEY=su****en", "DOCKER_AUTH_TOKEN=ab****de"],
      forbidden: [/supersecrettoken/],
    });
  });

  // Regression guard (security): a SMALL env dump whose masked/grouped form is no
  // smaller than raw must STILL mask secrets and never revert to raw passthrough.
  // RTK always emits the masked view regardless of size, so env is in base.ts
  // STRUCTURAL_HANDLERS; without that the inflation gate would bounce a tiny env
  // back to raw and leak the unmasked secret. No padding here — the point is that
  // the contract holds even when the structured form does not shrink the input.
  test("masks secrets on a tiny env without reverting to raw (no leak)", async () => {
    const stdout = ["PATH=/usr/bin:/bin", "HOME=/home/u", "AWS_SECRET_ACCESS_KEY=fixture_api_secret_supersecretvalue"].join("\n");

    const result = await filterRtkOutput(["env"], stdout);

    // The secret is masked (cloud + sensitive) and the raw value never appears.
    expect(result.output).toContain("AWS_SECRET_ACCESS_KEY=fi****ue");
    expect(result.output).not.toMatch(/fixture_api_secret_supersecretvalue/);

    expectRtkParity(result, {
      critical: ["AWS_SECRET_ACCESS_KEY=fi****ue"],
      forbidden: [/fixture_api_secret_supersecretvalue/],
    });
  });

  // RTK: env_cmd.rs::run PATH branch — a PATH whose value is <= 100 chars is NOT
  // preview-truncated, so it splits into its real entry count. With <= 10 entries
  // there is no "+N more" marker.
  test("expands a short PATH fully without a more marker", async () => {
    const stdout = [
      "PATH=/usr/local/bin:/usr/bin:/bin:/opt/a:/opt/b",
      "NODE_VERSION=22.11.0",
      "AWS_REGION=us-east-1",
      "EDITOR=vim",
      "HOME=/Users/example-developer-with-a-longer-home-path-for-padding-bytes",
      "NOISE_ONE=some-irrelevant-noise-value-that-pads-the-raw-input-size-up",
      "NOISE_TWO=more-irrelevant-noise-value-that-also-gets-dropped-entirely",
    ].join("\n");

    const result = await filterRtkOutput(["env"], stdout);

    // 5 real entries, all shown, no "+N more".
    expect(result.output).toContain("PATH (5 entries):");
    expect(result.output).toContain("    /usr/local/bin");
    expect(result.output).toContain("    /opt/b");
    expect(result.output).not.toContain("more");

    expectRtkParity(result, {
      critical: ["PATH (5 entries):", "    /opt/b"],
      forbidden: [/NOISE_ONE/, /NOISE_TWO/],
    });
  });
});
