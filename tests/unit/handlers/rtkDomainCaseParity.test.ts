import { describe, expect, test } from "vitest";

import {
  collectMigrationGapsForSource,
  formatMigrationGapReport,
  rtkDomainModules,
  rtkExtendedCommandExpectations,
} from "../../helpers/rtkParityManifest.js";

const migrationModules = [
  ...rtkDomainModules.map((module) => ({
    rtkSource: module.rtkSource,
    label: module.rtkSource,
  })),
  ...rtkExtendedCommandExpectations.map((module) => ({
    rtkSource: module.rtkSource,
    label: module.rtkSource,
  })),
];

describe("RTK module migration", () => {
  test.each(migrationModules)(
    "$label has dedicated routing and handler tests",
    ({ rtkSource }) => {
      const gaps = collectMigrationGapsForSource(rtkSource);

      expect(gaps, formatMigrationGapReport(gaps)).toEqual([]);
    },
  );
});
