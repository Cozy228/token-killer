import type { CommandHandler } from "../types.js";
import { readLikeHandler } from "./common/readLike.js";
import { listLikeHandler } from "./common/listLike.js";
import { searchLikeHandler } from "./common/searchLike.js";
import { diffHandler } from "./common/diff.js";
import { gitStatusHandler } from "./git/status.js";
import { gitDiffHandler } from "./git/diff.js";
import { gitLogHandler } from "./git/log.js";
import { gitShowHandler } from "./git/show.js";
import { gitBranchHandler } from "./git/branch.js";
import { gitExtendedHandlers } from "./git/extended.js";
import { ghHandler, glabHandler } from "./git/hostingCli.js";
import { gtHandler } from "./git/graphite.js";
import { pytestHandler } from "./python/pytest.js";
import { ruffHandler } from "./python/ruff.js";
import { mypyHandler } from "./python/mypy.js";
import { pipHandler } from "./python/pip.js";
import { jsTestHandler } from "./js/test.js";
import { eslintHandler } from "./js/eslint.js";
import { tscHandler } from "./js/tsc.js";
import { nextHandler } from "./js/next.js";
import { npmHandler } from "./js/npm.js";
import { packageListHandler } from "./js/packageList.js";
import { prismaHandler } from "./js/prisma.js";
import { prettierHandler } from "./js/prettier.js";
import { playwrightHandler } from "./js/playwright.js";
import { mavenHandler } from "./java/maven.js";
import { gradleHandler } from "./java/gradle.js";
import { javacHandler } from "./java/javac.js";
import { curlHandler } from "./cloud/curl.js";
import { awsHandler } from "./cloud/aws.js";
import { psqlHandler } from "./cloud/psql.js";
import { wgetHandler } from "./cloud/wget.js";
import { dockerHandler, kubectlHandler } from "./cloud/container.js";
import { lsHandler } from "./system/ls.js";
import { treeHandler } from "./system/tree.js";
import { readHandler } from "./system/read.js";
import { wcHandler } from "./system/wc.js";
import { envHandler } from "./system/env.js";
import { jsonHandler } from "./system/json.js";
import { logHandler } from "./system/log.js";
import { formatHandler } from "./system/format.js";
import { pipeHandler } from "./system/pipe.js";
import { genericHandler } from "./generic.js";

export const handlers: CommandHandler[] = [
  lsHandler,
  treeHandler,
  readHandler,
  readLikeHandler,
  listLikeHandler,
  searchLikeHandler,
  diffHandler,
  gitStatusHandler,
  gitDiffHandler,
  gitLogHandler,
  gitShowHandler,
  gitBranchHandler,
  ...gitExtendedHandlers,
  ghHandler,
  glabHandler,
  gtHandler,
  formatHandler,
  pytestHandler,
  ruffHandler,
  mypyHandler,
  pipHandler,
  jsTestHandler,
  eslintHandler,
  tscHandler,
  nextHandler,
  npmHandler,
  packageListHandler,
  prismaHandler,
  prettierHandler,
  playwrightHandler,
  mavenHandler,
  gradleHandler,
  javacHandler,
  curlHandler,
  awsHandler,
  psqlHandler,
  wgetHandler,
  dockerHandler,
  kubectlHandler,
  wcHandler,
  envHandler,
  jsonHandler,
  logHandler,
  pipeHandler,
  genericHandler,
];
