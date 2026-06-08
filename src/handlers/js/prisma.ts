import type { ParsedCommand, RawResult, TkOptions } from "../../types.js";
import { rawText } from "../base.js";
import { defineHandler } from "../define.js";

// RTK: js/prisma_cmd.rs — strips Prisma CLI ASCII art and verbose decoration,
// summarizing generate / migrate dev / migrate deploy / migrate status / db push.
type PrismaMode = "generate" | "migrate-dev" | "migrate-status" | "migrate-deploy" | "db-push";

// RTK: js/prisma_cmd.rs::run — routes prisma subcommands to dedicated filters.
//   prisma generate                  → filter_prisma_generate
//   prisma migrate dev [--name X]    → filter_migrate_dev
//   prisma migrate status            → filter_migrate_status
//   prisma migrate deploy            → filter_migrate_deploy
//   prisma db push                   → filter_db_push
function detectMode(args: string[]): PrismaMode | undefined {
  const positional = args.filter((a) => !a.startsWith("-"));
  const first = positional[0];
  if (first === "generate") return "generate";
  if (first === "migrate") {
    const sub = positional[1];
    if (sub === "dev") return "migrate-dev";
    if (sub === "status") return "migrate-status";
    if (sub === "deploy") return "migrate-deploy";
    return undefined;
  }
  if (first === "db" && positional[1] === "push") return "db-push";
  return undefined;
}

// RTK: js/prisma_cmd.rs::extract_number — first whitespace-delimited token that
// parses as an unsigned integer.
function extractNumber(line: string): number | undefined {
  for (const word of line.split(/\s+/)) {
    if (word !== "" && /^\d+$/.test(word)) {
      return Number.parseInt(word, 10);
    }
  }
  return undefined;
}

// RTK: js/prisma_cmd.rs::extract_table_name — token following the `TABLE` keyword,
// trimmed of backticks/quotes/semicolons.
function extractTableName(line: string): string | undefined {
  if (!line.includes("TABLE")) return undefined;
  const parts = line.split(/\s+/).filter((p) => p !== "");
  for (let i = 0; i < parts.length; i += 1) {
    if (parts[i] === "TABLE" && i + 1 < parts.length) {
      return trimSqlIdent(parts[i + 1]!);
    }
  }
  return undefined;
}

// RTK: js/prisma_cmd.rs::extract_index_name — token following the `INDEX` keyword.
function extractIndexName(line: string): string | undefined {
  if (!line.includes("INDEX")) return undefined;
  const parts = line.split(/\s+/).filter((p) => p !== "");
  for (let i = 0; i < parts.length; i += 1) {
    if (parts[i] === "INDEX" && i + 1 < parts.length) {
      return trimSqlIdent(parts[i + 1]!);
    }
  }
  return undefined;
}

function trimSqlIdent(value: string): string {
  return value.replace(/^[`";]+/, "").replace(/[`";]+$/, "");
}

// RTK: js/prisma_cmd.rs::filter_prisma_generate — strip ASCII art, extract counts.
function filterPrismaGenerate(output: string): string {
  let models = 0;
  let enums = 0;
  let types = 0;
  let outputPath = "";

  for (const line of output.split("\n")) {
    // Skip ASCII art and box drawing.
    if (
      line.includes("█") ||
      line.includes("▀") ||
      line.includes("▄") ||
      line.includes("┌") ||
      line.includes("└") ||
      line.includes("│")
    ) {
      continue;
    }

    if (line.includes("model") && line.includes("generated")) {
      const num = extractNumber(line);
      if (num !== undefined) models = num;
    }
    if (line.includes("enum")) {
      const num = extractNumber(line);
      if (num !== undefined) enums = num;
    }
    if (line.includes("type")) {
      const num = extractNumber(line);
      if (num !== undefined) types = num;
    }

    if (line.includes("node_modules") && line.includes("@prisma")) {
      outputPath = line.trim();
    }
  }

  let result = "";
  result += "Prisma Client generated\n";

  if (models > 0 || enums > 0 || types > 0) {
    result += `  • ${models} models, ${enums} enums, ${types} types\n`;
  }

  if (outputPath !== "") {
    result += "  • Output: node_modules/@prisma/client\n";
  }

  return result.trim();
}

// RTK: js/prisma_cmd.rs::filter_migrate_dev — extract migration name + change counts.
function filterMigrateDev(output: string): string {
  let migrationName = "";
  let tablesAdded = 0;
  let tablesModified = 0;
  const relations: string[] = [];
  const indexes: string[] = [];
  let applied = false;

  for (const line of output.split("\n")) {
    // Extract migration name.
    if (line.includes("migration") && line.includes("_")) {
      const pos = line.indexOf("202");
      if (pos !== -1) {
        const rest = line.slice(pos);
        const wsMatch = rest.match(/\s/);
        const end = wsMatch?.index ?? rest.length;
        migrationName = rest.slice(0, end);
      }
    }

    // Count changes.
    if (line.includes("CREATE TABLE")) {
      tablesAdded += 1;
    }
    if (line.includes("ALTER TABLE")) {
      tablesModified += 1;
    }
    if (line.includes("FOREIGN KEY") || line.includes("REFERENCES")) {
      const table = extractTableName(line);
      if (table !== undefined) relations.push(table);
    }
    if (line.includes("CREATE INDEX") || line.includes("CREATE UNIQUE INDEX")) {
      const idx = extractIndexName(line);
      if (idx !== undefined) indexes.push(idx);
    }

    if (line.includes("applied") || line.includes("✓")) {
      applied = true;
    }
  }

  let result = "";

  if (migrationName !== "") {
    result += `Migration: ${migrationName}\n`;
    result += "═══════════════════════════════════════\n";
  }

  result += "Changes:\n";
  if (tablesAdded > 0) {
    result += `  + ${tablesAdded} table(s)\n`;
  }
  if (tablesModified > 0) {
    result += `  ~ ${tablesModified} table(s) modified\n`;
  }
  if (relations.length > 0) {
    result += `  + ${relations.length} relation(s)\n`;
  }
  if (indexes.length > 0) {
    result += `  ~ ${indexes.length} index(es)\n`;
  }

  result += "\n";
  if (applied) {
    result += "Applied | Pending: 0\n";
  }

  return result.trim();
}

// RTK: js/prisma_cmd.rs::filter_migrate_status — count applied/pending, latest name.
function filterMigrateStatus(output: string): string {
  let appliedCount = 0;
  let pendingCount = 0;
  let latestMigration = "";

  for (const line of output.split("\n")) {
    if (line.includes("applied")) {
      appliedCount += 1;
      if (latestMigration === "" && line.includes("202")) {
        const pos = line.indexOf("202");
        if (pos !== -1) {
          const rest = line.slice(pos);
          const wsMatch = rest.match(/\s/);
          const end = wsMatch?.index ?? 20;
          latestMigration = rest.slice(0, end);
        }
      }
    }
    if (line.includes("pending") || line.includes("unapplied")) {
      pendingCount += 1;
    }
  }

  let result = "";
  result += `Migrations: ${appliedCount} applied, ${pendingCount} pending\n`;

  if (latestMigration !== "") {
    result += `Latest: ${latestMigration}\n`;
  }

  return result.trim();
}

// RTK: js/prisma_cmd.rs::filter_migrate_deploy — count deployed migrations / errors.
function filterMigrateDeploy(output: string): string {
  let deployed = 0;
  const errors: string[] = [];

  for (const line of output.split("\n")) {
    if (line.includes("applied") || line.includes("✓")) {
      deployed += 1;
    }
    if (line.includes("error") || line.includes("ERROR")) {
      errors.push(line.trim());
    }
  }

  let result = "";

  if (errors.length === 0) {
    result += `${deployed} migration(s) deployed\n`;
  } else {
    result += "[FAIL] Deployment failed:\n";
    // Every migration error is shown — a failed deploy's errors are exactly the
    // evidence the agent needs, never silently capped at 5 (audit #25).
    for (const err of errors) {
      result += `  ${err}\n`;
    }
  }

  return result.trim();
}

// RTK: js/prisma_cmd.rs::filter_db_push — count created tables / modified columns / drops.
function filterDbPush(output: string): string {
  let tablesAdded = 0;
  let columnsModified = 0;
  let dropped = 0;

  for (const line of output.split("\n")) {
    if (line.includes("CREATE TABLE")) {
      tablesAdded += 1;
    }
    if (line.includes("ALTER") || line.includes("ADD COLUMN")) {
      columnsModified += 1;
    }
    if (line.includes("DROP")) {
      dropped += 1;
    }
  }

  let result = "";
  result += "Schema pushed to database\n";

  if (tablesAdded > 0 || columnsModified > 0 || dropped > 0) {
    result += `  + ${tablesAdded} tables, ~ ${columnsModified} columns, - ${dropped} dropped\n`;
  }

  return result.trim();
}

function formatPrisma(raw: RawResult, command: ParsedCommand): string {
  const mode = detectMode(command.args);
  const output = rawText(raw);
  switch (mode) {
    case "generate":
      return `${filterPrismaGenerate(output)}\n`;
    case "migrate-dev":
      return `${filterMigrateDev(output)}\n`;
    case "migrate-status":
      return `${filterMigrateStatus(output)}\n`;
    case "migrate-deploy":
      return `${filterMigrateDeploy(output)}\n`;
    case "db-push":
      return `${filterDbPush(output)}\n`;
    default:
      // Unknown subcommand: pass through unchanged (RTK only routes the cases above).
      return output;
  }
}

export const prismaHandler = defineHandler({
  name: "prisma",
  programs: ["prisma"],
  match(command) {
    return command.program === "prisma";
  },
  format: (raw, command, options: TkOptions) => {
    return formatPrisma(raw, command);
  },
});
