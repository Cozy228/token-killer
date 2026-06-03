import { describe, expect, test } from "vitest";

import {
  collectMigrationGapsForSource,
  formatMigrationGapReport,
  rtkDomainModules,
  rtkExtendedCommandExpectations,
} from "../../helpers/rtkParityManifest.js";

const migrationModules = [
  ...new Set([
    ...rtkDomainModules.map((module) => module.rtkSource),
    ...rtkExtendedCommandExpectations.map((module) => module.rtkSource),
  ]),
].map((rtkSource) => ({
  rtkSource,
  label: rtkSource,
}));

describe("RTK module migration", () => {
  test.each(migrationModules)(
    "$label has dedicated routing and handler tests",
    ({ rtkSource }) => {
      const gaps = collectMigrationGapsForSource(rtkSource);

      expect(gaps, formatMigrationGapReport(gaps)).toEqual([]);
    },
  );
});
