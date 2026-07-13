/**
 * `ctx guide` — start the loopback server, print the one-time link, open the browser,
 * and stay in the foreground until Ctrl-C.
 *
 * No daemon and no background process, deliberately: a `ctx guide` you forgot about is a
 * store handle you forgot about. When the terminal that started it goes away, it goes.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { assertNoEgress } from "@contexa/core";
import { APP_MISSING_MESSAGE, resolveAppDir } from "./assets.ts";
import { openInBrowser } from "./open.ts";
import { startGuideServer } from "./server.ts";

export interface GuideIo {
  out: (line: string) => void;
  err?: (line: string) => void;
  home?: string;
  projectDir?: string;
}

export interface GuideCommandOptions {
  /** `--no-open`: print the link, never spawn a browser (headless, CI, agents). */
  noOpen?: boolean;
  /** Test seam. Defaults to the shipped/built SPA bundle. */
  appDir?: string;
  /** Test seam: resolve immediately instead of waiting for Ctrl-C. */
  waitForShutdown?: (server: { close: () => Promise<void> }) => Promise<void>;
}

export async function cmdGuide(io: GuideIo, opts: GuideCommandOptions = {}): Promise<number> {
  // Armed at the entry point, as at every other serving entry point (`ctx mcp`): ctx
  // spends zero model tokens, and refuses to coexist with a key that could.
  assertNoEgress();

  const err = io.err ?? io.out;
  const appDir = opts.appDir ?? resolveAppDir();
  if (appDir === undefined || !existsSync(join(appDir, "index.html"))) {
    err(APP_MISSING_MESSAGE);
    return 1;
  }

  const server = await startGuideServer({
    appDir,
    ...(io.projectDir !== undefined ? { projectDir: io.projectDir } : {}),
    ...(io.home !== undefined ? { home: io.home } : {}),
  });

  io.out(`ctx guide: serving ${server.origin} (127.0.0.1 only)`);
  io.out("");
  io.out(`  ${server.url}`);
  io.out("");
  io.out("The link carries a one-time token for this run; opening it sets a session cookie.");
  io.out("No route answers without it. Press Ctrl-C to stop.");

  const opened = opts.noOpen === true ? false : openInBrowser(server.url);
  if (!opened) io.out("Not opening a browser — paste the link above.");

  await (opts.waitForShutdown ?? waitForCtrlC)(server);
  return 0;
}

/** Resolve on the first SIGINT/SIGTERM, then close the server. Nothing is left running. */
async function waitForCtrlC(server: { close: () => Promise<void> }): Promise<void> {
  await new Promise<void>((done) => {
    const stop = (): void => {
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
      done();
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
  await server.close();
}
