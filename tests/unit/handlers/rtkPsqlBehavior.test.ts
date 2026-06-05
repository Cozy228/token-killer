import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

// Faithful parity port of rtk/src/cmds/cloud/psql_cmd.rs. Each test mirrors a
// specific #[test] (or pair of #[test]s) in that module so green proves RTK's
// table/expanded detection, padding/border stripping, (N rows) stripping, the
// CAP_LIST=20 overflow caps, and the *_token_savings invariants.
//
// CAP_LIST = 20 (rtk/src/core/truncate.rs) → MAX_TABLE_ROWS = MAX_EXPANDED_RECORDS = 20.

describe("RTK psql behavior", () => {
  // RTK: psql_cmd.rs::test_filter_table_basic + test_snapshot_table_format +
  // test_filter_psql_routes_to_table — aligned table is detected by its "-+-"
  // separator, padding is trimmed, borders + (N rows) footer dropped, columns
  // joined with tabs, header retained.
  test("table format: trims padding, strips borders + (N rows), emits tab-separated rows", async () => {
    const result = await filterRtkOutput(
      ["psql", "-c", "select * from users"],
      [
        " id | name  | email          | status   | created_at          | role",
        "----+-------+----------------+----------+---------------------+-----------",
        "  1 | alice | alice@b.com    | active   | 2024-01-01 09:00:00 | admin",
        "  2 | bob   | bob@b.com      | active   | 2024-01-02 10:15:00 | user",
        "  3 | carol | carol@b.com    | inactive | 2024-01-03 11:30:00 | user",
        "(3 rows)",
      ].join("\n"),
    );

    expectRtkParity(result, {
      critical: ["id\tname\temail", "1\talice\talice@b.com", "2\tbob\tbob@b.com"],
      forbidden: [/----\+----/, /-\+-/, /\(3 rows\)/, / {2}\| /],
    });
  });

  // RTK: psql_cmd.rs::test_filter_psql_routes_to_table — exact tab-separated
  // shape for a minimal table, also covering test_filter_table_strips_row_count.
  test("table format: exact compact shape with header + single data row", async () => {
    const result = await filterRtkOutput(
      ["psql", "-c", "select id, name from t"],
      [
        " id |  name   | description",
        "----+---------+-------------------------------",
        "  1 | foo bar | the first row in the table",
        "(1 row)",
      ].join("\n"),
    );

    expectRtkParity(result, {
      critical: ["id\tname\tdescription"],
      forbidden: [/----/, /\(1 row\)/],
      exact: ["id\tname\tdescription", "1\tfoo bar\tthe first row in the table"].join("\n"),
    });
  });

  // RTK: psql_cmd.rs::test_snapshot_expanded_format + test_filter_expanded_basic +
  // test_filter_psql_routes_to_expanded — "-[ RECORD N ]-" blocks collapse to
  // "[N] key=val ..." one-liners; record headers and (N rows) are dropped.
  test("expanded format: collapses RECORD blocks to [N] key=value one-liners", async () => {
    const result = await filterRtkOutput(
      ["psql", "-x", "-c", "select * from users"],
      [
        "-[ RECORD 1 ]-----------------------------",
        "id            | 1",
        "username      | alice_smith",
        "email         | alice@example.com",
        "status        | active",
        "-[ RECORD 2 ]-----------------------------",
        "id            | 2",
        "username      | bob_jones",
        "email         | bob@example.com",
        "status        | active",
        "(2 rows)",
      ].join("\n"),
    );

    expectRtkParity(result, {
      critical: [
        "[1] id=1 username=alice_smith email=alice@example.com status=active",
        "[2] id=2 username=bob_jones email=bob@example.com status=active",
      ],
      forbidden: [/-\[ RECORD/, /\(2 rows\)/],
    });
  });

  // RTK: psql_cmd.rs::test_filter_table_overflow — with 40 data rows the output
  // keeps the header + MAX_TABLE_ROWS (20) data rows + one overflow marker, and
  // result_lines.len() == MAX_TABLE_ROWS + 2 (1 header + 20 data + 1 overflow).
  test("table format: caps data rows at 20 and appends '... +N more rows'", async () => {
    const lines = [" id | val", "----+-----"];
    for (let i = 1; i <= 40; i += 1) {
      lines.push(`  ${i} | row${i}`);
    }
    lines.push("(40 rows)");

    const result = await filterRtkOutput(["psql", "-c", "select * from t"], lines.join("\n"));

    expect(result.output).toContain("... +20 more rows");
    // 1 header + 20 data rows + 1 overflow marker = 22 lines.
    expect(result.output.split("\n").length).toBe(22);
    expect(result.output).toContain("id\tval");
    expect(result.output).toContain("20\trow20");
    // Row 21 and beyond are dropped.
    expect(result.output).not.toContain("21\trow21");
    expectRtkParity(result, {
      critical: ["... +20 more rows", "id\tval"],
      forbidden: [/----/, /\(40 rows\)/],
    });
  });

  // RTK: psql_cmd.rs::test_filter_expanded_overflow — with 25 records the output
  // keeps 20 records and appends "... +5 more records".
  test("expanded format: caps records at 20 and appends '... +N more records'", async () => {
    const lines: string[] = [];
    for (let i = 1; i <= 25; i += 1) {
      lines.push(`-[ RECORD ${i} ]----`);
      lines.push(`id   | ${i}`);
      lines.push(`name | user${i}`);
    }

    const result = await filterRtkOutput(["psql", "-x", "-c", "select * from t"], lines.join("\n"));

    expect(result.output).toContain("... +5 more records");
    expect(result.output).toContain("[20] id=20 name=user20");
    expect(result.output).not.toContain("[21]");
    expectRtkParity(result, {
      critical: ["... +5 more records", "[1] id=1 name=user1"],
      forbidden: [/-\[ RECORD/],
    });
  });

  // RTK: psql_cmd.rs::test_table_token_savings — count_tokens (whitespace tokens)
  // savings >= 40% on a realistic 5-row, 7-column table.
  test("table format: token savings >= 40% (RTK test_table_token_savings)", async () => {
    const input =
      " id | username          | email                          | status    | created_at          | updated_at          | role\n" +
      "-------------+-------------------+--------------------------------+-----------+---------------------+---------------------+------------\n" +
      "           1 | alice_smith       | alice@example.com              | active    | 2024-01-01 09:00:00 | 2024-01-15 14:30:00 | admin\n" +
      "           2 | bob_jones         | bob.jones@company.org          | active    | 2024-01-02 10:15:00 | 2024-01-16 09:00:00 | user\n" +
      "           3 | carol_white       | carol.white@example.com        | inactive  | 2024-01-03 11:30:00 | 2024-01-17 11:00:00 | user\n" +
      "           4 | dave_brown        | dave@business.net              | active    | 2024-01-04 08:45:00 | 2024-01-18 16:00:00 | moderator\n" +
      "           5 | eve_davis         | eve.davis@example.com          | active    | 2024-01-05 13:00:00 | 2024-01-19 10:30:00 | user\n" +
      "(5 rows)\n";

    const result = await filterRtkOutput(["psql", "-c", "select * from users"], input);

    expectRtkParity(result, {
      critical: ["id\tusername\temail", "alice_smith\talice@example.com"],
      forbidden: [/----/, /\(5 rows\)/],
      // RTK asserts savings >= 40.0%.
      minTokenSavingsRatio: 0.4,
    });
  });

  // RTK: psql_cmd.rs::test_expanded_token_savings — count_tokens savings >= 60%
  // on a 2-record, 10-field expanded result.
  test("expanded format: token savings >= 60% (RTK test_expanded_token_savings)", async () => {
    const input =
      '-[ RECORD 1 ]-------------------------------\nid            | 1\nusername      | alice_smith\nemail         | alice@example.com\nstatus        | active\nrole          | admin\ncreated_at    | 2024-01-01 09:00:00\nupdated_at    | 2024-01-15 14:30:00\nlast_login    | 2024-02-01 08:00:00\nlogin_count   | 42\npreferences   | {"theme":"dark","notifications":true}\n' +
      '-[ RECORD 2 ]-------------------------------\nid            | 2\nusername      | bob_jones\nemail         | bob.jones@company.org\nstatus        | active\nrole          | user\ncreated_at    | 2024-01-02 10:15:00\nupdated_at    | 2024-01-16 09:00:00\nlast_login    | 2024-02-02 09:30:00\nlogin_count   | 17\npreferences   | {"theme":"light","notifications":false}\n(2 rows)\n';

    const result = await filterRtkOutput(["psql", "-x", "-c", "select * from users"], input);

    expectRtkParity(result, {
      critical: ["[1] id=1 username=alice_smith", "[2] id=2 username=bob_jones"],
      forbidden: [/-\[ RECORD/, /\(2 rows\)/],
      // RTK asserts savings >= 60.0%.
      minTokenSavingsRatio: 0.6,
    });
  });
});

// GAPS (documented, not asserted here):
// - test_filter_psql_passthrough (input "COPY 5\n" → unchanged): the harness
//   asserts output != raw (no unfiltered passthrough), and tk's makeFilteredResult
//   inflation gate would also bounce a tiny passthrough back to raw. RTK's pure
//   passthrough behaviour is verified directly in the Rust unit test; it cannot be
//   asserted through the no-passthrough harness without weakening it.
// - test_is_table_format_rejects_plain / test_is_expanded_format_rejects_table:
//   negative detection on tiny inputs ("SET\n") is the passthrough path above and
//   is covered by the Rust unit tests.
// - test_filter_table_empty / filter_psql_output("") == "": empty raw produces
//   empty output; the harness has no empty-input affordance, so this is covered by
//   the Rust unit test only.
