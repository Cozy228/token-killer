import type { CommandHandler } from "../types.js";
import { readLikeHandler } from "./common/readLike.js";
import { listLikeHandler } from "./common/listLike.js";
import { searchLikeHandler } from "./common/searchLike.js";
import { gitStatusHandler } from "./git/status.js";
import { gitDiffHandler } from "./git/diff.js";
import { gitLogHandler } from "./git/log.js";
import { gitShowHandler } from "./git/show.js";
import { gitBranchHandler } from "./git/branch.js";
import { pytestHandler } from "./python/pytest.js";
import { ruffHandler } from "./python/ruff.js";
import { mypyHandler } from "./python/mypy.js";
import { pipHandler } from "./python/pip.js";
import { jsTestHandler } from "./js/test.js";
import { eslintHandler } from "./js/eslint.js";
import { tscHandler } from "./js/tsc.js";
import { packageListHandler } from "./js/packageList.js";
import { mavenHandler } from "./java/maven.js";
import { gradleHandler } from "./java/gradle.js";
import { javacHandler } from "./java/javac.js";
import { genericHandler } from "./generic.js";

export const handlers: CommandHandler[] = [
  readLikeHandler,
  listLikeHandler,
  searchLikeHandler,
  gitStatusHandler,
  gitDiffHandler,
  gitLogHandler,
  gitShowHandler,
  gitBranchHandler,
  pytestHandler,
  ruffHandler,
  mypyHandler,
  pipHandler,
  jsTestHandler,
  eslintHandler,
  tscHandler,
  packageListHandler,
  mavenHandler,
  gradleHandler,
  javacHandler,
  genericHandler,
];
