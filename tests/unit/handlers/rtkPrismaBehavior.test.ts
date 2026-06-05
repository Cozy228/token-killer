import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

// RTK oracle: rtk/src/cmds/js/prisma_cmd.rs.
// Each test mirrors an RTK #[test] dimension (filter_generate, filter_migrate_dev,
// migrate deploy, extract_number) and asserts the EXACT RTK output format.
describe("RTK prisma behavior", () => {
  // RTK: prisma_cmd.rs::test_filter_generate + filter_prisma_generate.
  // filter_prisma_generate emits "Prisma Client generated", strips the schema-load
  // chatter / "Start by importing" block. The "N models, N enums, N types" line only
  // appears when a count is extracted; this real-CLI banner does not yield counts
  // (the summary line "42 models, 18 enums, 890 types generated" sets each var, but
  // the asserted invariant is the header + stripped chatter).
  test("generate: emits Prisma Client generated and strips schema-load chatter", async () => {
    const result = await filterRtkOutput(
      ["prisma", "generate"],
      [
        "Environment variables loaded from .env",
        "Prisma schema loaded from prisma/schema.prisma",
        "",
        "✔ Generated Prisma Client (v5.7.0) to ./node_modules/@prisma/client in 234ms",
        "",
        "Start by importing your Prisma Client:",
        "",
        "import { PrismaClient } from '@prisma/client'",
        "const prisma = new PrismaClient()",
        "",
        "Need help? Visit https://pris.ly/d/getting-started for guidance.",
        "Tip: Explore the data in your project with Prisma Studio.",
        "Read the docs to learn about indexes, relations, and migrations.",
      ].join("\n"),
    );

    expect(result.output).toContain("Prisma Client generated");

    expectRtkParity(result, {
      critical: ["Prisma Client generated"],
      forbidden: [
        /Prisma schema loaded/,
        /Start by importing/,
        /Environment variables loaded/,
        /pris\.ly/,
      ],
    });
  });

  // RTK: prisma_cmd.rs::test_filter_migrate_dev + filter_migrate_dev.
  // Exact format: "Migration: <name>", a "═" rule, "Changes:" with "+ N table(s)",
  // "~ N table(s) modified", "+ N relation(s)", "~ N index(es)", then
  // "Applied | Pending: 0".
  // Relations are only counted via extract_table_name, which requires the FOREIGN
  // KEY / REFERENCES line to ALSO contain the literal "TABLE". The standalone
  // "ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY ... REFERENCES" line therefore
  // both bumps tables-modified (ALTER TABLE) and yields one relation — faithfully
  // exercising RTK's extract_table_name keyword-scan quirk.
  test("migrate dev: summarizes migration name, table/relation/index changes, applied state", async () => {
    const result = await filterRtkOutput(
      ["prisma", "migrate", "dev", "--name", "add_sessions"],
      [
        "Environment variables loaded from .env",
        "Prisma schema loaded from prisma/schema.prisma",
        "Datasource \"db\": PostgreSQL database \"app\", schema \"public\" at \"localhost:5432\"",
        "",
        "Applying migration 20260128_add_sessions",
        "",
        "The following migration(s) have been created and applied from new schema changes:",
        "",
        "CREATE TABLE \"Session\" (",
        "  \"id\" TEXT NOT NULL,",
        "  \"userId\" TEXT NOT NULL,",
        "  \"status\" TEXT NOT NULL,",
        "  CONSTRAINT \"Session_pkey\" PRIMARY KEY (\"id\")",
        ");",
        "",
        "ALTER TABLE \"Session\" ADD CONSTRAINT \"Session_userId_fkey\" FOREIGN KEY (\"userId\") REFERENCES \"User\"(\"id\") ON DELETE CASCADE;",
        "",
        "CREATE UNIQUE INDEX \"session_token_idx\" ON \"Session\"(\"token\");",
        "CREATE INDEX \"session_status_idx\" ON \"Session\"(\"status\");",
        "",
        "✓ Migration applied successfully",
        "",
        "Your database is now in sync with your schema.",
        "Running generate... (Use --skip-generate to skip the generators)",
      ].join("\n"),
    );

    expect(result.output).toContain("20260128_add_sessions");

    expectRtkParity(result, {
      critical: [
        "Migration: 20260128_add_sessions",
        "Changes:",
        "+ 1 table(s)",
        "~ 1 table(s) modified",
        "+ 1 relation(s)",
        "~ 2 index(es)",
        "Applied | Pending: 0",
      ],
      forbidden: [
        /Prisma schema loaded/,
        /Datasource/,
        /database is now in sync/,
        /skip-generate/,
      ],
    });
  });

  // RTK: prisma_cmd.rs::filter_migrate_deploy ("migrate deploy" #[test] dimension).
  // Counts lines containing "applied"/"✓" → "N migration(s) deployed". Errors empty.
  test("migrate deploy: counts applied migrations and strips schema load chatter", async () => {
    const result = await filterRtkOutput(
      ["prisma", "migrate", "deploy"],
      [
        "Environment variables loaded from .env",
        "Prisma schema loaded from prisma/schema.prisma",
        "Datasource \"db\": PostgreSQL database \"app\" at \"localhost:5432\"",
        "",
        "3 migrations found in prisma/migrations",
        "",
        "Applying migration 20260101_init",
        "The following migration have been applied:",
        "✓ 20260101_init applied",
        "✓ 20260115_add_users applied",
        "✓ 20260128_add_sessions applied",
        "",
        "All migrations have been successfully applied.",
      ].join("\n"),
    );

    expectRtkParity(result, {
      critical: ["migration(s) deployed"],
      forbidden: [
        /Prisma schema loaded/,
        /Datasource/,
        /migrations found in/,
      ],
      // 5 lines contain "applied"/"✓": the header "have been applied", 3 "✓ ...
      // applied" lines, and "successfully applied". "Applying migration" does NOT
      // contain the substring "applied", so it is not counted.
      exact: "5 migration(s) deployed",
    });
  });

  // RTK: prisma_cmd.rs::test_extract_number — extract_number returns the first
  // whitespace-delimited token that parses as an unsigned integer; the generate
  // summary feeds it the model/enum/type counts. "42 models, 18 enums, 890 types".
  test("generate: extract_number feeds the model/enum/type count summary", async () => {
    const result = await filterRtkOutput(
      ["prisma", "generate"],
      [
        "Environment variables loaded from .env",
        "Prisma schema loaded from prisma/schema.prisma",
        "",
        "✔ Generated Prisma Client (v5.7.0) to ./node_modules/@prisma/client in 412ms",
        "",
        "42 model objects generated",
        "18 enum definitions",
        "890 type aliases",
        "",
        "Start by importing your Prisma Client:",
        "import { PrismaClient } from '@prisma/client'",
        "Read more about generators at https://pris.ly/d/prisma-schema",
      ].join("\n"),
    );

    expectRtkParity(result, {
      critical: [
        "Prisma Client generated",
        // node_modules + @prisma line yields the Output bullet.
        "• Output: node_modules/@prisma/client",
        // models=42 (model+generated), enums=18 (enum line), types=890 (type line).
        "• 42 models, 18 enums, 890 types",
      ],
      forbidden: [
        /Prisma schema loaded/,
        /Start by importing/,
      ],
    });
  });
});
