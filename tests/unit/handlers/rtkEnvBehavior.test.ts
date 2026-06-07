import { describe, expect, test } from "vitest";

import {
  expectRtkParity,
  filterRtkFixture,
  filterRtkOutput,
} from "../../helpers/rtkCommandHarness.js";

describe("RTK env behavior", () => {
  // ADR 0001 divergence: tg's env handler is a STRUCTURAL handler that always
  // reshapes (group + mask secrets) but is LOSSLESS within budget — it does NOT
  // drop noise, does NOT preview-truncate long values, and fully expands PATH.
  // RTK instead drops noise/uncategorized secrets ("showing 17 relevant") and
  // applies a 50-char "... (N chars)" preview before the PATH split. tg keeps
  // every var (adds an "Other:" bucket) and shows all 13 PATH entries.
  // Approved divergence: assert tg's full-retention + masking, not RTK's drop.
  test("groups relevant vars, masks shown secrets, keeps all vars and full PATH", async () => {
    const result = await filterRtkFixture(["env"], "tests/fixtures/system/env_full.txt");

    // PATH is fully expanded to all 13 real entries — no "... (N chars)" preview,
    // no "+N more" truncation. tg keeps every colon-delimited segment.
    expect(result.output).toContain("PATH Variables:");
    expect(result.output).toContain("PATH (13 entries):");
    expect(result.output).toContain("    /usr/local/bin");
    expect(result.output).toContain("    /Users/dev/go/bin"); // the 13th entry
    expect(result.output).not.toContain("... (190 chars)"); // no preview truncation

    // Category headers, including tg's "Other:" bucket for uncategorized vars.
    expect(result.output).toContain("Language/Runtime:");
    expect(result.output).toContain("Cloud/Services:");
    expect(result.output).toContain("Tools:");
    expect(result.output).toContain("Other:");

    // Non-sensitive vars are kept verbatim under their category.
    expect(result.output).toContain("NODE_VERSION=22.11.0");
    expect(result.output).toContain("AWS_REGION=us-east-1");
    expect(result.output).toContain("EDITOR=vim");
    expect(result.output).toContain("HOME=/Users/dev");

    // Sensitive vars are masked, not hidden.
    // tg: mask_value (2-char prefix + "****" + 2-char suffix).
    expect(result.output).toContain("AWS_SECRET_ACCESS_KEY=wJ****45");
    expect(result.output).toContain("AWS_ACCESS_KEY_ID=AK****LE");
    expect(result.output).toContain("GITHUB_TOKEN=gh****op");
    expect(result.output).toContain("GIT_AUTHOR_NAME=Ex****ev");

    // ADR 0001 divergence: uncategorized secrets are NOT dropped — tg keeps them
    // under "Other:" but STILL masks them, so the raw value never leaks.
    expect(result.output).toContain("API_KEY=fi****90");
    expect(result.output).toContain("SECRET_DEPLOY_PASSWORD=hu****r2");

    // Raw secret material must never appear in the masked output.
    expect(result.output).not.toMatch(/fixture_api_secret_supersecretvalue/);
    expect(result.output).not.toMatch(/wJalrXUtnFEMIbKbanana/);
    expect(result.output).not.toMatch(/ghp_abcdef/);
    expect(result.output).not.toMatch(/hunter2/);

    // ADR 0001 divergence: tg retains noise/uncategorized vars rather than
    // dropping them, so "showing" equals the total — nothing is hidden.
    expect(result.output).toContain("RANDOM_NOISE_VAR");
    expect(result.output).toContain("__CF_USER_TEXT_ENCODING");
    expect(result.output).toContain("LDFLAGS");

    // Summary line: 25 parsed vars, all 25 shown (full retention within budget).
    expect(result.output).toContain("Total: 25 vars (showing 25 relevant)");

    expectRtkParity(result, {
      critical: [
        "PATH (13 entries):",
        "Language/Runtime:",
        "Cloud/Services:",
        "Tools:",
        "Other:",
        "AWS_SECRET_ACCESS_KEY=wJ****45",
        "GITHUB_TOKEN=gh****op",
        "API_KEY=fi****90",
        "Total: 25 vars (showing 25 relevant)",
      ],
      forbidden: [
        /fixture_api_secret_supersecretvalue/,
        /wJalrXUtnFEMIbKbanana/,
        /ghp_abcdef/,
        /hunter2/,
      ],
    });
  });

  // ADR 0001 divergence: tg masks short sensitive values to "****" (length <= 4)
  // just like RTK, but does NOT drop noise/uncategorized vars. RANDOM_NOISE and
  // DEPLOY_TOKEN are kept (DEPLOY_TOKEN is sensitive -> still masked "****").
  // Approved divergence: assert tg masks short secrets AND retains noise.
  test("masks short sensitive values to **** (mask_value short branch)", async () => {
    const stdout = [
      "PATH=/usr/local/bin:/usr/bin:/bin:/opt/a/bin:/opt/b/bin:/opt/c/bin:/opt/d/bin:/opt/e/bin",
      "DEPLOY_TOKEN=abcd", // exactly 4 chars + sensitive (token) -> "****"
      "VAULT_PASSWORD=xy", // 2 chars + sensitive (password) -> "****"
      "NODE_VERSION=22.11.0",
      "HOME=/Users/dev",
      "RANDOM_NOISE=irrelevant-noise-value-to-pad-the-input-and-force-compression-here",
      "MORE_NOISE=another-irrelevant-value-that-is-dropped-by-the-env-filter-entirely",
    ].join("\n");

    const result = await filterRtkOutput(["env"], stdout);

    // VAULT_PASSWORD is sensitive (password); 2 chars -> "****".
    expect(result.output).toContain("VAULT_PASSWORD=****");
    expect(result.output).not.toContain("=xy");
    // DEPLOY_TOKEN is sensitive (token); tg keeps it but masks the 4-char value.
    expect(result.output).toContain("DEPLOY_TOKEN=****");
    expect(result.output).not.toContain("=abcd");
    // ADR 0001 divergence: tg retains noise vars (does not drop them).
    expect(result.output).toContain("RANDOM_NOISE");

    expectRtkParity(result, {
      critical: ["VAULT_PASSWORD=****", "DEPLOY_TOKEN=****", "NODE_VERSION=22.11.0"],
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
    const stdout = [
      "PATH=/usr/bin:/bin",
      "HOME=/home/u",
      "AWS_SECRET_ACCESS_KEY=fixture_api_secret_supersecretvalue",
    ].join("\n");

    const result = await filterRtkOutput(["env"], stdout);

    // The secret is masked (cloud + sensitive) and the raw value never appears.
    expect(result.output).toContain("AWS_SECRET_ACCESS_KEY=fi****ue");
    expect(result.output).not.toMatch(/fixture_api_secret_supersecretvalue/);

    expectRtkParity(result, {
      critical: ["AWS_SECRET_ACCESS_KEY=fi****ue"],
      forbidden: [/fixture_api_secret_supersecretvalue/],
    });
  });

  // ADR 0001 divergence: tg expands the PATH to its real entry count with no
  // "+N more" marker (lossless within budget), and — unlike RTK — KEEPS the
  // NOISE_* vars under "Other:" rather than dropping them. (NOISE_TWO's value
  // literally contains the substring "more", so we assert the absence of the
  // truncation marker "+N more", not the bare word "more".)
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

    // 5 real entries, all shown, no truncation marker.
    expect(result.output).toContain("PATH (5 entries):");
    expect(result.output).toContain("    /usr/local/bin");
    expect(result.output).toContain("    /opt/b");
    expect(result.output).not.toContain("+N more");
    expect(result.output).not.toMatch(/\+\d+ more/);

    // ADR 0001 divergence: tg retains the noise vars (RTK would drop them).
    expect(result.output).toContain("NOISE_ONE");
    expect(result.output).toContain("NOISE_TWO");

    expectRtkParity(result, {
      critical: ["PATH (5 entries):", "    /opt/b"],
      forbidden: [/\+\d+ more/],
    });
  });
});
