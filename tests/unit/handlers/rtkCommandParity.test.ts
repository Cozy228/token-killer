import { describe, expect, test } from "vitest";

import {
  parsed,
  rtkDomainModules,
  rtkExtendedCommandExpectations,
} from "../../helpers/rtkParityManifest.js";
import { routeCommand } from "../../../src/router.js";

const commandExpectations = [
  ...rtkDomainModules.map((module) => ({
    rtkSource: module.rtkSource,
    command: module.command,
    expectedHandler: module.expectedHandler,
  })),
  ...rtkExtendedCommandExpectations,
];

describe("RTK command routing parity", () => {
  test.each(commandExpectations)(
    "$rtkSource routes $command to dedicated handler $expectedHandler",
    ({ command, expectedHandler }) => {
      const handler = routeCommand(parsed(command));

      expect(handler.name).toBe(expectedHandler);
      expect(handler.name).not.toBe("generic");
    },
  );
});
